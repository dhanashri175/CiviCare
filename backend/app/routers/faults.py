# faults.py — CiviCare v5: Pipeline Fault Detector

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.database import get_db
from app.models.models import Complaint, ComplaintStatus, FaultAlert, User, UserRole, Ward
from app.routers.auth import get_current_user
from app.config import settings

# ✅ SAFE IMPORT (prevents server crash)
try:
    from google import genai
except ImportError:
    genai = None

router = APIRouter()

# Thresholds for fault detection
FAULT_THRESHOLDS = {
    "pipe_burst":   {"count": 2, "hours": 6,  "severity": "critical"},
    "no_supply":    {"count": 4, "hours": 12, "severity": "moderate"},
    "dirty_water":  {"count": 3, "hours": 12, "severity": "moderate"},
    "low_pressure": {"count": 5, "hours": 24, "severity": "watch"},
    "other":        {"count": 6, "hours": 24, "severity": "watch"},
}

SEVERITY_ORDER = {"critical": 3, "moderate": 2, "watch": 1}


def generate_ai_summary(ward_name: str, complaint_type: str, count: int,
                        unique_citizens: int, hours: int, severity: str) -> str:
    """Gemini AI summary — falls back to rule-based if unavailable."""
    type_label = complaint_type.replace("_", " ")

    if genai is not None and settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
        try:
            client = genai.Client(
                api_key=settings.GEMINI_API_KEY,
                http_options={"api_version": "v1"}
            )

            prompt = (
                "You are CiviCare, an AI system for Phaltan Municipal Council water management.\n\n"
                "Generate a SHORT (1-2 sentence) alert message for an officer about this detected fault:\n"
                f"- Ward: {ward_name}\n"
                f"- Issue type: {type_label}\n"
                f"- Complaints received: {count} from {unique_citizens} different citizens\n"
                f"- Time window: last {hours} hours\n"
                f"- Severity: {severity}\n\n"
                "Be direct and actionable. Mention likely cause and recommended action.\n"
                "Write in English. Keep under 30 words. No bullet points. Plain text only."
            )

            response = client.models.generate_content(
                model="models/gemini-2.5-flash",
                contents=[{"role": "user", "parts": [{"text": prompt}]}],
                config={"temperature": 0.3, "max_output_tokens": 556}
            )

            try:
                summary = response.candidates[0].content.parts[0].text.strip()
            except (IndexError, AttributeError):
                try:
                    summary = response.text.strip()
                except Exception:
                    summary = None

            if summary:
                print(f"[Gemini] ✅ AI summary for {ward_name} - {complaint_type}: {summary}")
                return summary

        except Exception as e:
            print(f"[Gemini] ❌ Error generating AI summary: {e}")

    # Rule-based fallback
    print(f"[Rule-based] Using fallback summary for {ward_name} - {complaint_type}")
    action = {
        "pipe_burst":   "Dispatch plumber immediately — possible main line rupture.",
        "no_supply":    "Check pump station and main valve — supply disruption detected.",
        "dirty_water":  "Inspect source and chlorination — contamination risk.",
        "low_pressure": "Check pump pressure and valve positions.",
    }.get(complaint_type, "Investigate infrastructure in this area.")

    return (
        f"{count} {type_label} complaints from {unique_citizens} citizens "
        f"in {ward_name} in {hours}h. {action}"
    )


# -------------------- AI Test Endpoint --------------------

@router.get("/test-ai")
def test_ai(current_user: User = Depends(get_current_user)):
    """Quick Gemini connectivity test. Hit GET /api/faults/test-ai to verify AI is working."""
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(status_code=403, detail="Officers only")

    if genai is None:
        return {"source": "error", "message": "google-genai package not installed"}

    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        return {"source": "error", "message": "GEMINI_API_KEY not configured"}

    try:
        client = genai.Client(
            api_key=settings.GEMINI_API_KEY,
            http_options={"api_version": "v1"}
        )

        response = client.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=[{"role": "user", "parts": [{"text": "Reply with exactly: CiviCare AI is working."}]}],
            config={"temperature": 0, "max_output_tokens": 32}
        )

        try:
            text = response.candidates[0].content.parts[0].text.strip()
        except (IndexError, AttributeError):
            text = response.text.strip()

        return {"source": "gemini", "message": text}

    except Exception as e:
        return {"source": "error", "message": str(e)}


# -------------------- Fault Detection --------------------

@router.post("/detect")
def detect_faults(db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    """Run fault detection across all wards — called by officer or auto-triggered."""
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(status_code=403, detail="Officers only")

    wards = db.query(Ward).all()
    new_alerts = []

    for ward in wards:
        for ctype, threshold in FAULT_THRESHOLDS.items():
            cutoff = datetime.now(timezone.utc) - timedelta(hours=threshold["hours"])

            complaints = db.query(Complaint).filter(
                Complaint.ward_id == ward.id,
                Complaint.complaint_type == ctype,
                Complaint.status != ComplaintStatus.resolved,
                Complaint.created_at >= cutoff
            ).all()

            if len(complaints) < threshold["count"]:
                continue

            unique_citizens = len(set(c.user_id for c in complaints))

            # Don't duplicate active unresolved alert for same ward+type
            existing = db.query(FaultAlert).filter(
                FaultAlert.ward_id == ward.id,
                FaultAlert.complaint_type == ctype,
                FaultAlert.is_dismissed == False,
                FaultAlert.resolved == False,
                FaultAlert.created_at >= cutoff
            ).first()
            if existing:
                if existing.complaint_count < len(complaints):
                    existing.complaint_count = len(complaints)
                    existing.unique_citizens = unique_citizens
                    db.commit()
                continue

            # Boost severity if many unique citizens
            severity = threshold["severity"]
            if unique_citizens >= 5 and severity != "critical":
                severity = "critical"

            summary = generate_ai_summary(
                ward.ward_name, ctype, len(complaints),
                unique_citizens, threshold["hours"], severity
            )

            alert = FaultAlert(
                ward_id=ward.id,
                complaint_type=ctype,
                complaint_count=len(complaints),
                unique_citizens=unique_citizens,
                severity=severity,
                time_window_h=threshold["hours"],
                ai_summary=summary,
            )
            db.add(alert)
            new_alerts.append({
                "ward":     ward.ward_name,
                "type":     ctype,
                "count":    len(complaints),
                "severity": severity,
            })

    db.commit()
    return {
        "message": f"Detection complete. {len(new_alerts)} new alert(s) raised.",
        "new_alerts": new_alerts
    }


@router.get("/active")
def get_active_faults(db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Get all active (non-dismissed, non-resolved) fault alerts for officer."""
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(status_code=403, detail="Officers only")

    alerts = db.query(FaultAlert).filter(
        FaultAlert.is_dismissed == False,
        FaultAlert.resolved == False
    ).order_by(FaultAlert.created_at.desc()).all()

    result = []
    for a in alerts:
        ward = db.query(Ward).filter(Ward.id == a.ward_id).first()
        result.append({
            "id":              a.id,
            "ward_id":         a.ward_id,
            "ward_name":       ward.ward_name if ward else f"Ward {a.ward_id}",
            "ward_no":         ward.ward_no if ward else a.ward_id,
            "complaint_type":  a.complaint_type,
            "complaint_count": a.complaint_count,
            "unique_citizens": a.unique_citizens,
            "severity":        a.severity,
            "time_window_h":   a.time_window_h,
            "ai_summary":      a.ai_summary,
            "created_at":      a.created_at.isoformat() if a.created_at else None,
        })

    result.sort(key=lambda x: SEVERITY_ORDER.get(x["severity"], 0), reverse=True)
    return result


@router.post("/dismiss/{alert_id}")
def dismiss_fault(alert_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(status_code=403, detail="Officers only")
    alert = db.query(FaultAlert).filter(FaultAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_dismissed = True
    alert.dismissed_by = current_user.id
    db.commit()
    return {"message": "Alert dismissed"}


@router.post("/resolve/{alert_id}")
def resolve_fault(alert_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(status_code=403, detail="Officers only")
    alert = db.query(FaultAlert).filter(FaultAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.resolved = True
    db.commit()
    return {"message": "Alert marked resolved"}
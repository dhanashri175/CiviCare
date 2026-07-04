# announcements.py — CiviCare v5 (Fixed & Production Safe)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta

from app.database import get_db
from app.models.models import Announcement, User, UserRole, Ward
from app.routers.auth import get_current_user
from app.config import settings

# ✅ SAFE IMPORT (prevents server crash)
try:
    from google import genai
except ImportError:
    genai = None

router = APIRouter()


# -------------------- Schemas --------------------

class AnnouncementCreate(BaseModel):
    title: str
    message: str
    target_wards: str = "all"
    ann_type: str = "general"
    send_sms: bool = False


class AISuggestRequest(BaseModel):
    ward_id:  Optional[int] = None
    ann_type: Optional[str] = None   # water_supply | maintenance | billing | fault | general
    context:  Optional[str] = None


# -------------------- Routes --------------------

@router.get("/")
def get_announcements(ward_id: Optional[int] = None, db: Session = Depends(get_db)):
    anns = db.query(Announcement).order_by(Announcement.created_at.desc()).limit(20).all()

    if ward_id:
        anns = [
            a for a in anns
            if a.target_wards == "all" or str(ward_id) in a.target_wards.split(",")
        ]

    return anns


@router.post("/")
def create_announcement(
    req: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(status_code=403, detail="Officers only")

    sms_sent = False
    sms_count = 0

    # -------------------- SMS Sending --------------------
    if req.send_sms and settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
        try:
            from twilio.rest import Client

            client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

            q = db.query(User).filter(
                User.role == "citizen",
                User.phone != None,
                User.is_active == True
            )

            if req.target_wards != "all":
                ward_ids = [
                    int(w) for w in req.target_wards.split(",") if w.strip().isdigit()
                ]
                q = q.filter(User.ward_id.in_(ward_ids))

            citizens = q.all()

            # Helper function to format numbers
            def format_indian_number(number: str) -> str:
                cleaned = ''.join(filter(str.isdigit, number))
                if cleaned.startswith('0'):
                    cleaned = cleaned[1:]
                if len(cleaned) != 10:
                    raise ValueError(f"Invalid Indian phone number: {number}")
                return f"+91{cleaned}"

            # --- SMS loop ---
            sms_body = f"[CiviCare] {req.title}\n{req.message}\n- Phaltan Municipal Council"

            for citizen in citizens:
                if citizen.phone:
                    try:
                        to_number = format_indian_number(citizen.phone)
                        client.messages.create(
                            body=sms_body,
                            from_=settings.TWILIO_PHONE_NUMBER,
                            to=to_number
                        )
                        sms_count += 1
                    except Exception as e:
                        print(f"⚠️ Failed to send SMS to {citizen.phone}: {e}")

            sms_sent = True

        except Exception as e:
            print(f"Twilio error: {e}")

    # -------------------- Save Announcement --------------------
    ann = Announcement(
        officer_id=current_user.id,
        title=req.title,
        message=req.message,
        target_wards=req.target_wards,
        ann_type=req.ann_type,
        sms_sent=sms_sent,
        sms_count=sms_count
    )

    db.add(ann)
    db.commit()
    db.refresh(ann)

    return {
        "announcement": ann,
        "sms_sent": sms_sent,
        "sms_count": sms_count
    }


def call_gemini_suggest(context_str: str, ward_name, ann_type: str) -> dict | None:
    """Gemini call for announcement suggestion. Returns dict or None on failure."""
    import json, re
    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY, http_options={"api_version": "v1"})

        type_instructions = {
            "water_supply": "Write about water supply timing, no supply, shortage, or restoration. Mention supply schedule if relevant.",
            "maintenance":  "Write about scheduled pipeline maintenance, shutdown duration, and expected restoration time.",
            "billing":      "Write a payment reminder — mention due date (March 31), arrears consequence, and how to pay.",
            "fault":        "Write an urgent notice about infrastructure fault (pipe burst, contamination, pressure issue). Mention helpline 1916.",
            "general":      "Write a general civic notice relevant to the ward data provided.",
        }
        focus = type_instructions.get(ann_type, type_instructions["general"])

        ann_type_label = ann_type.upper().replace("_", " ")

        # ✅ FIX 3: Stricter prompt — prevents verbose openers and enforces JSON-only output
        prompt = (
            "You are a municipal officer for Phaltan Municipal Council water department.\n"
            f"Announcement type: {ann_type_label}\n"
            f"Instruction: {focus}\n\n"
            "Ward data:\n"
            f"{context_str}\n\n"
            "Return ONLY valid JSON, nothing else. No markdown. No preamble. No extra text.\n"
            "Format:\n"
            '{"title": "max 10 word title", "message": "2-3 sentence message"}\n'
            "Rules:\n"
            "- message must be under 60 words\n"
            "- do NOT start message with 'Dear residents'\n"
            "- mention ward name, state issue, state next steps\n"
            "- tone: official, concise, natural Indian English\n"
            "- output ONLY the JSON object, nothing before or after it"
        )

        # ✅ FIX 1: Increased max_output_tokens to 2048 to prevent truncation
        response = client.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config={"temperature": 0.5, "max_output_tokens": 2048}
        )

        try:
            text = response.candidates[0].content.parts[0].text.strip()
        except (IndexError, AttributeError):
            try:
                text = response.text.strip()
            except Exception:
                print("RAW GEMINI: could not extract text, response:", response)
                return None

        print("RAW GEMINI SUGGEST:", repr(text))

        # Strip markdown fences if present
        text = re.sub(r"```json|```", "", text).strip()
        text = text.replace("\u200b", "")

        first_brace = text.find("{")
        last_brace = text.rfind("}")

        # ✅ FIX 2: Guard against missing or truncated JSON
        if first_brace == -1 or last_brace == -1:
            print("RAW GEMINI: no JSON braces found — response may be truncated or malformed")
            return None

        json_text = text[first_brace:last_brace + 1]

        if not json_text.endswith("}"):
            print("RAW GEMINI: JSON appears truncated, no closing brace")
            return None

        json_text = re.sub(r",\s*}$", "}", json_text)
        print("JSON TO PARSE:", repr(json_text))
        result = json.loads(json_text)

        if ward_name and "message" in result:
            result["message"] = result["message"].replace("the ward", ward_name).replace("your ward", ward_name)

        return result

    except Exception as e:
        print(f"Gemini suggest error: {e}")
        return None


@router.post("/ai-suggest")
def ai_suggest_announcement(
    req: AISuggestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(status_code=403, detail="Officers only")

    from app.models.models import Complaint, Ward, SupplyLog, FaultAlert, SupplyStatus

    ward_name = None
    ward = None
    if req.ward_id:
        ward = db.query(Ward).filter(Ward.id == req.ward_id).first()
        if ward:
            ward_name = f"{ward.ward_name} (Ward {ward.ward_no})"

    # ── Today's supply status for the ward ──
    supply_info = "No supply log for today."
    if req.ward_id:
        today_log = db.query(SupplyLog).filter(
            SupplyLog.ward_id == req.ward_id,
            SupplyLog.date == str(date.today())
        ).first()
        if today_log:
            supply_info = f"Supply status: {today_log.status.value}"
            if today_log.reason:
                supply_info += f" — Reason: {today_log.reason}"
            if today_log.supply_start:
                supply_info += f" — Scheduled at: {today_log.supply_start}"

    # ── Active fault alerts for the ward ──
    fault_info = "No active fault alerts."
    fault_q = db.query(FaultAlert).filter(
        FaultAlert.resolved == False,
        FaultAlert.is_dismissed == False
    )
    if req.ward_id:
        fault_q = fault_q.filter(FaultAlert.ward_id == req.ward_id)
    faults = fault_q.order_by(FaultAlert.created_at.desc()).limit(3).all()
    if faults:
        fault_lines = [f"{f.complaint_type} ({f.severity} severity, {f.complaint_count} complaints)" for f in faults]
        fault_info = "Active faults: " + "; ".join(fault_lines)

    # ── Recent open complaints for the ward ──
    seven_ago = date.today() - timedelta(days=7)
    complaint_q = db.query(Complaint).filter(Complaint.created_at >= seven_ago)
    if req.ward_id:
        complaint_q = complaint_q.filter(Complaint.ward_id == req.ward_id)
    recent_complaints = complaint_q.all()

    type_counts = {}
    for c in recent_complaints:
        type_counts[c.complaint_type] = type_counts.get(c.complaint_type, 0) + 1
    complaint_summary = (
        ", ".join(f"{k}: {v}" for k, v in sorted(type_counts.items(), key=lambda x: -x[1]))
        if type_counts else "No recent complaints."
    )

    # ── Additional officer context ──
    extra = f"Officer note: {req.context}" if req.context else ""

    context_str = f"""Ward: {ward_name or 'All Wards'}
{supply_info}
{fault_info}
Recent complaints (last 7 days): {complaint_summary}
{extra}""".strip()

    if genai is not None and settings.GEMINI_API_KEY:
        result = call_gemini_suggest(context_str, ward_name, req.ann_type or "general")
        if result:
            result["suggested_target_wards"] = str(req.ward_id) if req.ward_id else "all"
            return result

    raise HTTPException(status_code=503, detail="AI suggestion unavailable. Please write the announcement manually.")
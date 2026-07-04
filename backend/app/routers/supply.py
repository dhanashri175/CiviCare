# supply.py — CiviCare v4.3 — multi-ward selection support
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import date, timedelta
from app.database import get_db
from app.models.models import SupplyLog, SupplyStatus, User, Ward, DamLevel, Announcement
from app.routers.auth import get_current_user

router = APIRouter()

class SupplyLogCreate(BaseModel):
    ward_ids: List[int]          # now accepts multiple wards
    date: str
    supply_start: Optional[str] = None
    supply_duration: Optional[int] = None
    status: SupplyStatus
    reason: Optional[str] = None

@router.post("/log")
def log_supply(req: SupplyLogCreate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    if current_user.role not in ["officer", "admin"]:
        raise HTTPException(status_code=403, detail="Officers only")
    if not req.ward_ids:
        raise HTTPException(status_code=400, detail="At least one ward required")
    logged = []
    for ward_id in req.ward_ids:
        existing = db.query(SupplyLog).filter(
            SupplyLog.ward_id == ward_id, SupplyLog.date == req.date
        ).first()
        if existing:
            existing.supply_start    = req.supply_start
            existing.supply_duration = req.supply_duration
            existing.status          = req.status
            existing.reason          = req.reason
            existing.officer_id      = current_user.id
            logged.append(ward_id)
        else:
            db.add(SupplyLog(
                ward_id=ward_id, date=req.date,
                supply_start=req.supply_start, supply_duration=req.supply_duration,
                status=req.status, reason=req.reason, officer_id=current_user.id
            ))
            logged.append(ward_id)
    db.commit()
    return {"message": f"Supply logged for {len(logged)} ward(s)", "ward_ids": logged}

@router.get("/today")
def get_today(db: Session = Depends(get_db)):
    today = str(date.today())
    logs  = db.query(SupplyLog).filter(SupplyLog.date == today).all()
    wards = db.query(Ward).order_by(Ward.ward_no).all()
    logged = {l.ward_id: l for l in logs}
    return [{
        "ward_id": w.id, "ward_no": w.ward_no,
        "ward_name": w.ward_name, "area_name": w.area_name,
        "status": logged[w.id].status if w.id in logged else "not_logged",
        "supply_start": logged[w.id].supply_start if w.id in logged else None,
        "supply_duration": logged[w.id].supply_duration if w.id in logged else None,
        "reason": logged[w.id].reason if w.id in logged else None
    } for w in wards]

@router.get("/ward/{ward_id}/history")
def get_history(ward_id: int, days: int = 30, db: Session = Depends(get_db)):
    start = str(date.today() - timedelta(days=days))
    logs  = db.query(SupplyLog).filter(
        SupplyLog.ward_id == ward_id, SupplyLog.date >= start
    ).order_by(SupplyLog.date.desc()).all()
    supplied = sum(1 for l in logs if l.status == "supplied")
    rate     = supplied / days if days > 0 else 0
    stress   = "green" if rate >= 0.85 else ("yellow" if rate >= 0.6 else "red")
    return {
        "ward_id": ward_id, "days_checked": days,
        "days_supplied": supplied, "supply_score": round(rate * 100, 1),
        "stress_level": stress,
        "logs": [{"date":l.date,"status":l.status,"reason":l.reason,
                  "supply_start":l.supply_start,"supply_duration":l.supply_duration} for l in logs]
    }

@router.get("/announcements")
def get_announcements(ward_id: Optional[int] = None, db: Session = Depends(get_db)):
    anns = db.query(Announcement).order_by(Announcement.created_at.desc()).limit(20).all()
    if ward_id:
        def matches(a):
            if a.target_wards == "all":
                return True
            # Exact match on comma-split tokens to avoid "1" matching "10","11","12"
            tokens = [t.strip() for t in a.target_wards.split(",")]
            return str(ward_id) in tokens
        anns = [a for a in anns if matches(a)]
    return anns

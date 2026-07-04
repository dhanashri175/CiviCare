# complaints.py — CiviCare v4.3
# Only infra complaints assigned to plumber
# Officer sees assigned plumber name
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from app.database import get_db
from app.models.models import Complaint, ComplaintType, ComplaintStatus, User, UserRole
from app.routers.auth import get_current_user

router = APIRouter()

# Only these types are assigned to plumbers — infrastructure issues
INFRA_TYPES = {ComplaintType.pipe_burst, ComplaintType.no_supply,
               ComplaintType.low_pressure, ComplaintType.dirty_water}

PRIORITY_MAP = {"pipe_burst":5,"dirty_water":4,"no_supply":4,
                "low_pressure":3,"billing_issue":2,"other":2}
URGENT_KEYWORDS = ["urgent","emergency","children","hospital","burst","gushing",
                   "since days","sick","flooding","days","week"]
SLA_HOURS = {"pipe_burst":4,"dirty_water":8,"no_supply":12,
             "low_pressure":24,"billing_issue":72,"other":48}

def score_priority(ctype, desc):
    base  = PRIORITY_MAP.get(ctype, 2)
    boost = sum(1 for k in URGENT_KEYWORDS if k in desc.lower())
    return min(5, base + min(2, boost))

class ComplaintCreate(BaseModel):
    complaint_type: ComplaintType
    description: str
    photo_url: Optional[str] = None
    connection_id: Optional[int] = None

class ComplaintUpdate(BaseModel):
    status: ComplaintStatus
    assigned_to: Optional[int] = None
    resolution_note: Optional[str] = None
    officer_note: Optional[str] = None  # for non-infra complaints answered by officer

class DuplicateCheckRequest(BaseModel):
    complaint_type: str
    ward_id: int

@router.get("/types")
def get_types():
    return {
        "types": [{"value":t.value,"label":t.value.replace("_"," ").title()} for t in ComplaintType],
        "sla_hours": SLA_HOURS,
        "plumber_assignable": [t.value for t in INFRA_TYPES],
    }

@router.post("/duplicate-check")
def check_duplicate(req: DuplicateCheckRequest, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=72)
    similar = db.query(Complaint).filter(
        Complaint.ward_id == req.ward_id,
        Complaint.complaint_type == req.complaint_type,
        Complaint.status != ComplaintStatus.resolved,
        Complaint.created_at >= cutoff
    ).order_by(Complaint.created_at.desc()).limit(3).all()
    if not similar:
        return {"is_duplicate": False, "message": None, "similar_complaints": []}
    type_label = req.complaint_type.replace("_", " ").title()
    return {
        "is_duplicate": True,
        "message": f"⚠️ {len(similar)} similar '{type_label}' complaint(s) already filed in your ward in the last 72 hours.",
        "similar_complaints": [{"id":c.id,"work_order_no":c.work_order_no,
                                  "status":c.status,"created_at":c.created_at} for c in similar]
    }

@router.post("/")
def create_complaint(req: ComplaintCreate, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    if not current_user.ward_id:
        raise HTTPException(status_code=400, detail="Ward not set in profile")
    priority   = score_priority(req.complaint_type.value, req.description)
    import random, string
    # Unique work order with collision retry
    for _ in range(10):
        work_order = "WO-" + "".join(random.choices(string.digits, k=6))
        if not db.query(Complaint).filter(Complaint.work_order_no == work_order).first():
            break
    c = Complaint(
        user_id=current_user.id, ward_id=current_user.ward_id,
        connection_id=req.connection_id, complaint_type=req.complaint_type,
        description=req.description, photo_url=req.photo_url,
        priority_score=priority, work_order_no=work_order,
        sla_hours=SLA_HOURS.get(req.complaint_type.value, 24),
        created_at=datetime.now(timezone.utc)
    )
    db.add(c); db.commit(); db.refresh(c)
    return _complaint_dict(c, db)

@router.get("/my")
def get_my_complaints(db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    complaints = db.query(Complaint).filter(
        Complaint.user_id == current_user.id
    ).order_by(Complaint.created_at.desc()).all()
    return [_complaint_dict(c, db) for c in complaints]

@router.get("/")
def get_complaints(ward_id: Optional[int] = None, status: Optional[str] = None,
                    db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    q = db.query(Complaint)
    if current_user.role == "citizen":
        q = q.filter(Complaint.ward_id == current_user.ward_id)
    elif current_user.role == "corporator":
        q = q.filter(Complaint.ward_id == current_user.ward_id)
    elif current_user.role == "plumber":
        # Plumber sees ONLY assigned infra complaints
        q = q.filter(
            Complaint.assigned_to == current_user.id,
            Complaint.complaint_type.in_([t for t in INFRA_TYPES])
        )
    elif ward_id:
        q = q.filter(Complaint.ward_id == ward_id)
    if status:
        q = q.filter(Complaint.status == status)
    complaints = q.order_by(Complaint.priority_score.desc(),
                             Complaint.created_at.desc()).all()
    return [_complaint_dict(c, db) for c in complaints]

@router.put("/{complaint_id}")
def update_complaint(complaint_id: int, req: ComplaintUpdate,
                      db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    if current_user.role not in ["officer", "admin", "plumber"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    c = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")

    # Plumber can only update their own assigned complaints
    if current_user.role == "plumber" and c.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Not your assigned complaint")

    # Enforce: only infra complaints can be assigned to plumber
    if req.assigned_to:
        plumber = db.query(User).filter(User.id == req.assigned_to,
                                         User.role == "plumber").first()
        if plumber and c.complaint_type not in INFRA_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Billing and 'other' complaints cannot be assigned to plumber. Handle at office level."
            )

    c.status = req.status
    if req.assigned_to:
        c.assigned_to = req.assigned_to
    if req.resolution_note:
        c.resolution_note = req.resolution_note
    if req.officer_note:
        # Append officer note to resolution note for non-infra complaints
        c.resolution_note = (c.resolution_note + " | " if c.resolution_note else "") + req.officer_note
    if req.status == ComplaintStatus.resolved:
        c.resolved_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(c)
    return _complaint_dict(c, db)

def _complaint_dict(c: Complaint, db: Session) -> dict:
    """Returns complaint with assigned plumber name included."""
    plumber_name = None
    if c.assigned_to:
        plumber = db.query(User).filter(User.id == c.assigned_to).first()
        plumber_name = plumber.name if plumber else None

    filer_name = None
    if c.user_id:
        filer = db.query(User).filter(User.id == c.user_id).first()
        filer_name = filer.name if filer else None

    return {
        "id": c.id, "complaint_type": c.complaint_type,
        "description": c.description, "photo_url": c.photo_url,
        "priority_score": c.priority_score, "status": c.status,
        "ward_id": c.ward_id, "work_order_no": c.work_order_no,
        "sla_hours": c.sla_hours, "created_at": c.created_at,
        "resolved_at": c.resolved_at, "resolution_note": c.resolution_note,
        "assigned_to": c.assigned_to,
        "assigned_plumber_name": plumber_name,
        "filed_by": filer_name,
        "is_infra": c.complaint_type in INFRA_TYPES,
        "can_assign_plumber": c.complaint_type in INFRA_TYPES,
    }

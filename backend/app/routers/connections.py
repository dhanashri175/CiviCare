# connections.py — CiviCare v7
# Correct flow:
#   applied → officer schedules inspection (or rejects with reason)
#   scheduled → officer records inspection findings + calculates charges
#   inspection → citizen pays charges online → declares payment
#   payment_pending → officer approves → active + bill generated
# Email is required and unique. Login: property_number + password.
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from datetime import datetime, date, timezone
import random

from app.database import get_db
from app.models.models import (WaterConnection, ConnectionStatus, ConnectionType,
    PipeSize, User, UserRole, Ward, Bill, BillingStatus, SystemRate)
from app.routers.auth import get_current_user, hash_password
from app.ml.billing_calculator import calculate_connection_charges, calculate_annual_bill

router = APIRouter()
MAX_DOMESTIC = 2

def gen_connection_number(db: Session) -> str:
    year = datetime.now().year
    while True:
        cn = f"PMC-{year}-{random.randint(10000,99999)}"
        if not db.query(WaterConnection).filter(WaterConnection.connection_number == cn).first():
            return cn

def count_domestic(prop: str, db: Session) -> int:
    return db.query(WaterConnection).filter(
        WaterConnection.property_number == prop,
        WaterConnection.connection_type == ConnectionType.domestic,
        WaterConnection.status.in_([
            ConnectionStatus.applied, ConnectionStatus.scheduled,
            ConnectionStatus.inspection, ConnectionStatus.payment_pending,
            ConnectionStatus.active
        ])
    ).count()

def conn_dict(c: WaterConnection) -> dict:
    return {
        "id": c.id, "connection_number": c.connection_number,
        "property_number": c.property_number, "owner_id": c.owner_id,
        "applicant_name": c.applicant_name, "applicant_phone": c.applicant_phone,
        "applicant_email": c.applicant_email, "address": c.address,
        "ward_id": c.ward_id, "connection_type": c.connection_type,
        "pipe_size": c.pipe_size, "status": c.status,
        "created_at": c.created_at, "inspection_date": c.inspection_date,
        "inspection_notes": c.inspection_notes,
        "pipe_distance_meters": c.pipe_distance_meters,
        "inspected_by": c.inspected_by,
        "aadhaar_doc_url": c.aadhaar_doc_url, "property_doc_url": c.property_doc_url,
        "rejection_reason": c.rejection_reason,
        "connected_at": c.connected_at, "approved_at": c.approved_at,
        "deposit_amount": c.deposit_amount, "fitting_charges": c.fitting_charges,
        "maintenance_charges": c.maintenance_charges,
        "pipe_distance_charges": c.pipe_distance_charges,
        "total_connection_charges": c.total_connection_charges,
        "connection_charges_paid": c.connection_charges_paid,
    }

# ── PYDANTIC ──────────────────────────────────────────────────────────────────

class ApplyRequest(BaseModel):
    ward_id:          int
    property_number:  str
    applicant_name:   str
    applicant_phone:  str
    applicant_email:  str           # required and must be unique
    address:          str
    connection_type:  ConnectionType = ConnectionType.domestic
    pipe_size:        PipeSize       = PipeSize.half
    aadhaar_doc_url:  str
    property_doc_url: str

class ScheduleRequest(BaseModel):
    connection_id:  int
    inspection_date: str            # YYYY-MM-DD
    officer_note:   Optional[str] = None

class RejectRequest(BaseModel):
    connection_id:    int
    rejection_reason: str           # required when rejecting

class InspectionRequest(BaseModel):
    connection_id:        int
    inspection_notes:     str
    pipe_size:            PipeSize
    inspection_date:      str
    pipe_distance_meters: float = 0.0

class ApprovalRequest(BaseModel):
    connection_id: int              # officer approves after citizen pays

class PayChargesRequest(BaseModel):
    connection_id: int

class CitizenDeclareChargesRequest(BaseModel):
    connection_id: int
    amount:        float

class UpdateRateRequest(BaseModel):
    rate_key:   str
    rate_value: float

# ── ENDPOINTS ─────────────────────────────────────────────────────────────────

@router.post("/apply")
def apply_connection(req: ApplyRequest, db: Session = Depends(get_db)):
    if not req.aadhaar_doc_url or not req.property_doc_url:
        raise HTTPException(400, "Aadhaar and property documents are compulsory")
    if not req.applicant_email or not req.applicant_email.strip():
        raise HTTPException(400, "Email is required")
    prop = req.property_number.strip()
    if not prop:
        raise HTTPException(400, "Property number is required")
    if not db.query(Ward).filter(Ward.id == req.ward_id).first():
        raise HTTPException(404, "Ward not found")

    if req.connection_type == ConnectionType.domestic:
        existing = count_domestic(prop, db)
        if existing >= MAX_DOMESTIC:
            raise HTTPException(400,
                f"Property '{prop}' already has {existing} domestic connection(s). "
                f"Maximum {MAX_DOMESTIC} allowed. Apply as Commercial for additional connections.")

    # Email must be unique across all users
    email = req.applicant_email.strip().lower()
    existing_user = db.query(User).filter(User.property_number == prop).first()
    if not existing_user:
        # New property — check email not taken by any other property
        email_taken = db.query(User).filter(User.email == email).first()
        if email_taken:
            raise HTTPException(400,
                f"Email '{email}' is already registered. "
                f"Please use a different email address.")
        citizen = User(
            name=req.applicant_name, property_number=prop,
            email=email, hashed_password=hash_password(prop),
            role=UserRole.citizen, ward_id=req.ward_id,
            phone=req.applicant_phone, must_change_pwd=True, is_active=True
        )
        db.add(citizen); db.flush()
    else:
        citizen = existing_user

    conn = WaterConnection(
        owner_id=citizen.id,
        ward_id=req.ward_id, property_number=prop,
        applicant_name=req.applicant_name, applicant_phone=req.applicant_phone,
        applicant_email=email, address=req.address,
        connection_type=req.connection_type, pipe_size=req.pipe_size,
        aadhaar_doc_url=req.aadhaar_doc_url, property_doc_url=req.property_doc_url,
        status=ConnectionStatus.applied
    )
    db.add(conn); db.commit(); db.refresh(conn)
    return {
        "message": "Application submitted successfully",
        "application_id": conn.id,
        "property_number": prop,
        "initial_password": prop,
        "note": f"You can log in now with property number '{prop}'. Initial password = property number.",
    }


@router.post("/schedule")
def schedule_inspection(req: ScheduleRequest, db: Session = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    """Officer schedules an inspection date for an applied connection."""
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    conn = db.query(WaterConnection).filter(WaterConnection.id == req.connection_id).first()
    if not conn:
        raise HTTPException(404, "Application not found")
    if conn.status not in [ConnectionStatus.applied, ConnectionStatus.scheduled]:
        raise HTTPException(400, f"Cannot schedule inspection for status '{conn.status}'")

    try:
        insp_dt = (datetime.fromisoformat(req.inspection_date) if "T" in req.inspection_date
                   else datetime.strptime(req.inspection_date, "%Y-%m-%d"))
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")
    if insp_dt.date() < datetime.now(timezone.utc).date():
        raise HTTPException(400, "Inspection date must be today or in the future")

    conn.inspection_date  = insp_dt
    conn.inspection_notes = req.officer_note or ""
    conn.inspected_by     = current_user.id
    conn.status           = ConnectionStatus.scheduled
    db.commit()
    return {
        "message": f"Inspection scheduled for {req.inspection_date}",
        "connection_id": conn.id,
        "inspection_date": req.inspection_date,
    }


@router.post("/reject")
def reject_application(req: RejectRequest, db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    """Officer rejects an application at any pre-active stage with a mandatory reason."""
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    if not req.rejection_reason or not req.rejection_reason.strip():
        raise HTTPException(400, "Rejection reason is required")
    conn = db.query(WaterConnection).filter(WaterConnection.id == req.connection_id).first()
    if not conn:
        raise HTTPException(404, "Application not found")
    if conn.status not in [ConnectionStatus.applied, ConnectionStatus.scheduled]:
        raise HTTPException(400, f"Cannot reject application with status '{conn.status}'. Rejection is only allowed before inspection is recorded.")

    conn.status           = ConnectionStatus.rejected
    conn.rejection_reason = req.rejection_reason.strip()
    db.commit()
    return {"message": "Application rejected", "reason": conn.rejection_reason}


@router.post("/inspect")
def record_inspection(req: InspectionRequest, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Officer records site inspection findings and calculates connection charges."""
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    conn = db.query(WaterConnection).filter(WaterConnection.id == req.connection_id).first()
    if not conn:
        raise HTTPException(404, "Application not found")
    if conn.status not in [ConnectionStatus.scheduled, ConnectionStatus.inspection]:
        raise HTTPException(400,
            f"Cannot record inspection for status '{conn.status}'. "
            f"Please schedule inspection first.")

    charges = calculate_connection_charges(
        pipe_size=req.pipe_size.value,
        connection_type=conn.connection_type.value,
        pipe_distance_meters=req.pipe_distance_meters,
        db=db
    )

    conn.inspection_notes       = req.inspection_notes
    conn.pipe_size              = req.pipe_size
    conn.inspected_by           = current_user.id
    conn.pipe_distance_meters   = req.pipe_distance_meters
    conn.deposit_amount         = charges["deposit"]
    conn.fitting_charges        = charges["fitting_charges"]
    conn.maintenance_charges    = charges["maintenance_charges"]
    conn.pipe_distance_charges  = charges["pipe_distance_charges"]
    conn.total_connection_charges = charges["total"]
    conn.status                 = ConnectionStatus.inspection
    db.commit()
    return {
        "message": "Inspection recorded. Citizen can now view and pay charges.",
        "charges": charges,
    }


@router.post("/declare-charge-payment")
def citizen_declare_charge_payment(req: CitizenDeclareChargesRequest,
                                    db: Session = Depends(get_db),
                                    current_user: User = Depends(get_current_user)):
    """Citizen declares they have paid connection charges. Officer then approves."""
    conn = db.query(WaterConnection).filter(
        WaterConnection.id == req.connection_id,
        WaterConnection.owner_id == current_user.id
    ).first()
    if not conn:
        raise HTTPException(404, "Application not found or not yours")
    if conn.status != ConnectionStatus.inspection:
        raise HTTPException(400,
            "Payment can only be declared after the officer records the inspection.")
    if req.amount != conn.total_connection_charges:
        raise HTTPException(400, f"Full payment of ₹{conn.total_connection_charges:.2f} is required. Partial payments are not accepted for connection charges.")

    conn.status = ConnectionStatus.payment_pending
    conn.inspection_notes = (conn.inspection_notes or "") + f" | PAYMENT DECLARED: ₹{req.amount:.2f}"
    db.commit()
    return {
        "message": f"Payment of ₹{req.amount:.2f} declared. Officer will verify and activate your connection.",
        "connection_id": conn.id,
        "total_charges": conn.total_connection_charges,
        "declared_amount": req.amount,
    }


@router.post("/approve")
def approve_connection(req: ApprovalRequest, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Officer approves after citizen has declared payment — activates connection + generates first bill."""
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    conn = db.query(WaterConnection).filter(WaterConnection.id == req.connection_id).first()
    if not conn:
        raise HTTPException(404, "Application not found")
    if conn.status != ConnectionStatus.payment_pending:
        raise HTTPException(400,
            f"Can only approve connections in 'payment_pending' state. Current: '{conn.status}'")

    citizen = db.query(User).filter(User.id == conn.owner_id).first()
    cn  = gen_connection_number(db)
    now = datetime.now(timezone.utc)

    conn.connection_number       = cn
    conn.approved_by             = current_user.id
    conn.approved_at             = now
    conn.connected_at            = now
    conn.connection_charges_paid = True
    conn.status                  = ConnectionStatus.active

    # Generate first panipatti bill for current FY
    today = date.today()
    fy    = today.year if today.month >= 4 else today.year - 1
    due   = f"{fy + 1}-03-31"
    bd    = calculate_annual_bill(conn.pipe_size.value, conn.connection_type.value, 0, db)
    bill  = Bill(
        connection_id=conn.id, billing_year=fy,
        panipatti_rate=bd["panipatti_rate"], arrears=0,
        total_amount=bd["total"], amount_paid=0, remaining_amount=bd["total"],
        status=BillingStatus.pending, due_date=due
    )
    db.add(bill)
    db.commit()

    return {
        "message": "Connection approved and activated. First bill generated.",
        "connection_number": cn,
        "property_number": conn.property_number,
        "initial_password": conn.property_number,
        "bill_generated": {"billing_year": fy, "total_amount": bd["total"], "due_date": due},
        "note": "Citizen can log in with property number.",
    }


@router.get("/applications")
def get_applications(status: Optional[str] = None, ward_id: Optional[int] = None,
                     db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    q = db.query(WaterConnection)
    if status:  q = q.filter(WaterConnection.status == status)
    if ward_id: q = q.filter(WaterConnection.ward_id == ward_id)
    return [conn_dict(c) for c in q.order_by(WaterConnection.created_at.desc()).all()]


@router.get("/my")
def get_my_connections(db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    conns = db.query(WaterConnection).filter(
        WaterConnection.owner_id == current_user.id
    ).order_by(WaterConnection.created_at.desc()).all()
    return [conn_dict(c) for c in conns]


@router.get("/track/{application_id}")
def track_application(application_id: int, db: Session = Depends(get_db)):
    conn = db.query(WaterConnection).filter(WaterConnection.id == application_id).first()
    if not conn:
        raise HTTPException(404, "Application not found")
    return {
        "application_id":          conn.id,
        "applicant_name":          conn.applicant_name,
        "property_number":         conn.property_number,
        "status":                  conn.status,
        "applied_on":              conn.created_at,
        "inspection_scheduled":    conn.inspection_date is not None,
        "inspection_date":         conn.inspection_date,
        "inspection_done":         conn.status in [ConnectionStatus.inspection,
                                                    ConnectionStatus.payment_pending,
                                                    ConnectionStatus.active],
        "connection_number":       conn.connection_number if conn.status == ConnectionStatus.active else None,
        "rejection_reason":        conn.rejection_reason,
        "total_connection_charges":conn.total_connection_charges if conn.status in [
            ConnectionStatus.inspection, ConnectionStatus.payment_pending] else None,
        "connection_charges_paid": conn.connection_charges_paid,
    }


@router.get("/wards")
def get_wards(db: Session = Depends(get_db)):
    return [{"id": w.id, "ward_no": w.ward_no, "ward_name": w.ward_name, "area_name": w.area_name}
            for w in db.query(Ward).order_by(Ward.ward_no).all()]


@router.get("/rates")
def get_rates(db: Session = Depends(get_db)):
    rates = db.query(SystemRate).order_by(SystemRate.rate_key).all()
    return [{"id": r.id, "rate_key": r.rate_key, "rate_value": r.rate_value,
             "description": r.description, "updated_at": r.updated_at} for r in rates]


@router.put("/rates")
def update_rate(req: UpdateRateRequest, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    row = db.query(SystemRate).filter(SystemRate.rate_key == req.rate_key).first()
    if not row:
        raise HTTPException(404, f"Rate key '{req.rate_key}' not found")
    row.rate_value = req.rate_value
    row.updated_by = current_user.id
    db.commit()
    return {"message": f"'{req.rate_key}' updated to ₹{req.rate_value}",
            "note": "All new bills generated after this will use the updated rate."}

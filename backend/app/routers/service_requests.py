# service_requests.py — CiviCare v5
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from app.database import get_db
from app.models.models import (ServiceRequest, ServiceRequestType, ServiceRequestStatus,
    WaterConnection, User, UserRole, ConnectionStatus, Bill, BillingStatus, PipeSize)
from app.routers.auth import get_current_user

router = APIRouter()

class ServiceRequestCreate(BaseModel):
    connection_id:       int
    request_type:        ServiceRequestType
    description:         Optional[str]  = None
    document_url:        Optional[str]  = None
    new_owner_name:      Optional[str]  = None
    new_owner_phone:     Optional[str]  = None
    new_owner_email:     Optional[str]  = None  # for name transfer — updates account email
    requested_pipe_size: Optional[str]  = None

class ServiceRequestProcess(BaseModel):
    request_id:   int
    approved:     bool
    officer_note: Optional[str] = None

def has_unpaid(connection_id: int, db: Session) -> bool:
    return db.query(Bill).filter(
        Bill.connection_id == connection_id,
        Bill.status.in_([BillingStatus.pending, BillingStatus.partial, BillingStatus.overdue])
    ).first() is not None

@router.post("/")
def create_request(req: ServiceRequestCreate, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    conn = db.query(WaterConnection).filter(
        WaterConnection.id == req.connection_id,
        WaterConnection.owner_id == current_user.id
    ).first()
    if not conn:
        raise HTTPException(404, "Connection not found or not yours")

    if req.request_type == ServiceRequestType.pipe_size_change and not req.requested_pipe_size:
        raise HTTPException(400, "Pipe size required for pipe size change")
    if req.request_type == ServiceRequestType.name_transfer and not req.new_owner_name:
        raise HTTPException(400, "New owner name required for name transfer")
    if req.request_type == ServiceRequestType.perm_disconnection:
        if has_unpaid(conn.id, db):
            raise HTTPException(400, "Clear all pending bills before requesting disconnection")

    sr = ServiceRequest(
        connection_id=conn.id, user_id=current_user.id,
        request_type=req.request_type, description=req.description,
        document_url=req.document_url,
        new_owner_name=req.new_owner_name, new_owner_phone=req.new_owner_phone,
        new_owner_email=req.new_owner_email,
        requested_pipe_size=req.requested_pipe_size
    )
    db.add(sr); db.commit(); db.refresh(sr)
    return {"message": "Request submitted", "request_id": sr.id}

@router.get("/my")
def get_my_requests(db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    return db.query(ServiceRequest).filter(
        ServiceRequest.user_id == current_user.id
    ).order_by(ServiceRequest.created_at.desc()).all()

@router.get("/")
def get_all_requests(status: Optional[str] = None, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    if current_user.role not in ["officer", "admin"]:
        raise HTTPException(403, "Officers only")
    q = db.query(ServiceRequest)
    if status: q = q.filter(ServiceRequest.status == status)
    result = []
    for sr in q.order_by(ServiceRequest.created_at.desc()).all():
        conn  = db.query(WaterConnection).filter(WaterConnection.id == sr.connection_id).first()
        owner = db.query(User).filter(User.id == sr.user_id).first()
        result.append({
            "id": sr.id, "request_type": sr.request_type, "status": sr.status,
            "description": sr.description, "document_url": sr.document_url,
            "new_owner_name": sr.new_owner_name, "new_owner_phone": sr.new_owner_phone,
            "officer_note": sr.officer_note, "created_at": sr.created_at,
            "processed_at": sr.processed_at,
            "connection_number": conn.connection_number if conn else None,
            "property_number":   conn.property_number if conn else None,
            "consumer_name":     owner.name if owner else None,
            "ward_id":           conn.ward_id if conn else None,
            "has_unpaid_bills":  has_unpaid(sr.connection_id, db),
            "deposit_amount":    conn.deposit_amount if conn else 0,
        })
    return result

@router.post("/process")
def process_request(req: ServiceRequestProcess, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    if current_user.role not in ["officer", "admin"]:
        raise HTTPException(403, "Officers only")
    sr = db.query(ServiceRequest).filter(ServiceRequest.id == req.request_id).first()
    if not sr: raise HTTPException(404, "Request not found")

    sr.status       = ServiceRequestStatus.completed if req.approved else ServiceRequestStatus.rejected
    sr.officer_note = req.officer_note
    sr.processed_by = current_user.id
    sr.processed_at = datetime.now(timezone.utc)

    if req.approved:
        conn  = db.query(WaterConnection).filter(WaterConnection.id == sr.connection_id).first()
        owner = db.query(User).filter(User.id == sr.user_id).first()
        if conn:
            if sr.request_type == ServiceRequestType.perm_disconnection:
                if has_unpaid(conn.id, db):
                    raise HTTPException(400, "Cannot disconnect — unpaid bills exist")
                # Permanently disconnect. Citizen's property login stays valid.
                # Deposit refund is offline — officer notes it in officer_note.
                conn.status = ConnectionStatus.disconnected
            elif sr.request_type == ServiceRequestType.pipe_size_change and sr.requested_pipe_size:
                conn.pipe_size = PipeSize(sr.requested_pipe_size)
            elif sr.request_type == ServiceRequestType.name_transfer:
                if sr.new_owner_name:
                    conn.applicant_name = sr.new_owner_name
                    if owner: owner.name = sr.new_owner_name
                if sr.new_owner_phone:
                    conn.applicant_phone = sr.new_owner_phone
                    if owner: owner.phone = sr.new_owner_phone
                if sr.new_owner_email:
                    # Check email not already taken by another user
                    from app.database import get_db as _get_db
                    email_conflict = db.query(User).filter(
                        User.email == sr.new_owner_email,
                        User.id != owner.id if owner else True
                    ).first()
                    if not email_conflict:
                        conn.applicant_email = sr.new_owner_email
                        if owner: owner.email = sr.new_owner_email
                if owner: owner.must_change_pwd = True

    db.commit()
    extra = ""
    if req.approved and sr.request_type == ServiceRequestType.perm_disconnection:
        conn = db.query(WaterConnection).filter(WaterConnection.id == sr.connection_id).first()
        extra = f" Refund deposit of ₹{conn.deposit_amount if conn else 0} to citizen."
    return {"message": f"Request {'approved' if req.approved else 'rejected'}.{extra}"}

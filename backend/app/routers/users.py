# users.py — CiviCare v4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.models import Ward, User, UserRole
from app.routers.auth import get_current_user
from passlib.context import CryptContext

router = APIRouter()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

class CreateStaffRequest(BaseModel):
    name: str
    email: str
    role: str  # plumber / corporator / officer
    phone: Optional[str] = None
    ward_id: Optional[int] = None

@router.get("/wards")
def get_wards(db: Session = Depends(get_db)):
    wards = db.query(Ward).order_by(Ward.ward_no).all()
    return [{"id":w.id,"ward_no":w.ward_no,"ward_name":w.ward_name,"area_name":w.area_name} for w in wards]

@router.get("/plumbers")
def get_plumbers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plumbers = db.query(User).filter(User.role == UserRole.plumber, User.is_active == True).all()
    return [{"id":p.id,"name":p.name,"phone":p.phone} for p in plumbers]

@router.get("/staff")
def get_staff(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(status_code=403, detail="Officers only")
    staff = db.query(User).filter(User.role.in_([UserRole.plumber, UserRole.corporator, UserRole.officer])).all()
    return [{"id":s.id,"name":s.name,"email":s.email,"role":s.role,"phone":s.phone,"is_active":s.is_active} for s in staff]

@router.post("/create-staff")
def create_staff(req: CreateStaffRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(status_code=403, detail="Officers only")
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    # Initial password = email
    hashed = pwd_ctx.hash(req.email)
    user = User(
        name=req.name,
        email=req.email,
        role=req.role,
        phone=req.phone,
        ward_id=req.ward_id,
        hashed_password=hashed,
        must_change_pwd=True,
        is_active=True,
    )
    db.add(user); db.commit(); db.refresh(user)
    return {"message": f"Staff account created for {req.name}", "id": user.id, "initial_password": req.email}

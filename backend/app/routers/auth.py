# auth.py — CiviCare v5
# Citizens log in with property_number + password.
# Staff (officer/plumber/corporator/admin) log in with email + password.
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.database import get_db
from app.models.models import User, UserRole
from app.config import settings
from pydantic import BaseModel
from typing import Optional

router = APIRouter()
pwd_context  = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def hash_password(p: str) -> str:        return pwd_context.hash(p)
def verify_password(plain, hashed) -> bool: return pwd_context.verify(plain, hashed)

def create_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload    = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        identifier = payload.get("sub")
        if not identifier:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Try property_number (citizens) then email (staff)
    user = db.query(User).filter(User.property_number == identifier).first()
    if not user:
        user = db.query(User).filter(User.email == identifier).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def user_to_dict(user: User) -> dict:
    return {
        "id":              user.id,
        "name":            user.name,
        "role":            user.role,
        "ward_id":         user.ward_id,
        "property_number": user.property_number,
        "email":           user.email,
        "phone":           user.phone,
        "must_change_pwd": user.must_change_pwd,
    }

class TokenResponse(BaseModel):
    access_token:        str
    token_type:          str
    user:                dict
    force_password_change: bool

@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    username = form.username.strip()

    # Citizens: username = property_number. Staff: username = email.
    user = db.query(User).filter(User.property_number == username).first()
    if not user:
        user = db.query(User).filter(User.email == username).first()

    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect credentials")

    identifier = user.property_number or user.email
    token      = create_token({"sub": identifier, "role": user.role})
    return TokenResponse(
        access_token=token, token_type="bearer",
        user=user_to_dict(user),
        force_password_change=user.must_change_pwd
    )

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return user_to_dict(current_user)

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

@router.post("/change-password")
def change_password(req: ChangePasswordRequest, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    if not verify_password(req.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Old password incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    current_user.hashed_password = hash_password(req.new_password)
    current_user.must_change_pwd = False
    db.commit()
    return {"message": "Password changed successfully"}

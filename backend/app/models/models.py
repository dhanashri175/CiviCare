# CiviCare v6 — Database Models
# No construction type. Connection types: domestic + commercial only.
# Billing: flat annual panipatti by pipe_size × connection_type. No multipliers.
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

class UserRole(str, enum.Enum):
    citizen    = "citizen"
    officer    = "officer"
    corporator = "corporator"
    plumber    = "plumber"
    admin      = "admin"

class ConnectionType(str, enum.Enum):
    domestic   = "domestic"
    commercial = "commercial"

class PipeSize(str, enum.Enum):
    half      = "0.5"
    three_qtr = "0.75"
    one       = "1.0"
    one_half  = "1.5"

class ConnectionStatus(str, enum.Enum):
    applied         = "applied"       # citizen submitted
    scheduled       = "scheduled"     # officer scheduled inspection date
    inspection      = "inspection"    # officer recorded inspection findings + charges
    payment_pending = "payment_pending"  # citizen paid, awaiting officer approval
    active          = "active"
    disconnected    = "disconnected"
    rejected        = "rejected"

class BillingStatus(str, enum.Enum):
    pending          = "pending"
    partial          = "partial"
    payment_declared = "payment_declared"
    paid             = "paid"
    overdue          = "overdue"
    absorbed         = "absorbed"

class ComplaintType(str, enum.Enum):
    no_supply     = "no_supply"
    low_pressure  = "low_pressure"
    pipe_burst    = "pipe_burst"
    dirty_water   = "dirty_water"
    billing_issue = "billing_issue"
    other         = "other"

class ComplaintStatus(str, enum.Enum):
    open        = "open"
    assigned    = "assigned"
    in_progress = "in_progress"
    resolved    = "resolved"

class SupplyStatus(str, enum.Enum):
    supplied    = "supplied"
    maintenance = "maintenance"
    pipe_burst  = "pipe_burst"
    shortage    = "shortage"
    not_logged  = "not_logged"

class ServiceRequestType(str, enum.Enum):
    name_transfer      = "name_transfer"
    perm_disconnection = "perm_disconnection"
    reconnection       = "reconnection"
    pipe_size_change   = "pipe_size_change"

class ServiceRequestStatus(str, enum.Enum):
    pending     = "pending"
    in_progress = "in_progress"
    completed   = "completed"
    rejected    = "rejected"

# ── SYSTEM RATES ──────────────────────────────────────────────────────────────
# All monetary values live here. Officer can update any rate anytime.
# Key format:
#   panipatti_{pipe_size}_{connection_type}  → annual flat panipatti rate
#   deposit_{pipe_size}_{connection_type}    → one-time refundable deposit
#   fitting_{pipe_size}                      → one-time fitting charges
#   maintenance_{pipe_size}                  → one-time maintenance charges
#   pipe_distance_per_meter                  → per-metre charge if main line >1m away
# NO construction multipliers — rate is always flat.

class SystemRate(Base):
    __tablename__ = "system_rates"
    id          = Column(Integer, primary_key=True, index=True)
    rate_key    = Column(String(100), unique=True, index=True)
    rate_value  = Column(Float, nullable=False)
    description = Column(String(300), nullable=True)
    updated_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Ward(Base):
    __tablename__ = "wards"
    id          = Column(Integer, primary_key=True, index=True)
    ward_no     = Column(Integer, unique=True)
    ward_name   = Column(String(100))
    area_name   = Column(String(200))
    population  = Column(Integer, default=0)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    users       = relationship("User", back_populates="ward")
    supply_logs = relationship("SupplyLog", back_populates="ward")
    complaints  = relationship("Complaint", back_populates="ward")
    connections = relationship("WaterConnection", back_populates="ward")

# Citizens log in with property_number + password.
# Staff log in with email + password.
# One User per property — all connections under that property share this account.
class User(Base):
    __tablename__ = "users"
    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(100))
    email           = Column(String(200), unique=True, index=True, nullable=True)
    property_number = Column(String(50),  unique=True, index=True, nullable=True)
    hashed_password = Column(String(200))
    role            = Column(Enum(UserRole), default=UserRole.citizen)
    ward_id         = Column(Integer, ForeignKey("wards.id"), nullable=True)
    phone           = Column(String(15), nullable=True)
    is_active       = Column(Boolean, default=True)
    must_change_pwd = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    ward        = relationship("Ward", back_populates="users")
    complaints  = relationship("Complaint", foreign_keys="[Complaint.user_id]", back_populates="user")
    connections = relationship("WaterConnection", foreign_keys="[WaterConnection.owner_id]", back_populates="owner")

class WaterConnection(Base):
    __tablename__ = "water_connections"
    id                       = Column(Integer, primary_key=True, index=True)
    connection_number        = Column(String(20), unique=True, index=True, nullable=True)
    owner_id                 = Column(Integer, ForeignKey("users.id"), nullable=True)
    ward_id                  = Column(Integer, ForeignKey("wards.id"))
    property_number          = Column(String(50), index=True)
    applicant_name           = Column(String(100))
    applicant_phone          = Column(String(15))
    applicant_email          = Column(String(200), nullable=True)
    aadhaar_doc_url          = Column(String(500), nullable=False)
    property_doc_url         = Column(String(500), nullable=False)
    address                  = Column(Text)
    connection_type          = Column(Enum(ConnectionType), default=ConnectionType.domestic)
    pipe_size                = Column(Enum(PipeSize), default=PipeSize.half)
    status                   = Column(Enum(ConnectionStatus), default=ConnectionStatus.applied)
    # Inspection
    inspection_date          = Column(DateTime(timezone=True), nullable=True)
    inspection_notes         = Column(Text, nullable=True)
    pipe_distance_meters     = Column(Float, default=0)
    inspected_by             = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Approval & activation
    approved_by              = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at              = Column(DateTime(timezone=True), nullable=True)
    rejection_reason         = Column(Text, nullable=True)
    connected_at             = Column(DateTime(timezone=True), nullable=True)
    # One-time connection charges (calculated at inspection from DB rates, stored as snapshot)
    deposit_amount           = Column(Float, default=0)
    fitting_charges          = Column(Float, default=0)
    maintenance_charges      = Column(Float, default=0)
    pipe_distance_charges    = Column(Float, default=0)
    total_connection_charges = Column(Float, default=0)
    connection_charges_paid  = Column(Boolean, default=False)
    created_at               = Column(DateTime(timezone=True), server_default=func.now())

    owner     = relationship("User", foreign_keys=[owner_id], back_populates="connections")
    inspector = relationship("User", foreign_keys=[inspected_by])
    approver  = relationship("User", foreign_keys=[approved_by])
    ward      = relationship("Ward", back_populates="connections")
    bills     = relationship("Bill", back_populates="connection")

# One bill per connection per financial year (April–March).
# Citizen pays any amount anytime. Unpaid balance on March 31 → arrear next FY.
class Bill(Base):
    __tablename__ = "bills"
    id                  = Column(Integer, primary_key=True, index=True)
    connection_id       = Column(Integer, ForeignKey("water_connections.id"))
    billing_year        = Column(Integer)          # FY start year, e.g. 2025 = FY2025-26
    panipatti_rate      = Column(Float)            # snapshot of rate at generation time
    arrears             = Column(Float, default=0) # unpaid remaining from previous year
    total_amount        = Column(Float)            # panipatti_rate + arrears
    amount_paid         = Column(Float, default=0)
    remaining_amount    = Column(Float, default=0)
    status              = Column(Enum(BillingStatus), default=BillingStatus.pending)
    due_date            = Column(String(20))       # always March 31 of year+1
    notice_sent         = Column(Boolean, default=False)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

    connection = relationship("WaterConnection", back_populates="bills")
    payments   = relationship("BillPayment", back_populates="bill")

class BillPayment(Base):
    __tablename__ = "bill_payments"
    id           = Column(Integer, primary_key=True, index=True)
    bill_id      = Column(Integer, ForeignKey("bills.id"))
    amount       = Column(Float)
    paid_date    = Column(String(20))
    receipt_no   = Column(String(30))
    confirmed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    declared_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_confirmed = Column(Boolean, default=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    bill = relationship("Bill", back_populates="payments")

class Complaint(Base):
    __tablename__ = "complaints"
    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"))
    ward_id         = Column(Integer, ForeignKey("wards.id"))
    connection_id   = Column(Integer, ForeignKey("water_connections.id"), nullable=True)
    complaint_type  = Column(Enum(ComplaintType))
    description     = Column(Text)
    photo_url       = Column(String(500), nullable=True)
    priority_score  = Column(Integer, default=1)
    status          = Column(Enum(ComplaintStatus), default=ComplaintStatus.open)
    assigned_to     = Column(Integer, ForeignKey("users.id"), nullable=True)
    work_order_no   = Column(String(20), nullable=True)
    sla_hours       = Column(Integer, default=24)
    resolved_at     = Column(DateTime(timezone=True), nullable=True)
    resolution_note = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), nullable=True, server_default=func.now())

    user             = relationship("User", foreign_keys=[user_id], back_populates="complaints")
    assigned_plumber = relationship("User", foreign_keys=[assigned_to])
    ward             = relationship("Ward", back_populates="complaints")

class ServiceRequest(Base):
    __tablename__ = "service_requests"
    id                  = Column(Integer, primary_key=True, index=True)
    connection_id       = Column(Integer, ForeignKey("water_connections.id"))
    user_id             = Column(Integer, ForeignKey("users.id"))
    request_type        = Column(Enum(ServiceRequestType))
    description         = Column(Text, nullable=True)
    document_url        = Column(String(500), nullable=True)
    new_owner_name      = Column(String(100), nullable=True)
    new_owner_phone     = Column(String(15), nullable=True)
    new_owner_email     = Column(String(200), nullable=True)
    requested_pipe_size = Column(String(10), nullable=True)
    status              = Column(Enum(ServiceRequestStatus), default=ServiceRequestStatus.pending)
    officer_note        = Column(Text, nullable=True)
    processed_by        = Column(Integer, ForeignKey("users.id"), nullable=True)
    processed_at        = Column(DateTime(timezone=True), nullable=True)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

class SupplyLog(Base):
    __tablename__ = "supply_logs"
    id              = Column(Integer, primary_key=True, index=True)
    ward_id         = Column(Integer, ForeignKey("wards.id"))
    date            = Column(String(20))
    supply_start    = Column(String(10), nullable=True)
    supply_duration = Column(Integer, nullable=True)
    status          = Column(Enum(SupplyStatus), default=SupplyStatus.supplied)
    reason          = Column(Text, nullable=True)
    officer_id      = Column(Integer, ForeignKey("users.id"))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    ward = relationship("Ward", back_populates="supply_logs")

class DamLevel(Base):
    __tablename__ = "dam_levels"
    id            = Column(Integer, primary_key=True, index=True)
    dam_name      = Column(String(100), default="Veer Dam")
    date          = Column(String(20))
    level_percent = Column(Float)
    storage_mcm   = Column(Float)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

class Announcement(Base):
    __tablename__ = "announcements"
    id           = Column(Integer, primary_key=True, index=True)
    officer_id   = Column(Integer, ForeignKey("users.id"))
    title        = Column(String(200))
    message      = Column(Text)
    target_wards = Column(String(200))
    ann_type     = Column(String(50))
    sms_sent     = Column(Boolean, default=False)
    sms_count    = Column(Integer, default=0)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

class FaultAlert(Base):
    __tablename__ = "fault_alerts"
    id              = Column(Integer, primary_key=True, index=True)
    ward_id         = Column(Integer, ForeignKey("wards.id"))
    complaint_type  = Column(String(50))
    complaint_count = Column(Integer)
    unique_citizens = Column(Integer)
    severity        = Column(String(20))
    time_window_h   = Column(Integer)
    ai_summary      = Column(Text, nullable=True)
    is_dismissed    = Column(Boolean, default=False)
    dismissed_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved        = Column(Boolean, default=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    ward = relationship("Ward", foreign_keys=[ward_id])

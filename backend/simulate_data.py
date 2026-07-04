# simulate_data.py — CiviCare v6
# Seeds DB with wards, rates, staff, and sample citizen connections/bills.
# Citizens login: property_number + password (initial = property_number)
import sys; sys.path.append(".")
from app.database import SessionLocal, engine, Base
from app.models.models import (
    Ward, User, UserRole, WaterConnection, ConnectionType, PipeSize,
    ConnectionStatus, Bill, BillPayment, BillingStatus,
    Complaint, ComplaintType, ComplaintStatus,
    SupplyLog, SupplyStatus, DamLevel, Announcement,
    SystemRate, ServiceRequest, FaultAlert
)
from app.routers.auth import hash_password
from app.ml.billing_calculator import seed_rates, calculate_annual_bill, calculate_connection_charges
from datetime import date, timedelta, datetime, timezone
import random, string

Base.metadata.create_all(bind=engine)
db = SessionLocal()
print("💧 CiviCare v6 — Seeding database...")

# ── 1. WARDS ──────────────────────────────────────────────────────────────────
wards_data = [
    (1,"Ward 1","Mangalwar Peth",6200),(2,"Ward 2","Somwar Peth",5800),
    (3,"Ward 3","Budhwar Peth",5400),(4,"Ward 4","Guruwar Peth",6800),
    (5,"Ward 5","Shukrawar Peth",5900),(6,"Ward 6","Shaniwar Peth",6100),
    (7,"Ward 7","Raviwar Peth",4800),(8,"Ward 8","Gandhi Nagar",5200),
    (9,"Ward 9","Ganesh Nagar",5700),(10,"Ward 10","Shivaji Nagar",6400),
    (11,"Ward 11","Ambedkar Nagar",5100),(12,"Ward 12","New Colony",4600),
    (13,"Ward 13","Vijaynagar / MIDC Area",7200),
]
for wno, wname, area, pop in wards_data:
    if not db.query(Ward).filter(Ward.ward_no == wno).first():
        db.add(Ward(ward_no=wno, ward_name=wname, area_name=area, population=pop))
db.commit()
wards = db.query(Ward).order_by(Ward.ward_no).all()
print(f"  ✅ {len(wards)} wards")

# ── 2. SYSTEM RATES ───────────────────────────────────────────────────────────
inserted = seed_rates(db)
print(f"  ✅ System rates seeded ({inserted} new entries)")

# ── 3. STAFF ──────────────────────────────────────────────────────────────────
staff = [
    ("Officer Patil",  "officer@phaltan.gov.in",  "officer123", UserRole.officer,    None),
    ("Officer Desai",  "officer2@phaltan.gov.in", "officer123", UserRole.officer,    None),
    ("Plumber Shinde", "plumber1@phaltan.gov.in", "plumber123", UserRole.plumber,    1),
    ("Plumber Kale",   "plumber2@phaltan.gov.in", "plumber123", UserRole.plumber,    2),
    ("Corp Sathe",     "corp1@phaltan.gov.in",    "corp123",    UserRole.corporator, 1),
    ("Corp Ingle",     "corp2@phaltan.gov.in",    "corp123",    UserRole.corporator, 2),
]
for name, email, pwd, role, wid in staff:
    if not db.query(User).filter(User.email == email).first():
        db.add(User(name=name, email=email, hashed_password=hash_password(pwd),
                    role=role, ward_id=wards[wid-1].id if wid else None,
                    must_change_pwd=False, is_active=True))
db.commit()
officer = db.query(User).filter(User.email == "officer@phaltan.gov.in").first()
print("  ✅ Staff accounts")

# ── 4. CITIZEN CONNECTIONS ────────────────────────────────────────────────────
# One User per property_number. Login: property_number / initial pwd = property_number.
SAMPLE_DOC = "https://res.cloudinary.com/demo/image/upload/sample.jpg"

connections_data = [
    # (name, phone, email, ward_no, connection_type, pipe_size, property_number)
    ("Ramesh Jadhav",  "9823456789", "ramesh@email.com",  1,  ConnectionType.domestic,   PipeSize.half,      "PMC/W1/0001"),
    ("Sunita More",    "9812345678", "sunita@email.com",   2,  ConnectionType.domestic,   PipeSize.half,      "PMC/W2/0005"),
    ("Ganesh Shinde",  "9834567890", "ganesh@gmail.com",   3,  ConnectionType.domestic,   PipeSize.three_qtr, "PMC/W3/0012"),
    ("Priya Kulkarni", "9845678901", "priya@email.com",    4,  ConnectionType.domestic,   PipeSize.half,      "PMC/W4/0008"),
    ("Raju Kale",      "9867890123", "raju@gmail.com",     13, ConnectionType.commercial, PipeSize.one,       "PMC/W13/022"),
    ("Meera Pawar",    "9878901234", "meera@email.com",    5,  ConnectionType.domestic,   PipeSize.half,      "PMC/W5/0003"),
    ("Anil Desai",     "9889012345", "anil@email.com",     6,  ConnectionType.domestic,   PipeSize.half,      "PMC/W6/0017"),
    ("Lata Patil",     "9890123456", "lata@gmail.com",     7,  ConnectionType.domestic,   PipeSize.half,      "PMC/W7/0009"),
]

created_connections = []
for i, (name, phone, email, wno, ctype, pipe, prop_no) in enumerate(connections_data):
    cn = f"PMC-2024-{10001+i}"
    existing = db.query(WaterConnection).filter(WaterConnection.connection_number == cn).first()
    if existing:
        created_connections.append(existing); continue

    ps = pipe.value
    ct = ctype.value

    # One User per property
    citizen = db.query(User).filter(User.property_number == prop_no).first()
    if not citizen:
        citizen = User(
            name=name, property_number=prop_no, email=email, phone=phone,
            hashed_password=hash_password(prop_no),  # initial pwd = property number
            role=UserRole.citizen, ward_id=wards[wno-1].id,
            must_change_pwd=True, is_active=True
        )
        db.add(citizen); db.flush()

    charges = calculate_connection_charges(ps, ct, 0, db)

    conn = WaterConnection(
        connection_number=cn, owner_id=citizen.id, ward_id=wards[wno-1].id,
        property_number=prop_no, applicant_name=name, applicant_phone=phone,
        applicant_email=email, aadhaar_doc_url=SAMPLE_DOC, property_doc_url=SAMPLE_DOC,
        address=f"House No. {100+i}, {wards[wno-1].area_name}",
        connection_type=ctype, pipe_size=pipe, status=ConnectionStatus.active,
        approved_by=officer.id,
        approved_at=datetime.now(timezone.utc) - timedelta(days=random.randint(60,365)),
        connected_at=datetime.now(timezone.utc) - timedelta(days=random.randint(30,300)),
        deposit_amount=charges["deposit"], fitting_charges=charges["fitting_charges"],
        maintenance_charges=charges["maintenance_charges"],
        pipe_distance_meters=0, pipe_distance_charges=0,
        total_connection_charges=charges["total"], connection_charges_paid=True
    )
    db.add(conn); db.flush()
    created_connections.append(conn)
db.commit()
print(f"  ✅ {len(created_connections)} citizen connections (login: property_number / pwd = property_number)")

# ── 5. BILLS (FY2023 + FY2024) ────────────────────────────────────────────────
def fy_due(year): return f"{year+1}-03-31"

for conn in created_connections:
    for year in [2023, 2024]:
        if db.query(Bill).filter(Bill.connection_id==conn.id, Bill.billing_year==year).first():
            continue
        bd       = calculate_annual_bill(conn.pipe_size.value, conn.connection_type.value, 0, db)
        total    = bd["total"]
        is_paid  = random.random() < 0.70
        amt_paid = total if is_paid else (round(random.uniform(0, total*0.6), 2) if random.random() < 0.3 else 0)
        remaining = round(total - amt_paid, 2)
        status = (BillingStatus.paid if amt_paid >= total
                  else BillingStatus.partial if amt_paid > 0
                  else BillingStatus.overdue)
        bill = Bill(
            connection_id=conn.id, billing_year=year,
            panipatti_rate=bd["panipatti_rate"], arrears=0,
            total_amount=total, amount_paid=amt_paid, remaining_amount=remaining,
            status=status, due_date=fy_due(year), notice_sent=(status==BillingStatus.overdue)
        )
        db.add(bill); db.flush()
        if amt_paid > 0:
            receipt = "RCP-" + "".join(random.choices(string.ascii_uppercase+string.digits, k=8))
            db.add(BillPayment(bill_id=bill.id, amount=amt_paid,
                               paid_date=f"{year+1}-02-{random.randint(1,28):02d}",
                               receipt_no=receipt, is_confirmed=True, confirmed_by=officer.id))
db.commit()
print("  ✅ Bills FY2023 + FY2024")

# ── 6. SUPPLY LOGS (35 days) ──────────────────────────────────────────────────
sc = 0
for ward in wards:
    for d in range(35, 0, -1):
        ld = str(date.today() - timedelta(days=d))
        if db.query(SupplyLog).filter(SupplyLog.ward_id==ward.id, SupplyLog.date==ld).first(): continue
        bp = 0.88 if ward.ward_no <= 7 else 0.76
        r  = random.random()
        if r < bp:          st2, reason, dur = SupplyStatus.supplied, None, random.choice([50,55,60,65])
        elif r < bp+0.07:   st2, reason, dur = SupplyStatus.shortage, "Low dam levels", 35
        elif r < bp+0.10:   st2, reason, dur = SupplyStatus.maintenance, "Scheduled maintenance", None
        else:                st2, reason, dur = SupplyStatus.pipe_burst, "Emergency repair", None
        db.add(SupplyLog(ward_id=ward.id, date=ld, supply_start="06:00",
                          supply_duration=dur, status=st2, reason=reason, officer_id=officer.id))
        sc += 1
db.commit()
print(f"  ✅ {sc} supply logs")

# ── 7. DAM LEVELS ─────────────────────────────────────────────────────────────
lv = 68.0
for d in range(30, 0, -1):
    ld = str(date.today() - timedelta(days=d))
    if db.query(DamLevel).filter(DamLevel.date==ld).first(): continue
    lv = max(20, min(100, lv + random.uniform(-0.8, 0.3)))
    db.add(DamLevel(dam_name="Veer Dam", date=ld, level_percent=round(lv,1), storage_mcm=round(lv*5.28,1)))
db.commit()
print("  ✅ Dam levels")

# ── 8. COMPLAINTS ─────────────────────────────────────────────────────────────
cc = 0
for conn in created_connections[:5]:
    owner = db.query(User).filter(User.id==conn.owner_id).first()
    if not owner: continue
    for _ in range(random.randint(1,2)):
        ct = random.choice(list(ComplaintType))
        db.add(Complaint(
            user_id=owner.id, ward_id=conn.ward_id, connection_id=conn.id,
            complaint_type=ct, description=f"Sample: {ct.value.replace('_',' ')}",
            priority_score=random.randint(1,5), status=random.choice(list(ComplaintStatus)),
            sla_hours={"no_supply":12,"low_pressure":24,"pipe_burst":4,"dirty_water":8,"billing_issue":72,"other":48}.get(ct.value,24),
            created_at=datetime.now(timezone.utc)-timedelta(days=random.randint(1,30))
        ))
        cc += 1
db.commit()
print(f"  ✅ {cc} sample complaints")

# ── 9. ANNOUNCEMENTS ──────────────────────────────────────────────────────────
if not db.query(Announcement).first():
    db.add(Announcement(officer_id=officer.id,
        title="Water Supply Disruption",
        message="Ward 3 will have no supply on Sunday 6–8 AM due to pipeline maintenance.",
        target_wards="3", ann_type="maintenance"))
    db.add(Announcement(officer_id=officer.id,
        title="FY 2025-26 Bills Generated",
        message="Annual panipatti bills for FY 2025-26 are now available. Due date: 31 March 2026.",
        target_wards="all", ann_type="billing"))
db.commit()
print("  ✅ Announcements")

db.close()
print("\n✅ Database seeded successfully!")
print("─" * 55)
print("STAFF LOGIN (email / password)")
print("─" * 55)
print("  officer@phaltan.gov.in  /  officer123")
print("  plumber1@phaltan.gov.in /  plumber123")
print("  corp1@phaltan.gov.in    /  corp123")
print("─" * 55)
print("CITIZEN LOGIN (property_number / password = property_number)")
print("─" * 55)
for _, _, _, _, _, _, prop in connections_data:
    print(f"  {prop}")
print("─" * 55)

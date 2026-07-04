# billing.py — CiviCare v6 (fixed)
# Fixes: overpayment guard, negative remaining_amount, arrears rollover endpoint,
#        correct resolution rate denominator removed (handled in dashboard)
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from datetime import datetime, date
from io import BytesIO
from app.database import get_db
from app.models.models import (Bill, BillPayment, BillingStatus, WaterConnection,
    ConnectionStatus, User, UserRole, SystemRate)
from app.routers.auth import get_current_user
from app.ml.billing_calculator import calculate_annual_bill
from app.config import settings
import random, string as st

router = APIRouter()

PIPE_LABEL = {"0.5":"½ inch","0.75":"¾ inch","1.0":"1 inch","1.5":"1½ inch"}
CONN_LABEL = {"domestic":"Domestic","commercial":"Commercial"}

def current_fy() -> int:
    t = date.today()
    return t.year if t.month >= 4 else t.year - 1

def due_date(year: int) -> str:
    return f"{year + 1}-03-31"

def make_receipt() -> str:
    return "RCP-" + "".join(random.choices(st.ascii_uppercase + st.digits, k=8))

def has_unpaid(connection_id: int, db: Session) -> bool:
    return db.query(Bill).filter(
        Bill.connection_id == connection_id,
        Bill.status.in_([BillingStatus.pending, BillingStatus.partial, BillingStatus.overdue])
    ).first() is not None

def _bill_dict(b: Bill) -> dict:
    total     = b.total_amount or 0
    paid      = b.amount_paid or 0
    # Guard: remaining can never go below 0 (overpayment protection)
    remaining = max(0.0, b.remaining_amount if b.remaining_amount is not None else round(total - paid, 2))
    return {
        "id":               b.id,
        "connection_id":    b.connection_id,
        "billing_year":     b.billing_year,
        "billing_fy":       f"FY {b.billing_year}-{b.billing_year+1}",
        "panipatti_rate":   b.panipatti_rate or 0,
        "arrears":          b.arrears or 0,
        "total_amount":     total,
        "amount_paid":      paid,
        "remaining_amount": remaining,
        "status":           b.status if isinstance(b.status, str) else b.status.value,
        "due_date":         b.due_date,
        "notice_sent":      b.notice_sent or False,
        "created_at":       b.created_at,
        "payments":         [_pay_dict(p) for p in (b.payments or [])],
    }

def _pay_dict(p: BillPayment) -> dict:
    return {"id": p.id, "amount": p.amount, "paid_date": p.paid_date,
            "receipt_no": p.receipt_no, "is_confirmed": p.is_confirmed,
            "created_at": p.created_at}

# ── PDF ───────────────────────────────────────────────────────────────────────
def generate_bill_pdf(bill: Bill, conn: WaterConnection, owner: User, is_receipt=False):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER

        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=15*mm, leftMargin=15*mm,
                                topMargin=15*mm, bottomMargin=15*mm)
        sty   = getSampleStyleSheet()
        amber = colors.HexColor("#B45309")
        light = colors.HexColor("#FEF3C7")
        green = colors.HexColor("#16A34A")
        red   = colors.HexColor("#DC2626")

        ts = ParagraphStyle("ts", parent=sty["Title"],  fontSize=18, textColor=amber, alignment=TA_CENTER)
        ss = ParagraphStyle("ss", parent=sty["Normal"], fontSize=10, textColor=colors.HexColor("#1C1917"), alignment=TA_CENTER)
        hs = ParagraphStyle("hs", parent=sty["Normal"], fontSize=14, fontName="Helvetica-Bold", alignment=TA_CENTER)
        sm = ParagraphStyle("sm", parent=sty["Normal"], fontSize=8,  textColor=colors.grey, alignment=TA_CENTER)

        els = []
        els += [Paragraph("Phaltan Municipal Council", ts),
                Paragraph("Water Supply Department | Phaltan, Satara — 415523", ss),
                Paragraph("Tel: 02166-220XXX | civicare.phaltan.gov.in", ss),
                Spacer(1,4*mm), HRFlowable(width="100%", thickness=2, color=amber), Spacer(1,2*mm)]

        title = "PAYMENT RECEIPT" if is_receipt else (
            "PANIPATTI — PAID" if bill.status == BillingStatus.paid else "PANIPATTI (Annual Water Bill)")
        els.append(Paragraph(title, hs))
        els.append(Spacer(1,4*mm))

        owner_name = owner.name if owner else conn.applicant_name
        status_lbl = {"paid":"✅ PAID","partial":"💰 PARTIAL","payment_declared":"🔔 DECLARED",
                      "absorbed":"📦 ABSORBED","overdue":"⚠️ OVERDUE","pending":"⏳ PENDING"}.get(
            bill.status if isinstance(bill.status, str) else bill.status.value, "⏳ PENDING")

        info = [
            ["Property No.", conn.property_number or "—",    "Bill Year",  str(bill.billing_year)],
            ["Connection No.", conn.connection_number or "—","Bill ID",    f"BILL-{bill.id:05d}"],
            ["Name", owner_name,                             "Due Date",   due_date(bill.billing_year)],
            ["Address", (conn.address or "—")[:40],          "Status",     status_lbl],
        ]
        it = Table(info, colWidths=[35*mm,65*mm,30*mm,45*mm])
        it.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(0,-1),light),("BACKGROUND",(2,0),(2,-1),light),
            ("TEXTCOLOR",(0,0),(0,-1),amber),("TEXTCOLOR",(2,0),(2,-1),amber),
            ("FONTNAME",(0,0),(-1,-1),"Helvetica"),
            ("FONTNAME",(0,0),(0,-1),"Helvetica-Bold"),("FONTNAME",(2,0),(2,-1),"Helvetica-Bold"),
            ("FONTSIZE",(0,0),(-1,-1),9),
            ("ROWBACKGROUNDS",(0,0),(-1,-1),[colors.white,colors.HexColor("#FFFBEB")]),
            ("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#E5E7EB")),
            ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
            ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
        ]))
        els += [it, Spacer(1,4*mm)]

        ci = [["Connection Type", CONN_LABEL.get(str(conn.connection_type),str(conn.connection_type)),
               "Pipe Size", PIPE_LABEL.get(str(conn.pipe_size),str(conn.pipe_size))],
              ["Ward", f"Ward {conn.ward_id}",
               "Connected", conn.connected_at.strftime("%d %b %Y") if conn.connected_at else "—"]]
        ct = Table(ci, colWidths=[35*mm,65*mm,30*mm,45*mm])
        ct.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(0,-1),light),("BACKGROUND",(2,0),(2,-1),light),
            ("TEXTCOLOR",(0,0),(0,-1),amber),("TEXTCOLOR",(2,0),(2,-1),amber),
            ("FONTNAME",(0,0),(-1,-1),"Helvetica"),
            ("FONTNAME",(0,0),(0,-1),"Helvetica-Bold"),("FONTNAME",(2,0),(2,-1),"Helvetica-Bold"),
            ("FONTSIZE",(0,0),(-1,-1),9),
            ("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#E5E7EB")),
            ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
            ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
        ]))
        els += [ct, Spacer(1,4*mm)]

        remaining = max(0.0, bill.remaining_amount or 0)
        bd = [["Description","Amount (₹)"],
              ["Annual Panipatti (flat rate)",f"₹ {bill.panipatti_rate:,.2f}"]]
        if bill.arrears and bill.arrears > 0:
            bd.append(["Arrears (previous year unpaid)", f"₹ {bill.arrears:,.2f}"])
        bd += [["TOTAL BILL", f"₹ {bill.total_amount:,.2f}"],
               ["Amount Paid", f"₹ {bill.amount_paid:,.2f}"],
               ["BALANCE DUE", f"₹ {remaining:,.2f}"]]

        bt = Table(bd, colWidths=[120*mm,55*mm])
        bt.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,0),amber),("TEXTCOLOR",(0,0),(-1,0),colors.white),
            ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
            ("FONTNAME",(0,-3),(-1,-3),"Helvetica-Bold"),
            ("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"),
            ("BACKGROUND",(0,-3),(-1,-3),light),("TEXTCOLOR",(0,-3),(-1,-3),amber),
            ("BACKGROUND",(0,-1),(-1,-1),colors.HexColor("#FEE2E2") if remaining > 0 else light),
            ("TEXTCOLOR",(0,-1),(-1,-1),red if remaining > 0 else green),
            ("FONTSIZE",(0,0),(-1,-1),10),("FONTSIZE",(0,-1),(-1,-1),12),
            ("ALIGN",(1,0),(1,-1),"RIGHT"),
            ("ROWBACKGROUNDS",(0,1),(-1,-4),[colors.white,colors.HexColor("#FFFBEB")]),
            ("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#E5E7EB")),
            ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
        ]))
        els += [bt, Spacer(1,4*mm)]

        if bill.notice_sent and bill.status not in [BillingStatus.paid]:
            els.append(Paragraph(
                "⚠️ NOTICE: Payment overdue. Unpaid balance will be added as arrears next year.",
                ParagraphStyle("notice",parent=sty["Normal"],fontSize=10,
                               textColor=red,fontName="Helvetica-Bold",alignment=TA_CENTER)))
            els.append(Spacer(1,2*mm))

        confirmed = [p for p in (bill.payments or []) if p.is_confirmed]
        if confirmed:
            ph = [["Date","Amount","Receipt No."]]
            for p in confirmed:
                ph.append([p.paid_date or "—", f"₹ {p.amount:,.2f}", p.receipt_no or "—"])
            pht = Table(ph, colWidths=[45*mm,45*mm,85*mm])
            pht.setStyle(TableStyle([
                ("BACKGROUND",(0,0),(-1,0),colors.HexColor("#D1FAE5")),
                ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
                ("FONTSIZE",(0,0),(-1,-1),9),
                ("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#E5E7EB")),
                ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
            ]))
            els += [Paragraph("Payment History",
                              ParagraphStyle("ph",parent=sty["Normal"],fontSize=11,
                                             fontName="Helvetica-Bold",textColor=green)),
                   Spacer(1,2*mm), pht, Spacer(1,4*mm)]

        els += [HRFlowable(width="100%",thickness=1,color=colors.HexColor("#E5E7EB")),
                Spacer(1,2*mm),
                Paragraph(f"Computer generated | {datetime.now().strftime('%d %b %Y %I:%M %p')} | CiviCare v6", sm),
                Paragraph("Helpline: 1916 | civicare.phaltan.gov.in", sm)]

        doc.build(els)
        buf.seek(0)
        return buf
    except ImportError:
        raise HTTPException(500, "ReportLab not installed.")

# ── PYDANTIC ──────────────────────────────────────────────────────────────────
class GenerateBillRequest(BaseModel):
    connection_id: int
    billing_year:  Optional[int] = None

class DeclarePaymentRequest(BaseModel):
    bill_id: int
    amount:  float

class UpdateRateRequest(BaseModel):
    rate_key:   str
    rate_value: float

class AIExplainRequest(BaseModel):
    bill_id:  int
    language: str = "marathi"

# ── ENDPOINTS ─────────────────────────────────────────────────────────────────

@router.get("/my")
def get_my_bills(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conns = db.query(WaterConnection).filter(
        WaterConnection.owner_id == current_user.id,
        WaterConnection.status == ConnectionStatus.active
    ).all()
    result = []
    for conn in conns:
        bills = db.query(Bill).filter(Bill.connection_id == conn.id).order_by(Bill.billing_year.desc()).all()
        oldest_unpaid = db.query(Bill).filter(
            Bill.connection_id == conn.id,
            Bill.status.in_([BillingStatus.pending, BillingStatus.partial, BillingStatus.overdue])
        ).order_by(Bill.billing_year.asc()).first()
        result.append({
            "connection_id":      conn.id,
            "connection_number":  conn.connection_number,
            "connection_type":    conn.connection_type,
            "pipe_size":          conn.pipe_size,
            "address":            conn.address,
            "status":             conn.status,
            "bills":              [_bill_dict(b) for b in bills],
            "oldest_unpaid_year": oldest_unpaid.billing_year if oldest_unpaid else None,
        })
    return result

@router.get("/all")
def get_all_bills(ward_id: Optional[int] = None, status: Optional[str] = None,
                   db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    q = (db.query(Bill, WaterConnection, User)
           .join(WaterConnection, Bill.connection_id == WaterConnection.id)
           .outerjoin(User, WaterConnection.owner_id == User.id))
    if status:  q = q.filter(Bill.status == status)
    if ward_id: q = q.filter(WaterConnection.ward_id == ward_id)
    result = []
    for bill, conn, owner in q.order_by(Bill.billing_year.desc()).limit(300).all():
        d = _bill_dict(bill)
        d.update({"connection_number": conn.connection_number,
                  "property_number":   conn.property_number,
                  "consumer_name":     owner.name if owner else conn.applicant_name,
                  "ward_id":           conn.ward_id})
        result.append(d)
    return result

@router.get("/active-connections")
def get_active_connections(db: Session = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    conns = db.query(WaterConnection).filter(
        WaterConnection.status == ConnectionStatus.active
    ).order_by(WaterConnection.connection_number).all()
    return [{"id": c.id, "connection_number": c.connection_number,
             "property_number": c.property_number, "applicant_name": c.applicant_name,
             "connection_type": c.connection_type, "pipe_size": c.pipe_size,
             "ward_id": c.ward_id} for c in conns]

@router.get("/calculate/{connection_id}")
def preview_bill(connection_id: int, billing_year: Optional[int] = None,
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    conn = db.query(WaterConnection).filter(WaterConnection.id == connection_id).first()
    if not conn: raise HTTPException(404, "Connection not found")
    year = billing_year or current_fy()
    # Auto-calculate arrears from ALL unpaid previous bills
    prev_bills = db.query(Bill).filter(
        Bill.connection_id == connection_id, Bill.billing_year < year,
        Bill.status.in_([BillingStatus.pending, BillingStatus.partial, BillingStatus.overdue])
    ).all()
    arrears = round(sum(max(0.0, b.remaining_amount or 0) for b in prev_bills), 2)
    bd = calculate_annual_bill(conn.pipe_size.value, conn.connection_type.value, arrears, db)
    already_exists = db.query(Bill).filter(
        Bill.connection_id == connection_id, Bill.billing_year == year
    ).first() is not None
    return {"connection_id": connection_id, "connection_number": conn.connection_number,
            "property_number": conn.property_number, "applicant_name": conn.applicant_name,
            "billing_year": year, "due_date": due_date(year),
            "already_exists": already_exists, "breakdown": bd}

@router.post("/generate")
def generate_bill(req: GenerateBillRequest, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    conn = db.query(WaterConnection).filter(WaterConnection.id == req.connection_id).first()
    if not conn:              raise HTTPException(404, "Connection not found")
    if conn.status != ConnectionStatus.active:
        raise HTTPException(400, "Connection is not active")
    year = req.billing_year or current_fy()
    if year > current_fy():
        raise HTTPException(400, f"Cannot generate bill for future FY {year}-{year+1}")
    if conn.connected_at and conn.connected_at.date() > date(year+1, 3, 31):
        raise HTTPException(400, f"Connection was not active during FY {year}-{year+1}")
    if db.query(Bill).filter(Bill.connection_id == conn.id, Bill.billing_year == year).first():
        raise HTTPException(400, f"Bill already exists for FY {year}")

    # Auto-calculate arrears from ALL unpaid previous bills
    prev_bills = db.query(Bill).filter(
        Bill.connection_id == conn.id, Bill.billing_year < year,
        Bill.status.in_([BillingStatus.pending, BillingStatus.partial, BillingStatus.overdue])
    ).all()
    arrears = round(sum(max(0.0, b.remaining_amount or 0) for b in prev_bills), 2)

    bd    = calculate_annual_bill(conn.pipe_size.value, conn.connection_type.value, arrears, db)
    total = bd["total"]
    bill  = Bill(connection_id=conn.id, billing_year=year,
                 panipatti_rate=bd["panipatti_rate"], arrears=arrears,
                 total_amount=total, amount_paid=0, remaining_amount=total,
                 status=BillingStatus.pending, due_date=due_date(year))
    db.add(bill); db.flush()
    # Absorb old unpaid bills — their remaining amounts are now in arrears
    for ob in prev_bills:
        ob.status = BillingStatus.absorbed
    db.commit(); db.refresh(bill)
    return {"message": "Bill generated", "bill_id": bill.id,
            "panipatti_rate": bd["panipatti_rate"], "arrears": arrears,
            "total_amount": total, "due_date": bill.due_date}

@router.post("/generate-all")
def generate_all_bills(billing_year: Optional[int] = None, db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    year = billing_year or current_fy()
    if year > current_fy():
        raise HTTPException(400, f"Cannot generate bills for future FY {year}-{year+1}")
    active = db.query(WaterConnection).filter(WaterConnection.status == ConnectionStatus.active).all()
    generated, skipped = [], []
    for conn in active:
        if db.query(Bill).filter(Bill.connection_id == conn.id, Bill.billing_year == year).first():
            skipped.append({"id": conn.id, "reason": "already_exists"}); continue
        if conn.connected_at and conn.connected_at.date() > date(year+1, 3, 31):
            skipped.append({"id": conn.id, "reason": "not_active_this_fy"}); continue
        # Auto-calculate arrears from ALL unpaid previous bills
        prev_bills = db.query(Bill).filter(
            Bill.connection_id == conn.id, Bill.billing_year < year,
            Bill.status.in_([BillingStatus.pending, BillingStatus.partial, BillingStatus.overdue])
        ).all()
        arrears = round(sum(max(0.0, b.remaining_amount or 0) for b in prev_bills), 2)
        bd = calculate_annual_bill(conn.pipe_size.value, conn.connection_type.value, arrears, db)
        total = bd["total"]
        db.add(Bill(connection_id=conn.id, billing_year=year,
                    panipatti_rate=bd["panipatti_rate"], arrears=arrears,
                    total_amount=total, amount_paid=0, remaining_amount=total,
                    status=BillingStatus.pending, due_date=due_date(year)))
        # Absorb old unpaid bills — their remaining amounts are now in arrears
        for ob in prev_bills:
            ob.status = BillingStatus.absorbed
        generated.append(conn.connection_number)
    db.commit()
    return {"message": f"Generated {len(generated)} bills for FY {year}",
            "generated_count": len(generated), "skipped_count": len(skipped),
            "due_date": due_date(year)}

@router.post("/rollover-arrears")
def rollover_arrears(billing_year: Optional[int] = None, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """
    End-of-year rollover: marks unpaid bills as overdue, then when generate-all is
    called for the new FY it picks up remaining_amount as arrears automatically.
    Officer calls this after March 31 to close the financial year.
    """
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    year = billing_year or current_fy()
    due  = date(year+1, 3, 31)
    if date.today() <= due:
        raise HTTPException(400, f"FY {year} due date ({due}) has not passed yet.")

    unpaid = db.query(Bill).filter(
        Bill.billing_year == year,
        Bill.status.in_([BillingStatus.pending, BillingStatus.partial]),
    ).all()
    count = 0
    for b in unpaid:
        b.status      = BillingStatus.overdue
        b.notice_sent = True
        count += 1
    db.commit()
    return {
        "message": f"{count} bills marked overdue for FY {year}.",
        "next_step": "Run 'Generate All' for the new FY to carry remaining balances as arrears.",
        "note": "When new FY bills are generated, remaining_amount from these overdue bills is automatically included as arrears."
    }

@router.post("/declare-payment")
def declare_payment(req: DeclarePaymentRequest, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    bill = db.query(Bill).filter(Bill.id == req.bill_id).first()
    if not bill: raise HTTPException(404, "Bill not found")
    conn = db.query(WaterConnection).filter(WaterConnection.id == bill.connection_id).first()
    if not conn or conn.owner_id != current_user.id:
        raise HTTPException(403, "Not your bill")
    if bill.status == BillingStatus.paid:
        raise HTTPException(400, "Bill already fully paid")
    remaining = max(0.0, bill.remaining_amount or 0)
    if remaining <= 0:
        raise HTTPException(400, "No balance remaining on this bill")
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be greater than 0")
    # Guard: subtract pending (unconfirmed) declarations from remaining
    pending_sum = sum(
        p.amount for p in (bill.payments or [])
        if not p.is_confirmed
    )
    effective_remaining = max(0.0, remaining - pending_sum)
    if effective_remaining <= 0:
        raise HTTPException(400, "No balance remaining — previous payment declarations are still pending confirmation")
    if req.amount > effective_remaining:
        raise HTTPException(400, f"Amount ₹{req.amount} exceeds available balance ₹{effective_remaining:.2f} (₹{pending_sum:.2f} already declared, awaiting confirmation)")

    payment = BillPayment(bill_id=bill.id, amount=req.amount,
                          paid_date=str(date.today()), receipt_no=make_receipt(),
                          declared_by=current_user.id, is_confirmed=False)
    db.add(payment)
    bill.status = BillingStatus.payment_declared
    db.commit()
    return {"message": f"Payment of ₹{req.amount:.2f} declared. Awaiting officer confirmation.",
            "remaining_after_confirmation": round(remaining - req.amount, 2)}

@router.post("/confirm-payment")
def confirm_payment(bill_id: int, payment_id: int, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    payment = db.query(BillPayment).filter(BillPayment.id == payment_id).first()
    if not payment: raise HTTPException(404, "Payment not found")
    if payment.is_confirmed: raise HTTPException(400, "Already confirmed")
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill: raise HTTPException(404, "Bill not found")

    payment.is_confirmed  = True
    payment.confirmed_by  = current_user.id
    new_paid      = round(bill.amount_paid + payment.amount, 2)
    new_remaining = round(bill.total_amount - new_paid, 2)
    # Guard: remaining can never go below 0
    new_remaining = max(0.0, new_remaining)
    new_paid      = round(bill.total_amount - new_remaining, 2)

    bill.amount_paid      = new_paid
    bill.remaining_amount = new_remaining
    bill.status = (BillingStatus.paid    if new_remaining <= 0
                   else BillingStatus.partial if new_paid > 0
                   else BillingStatus.pending)
    db.commit()
    return {"message": "Payment confirmed", "receipt_no": payment.receipt_no,
            "amount_confirmed": payment.amount, "total_paid": bill.amount_paid,
            "remaining": bill.remaining_amount, "status": bill.status}

@router.post("/send-notices")
def send_notices(billing_year: Optional[int] = None, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    year = billing_year or current_fy()
    due  = date(year+1, 3, 31)
    if date.today() <= due:
        raise HTTPException(400, f"Due date {due} has not passed yet.")
    unpaid = db.query(Bill).filter(
        Bill.billing_year == year,
        Bill.status.in_([BillingStatus.pending, BillingStatus.partial]),
        Bill.notice_sent == False
    ).all()
    count = 0
    for b in unpaid:
        b.notice_sent = True
        b.status      = BillingStatus.overdue
        count += 1
    db.commit()
    return {"message": f"Notices sent for {count} overdue bills in FY {year}",
            "note": "Run 'Rollover Arrears' after March 31 to close the FY, then 'Generate All' for new FY."}

@router.get("/rates")
def get_rates(db: Session = Depends(get_db)):
    rates = db.query(SystemRate).order_by(SystemRate.rate_key).all()
    return [{"id":r.id,"rate_key":r.rate_key,"rate_value":r.rate_value,
             "description":r.description,"updated_at":r.updated_at} for r in rates]

@router.put("/rates/{rate_id}")
def update_rate(rate_id: int, req: UpdateRateRequest, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.officer, UserRole.admin]:
        raise HTTPException(403, "Officers only")
    rate = db.query(SystemRate).filter(SystemRate.id == rate_id).first()
    if not rate: raise HTTPException(404, "Rate not found")
    rate.rate_value = req.rate_value
    rate.updated_by = current_user.id
    db.commit()
    return {"message": f"'{rate.rate_key}' updated to ₹{req.rate_value}",
            "note": "Affects all new bills generated after this change."}

@router.get("/receipt/{bill_id}")
def download_bill(bill_id: int, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    bill  = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill: raise HTTPException(404, "Bill not found")
    conn  = db.query(WaterConnection).filter(WaterConnection.id == bill.connection_id).first()
    owner = db.query(User).filter(User.id == conn.owner_id).first() if conn else None
    if current_user.role == UserRole.citizen and (not conn or conn.owner_id != current_user.id):
        raise HTTPException(403, "Not your bill")
    pdf = generate_bill_pdf(bill, conn, owner)
    fn  = f"Panipatti_{conn.connection_number or bill_id}_{bill.billing_year}.pdf"
    return StreamingResponse(pdf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={fn}"})

@router.get("/payment-receipt/{bill_id}")
def download_receipt(bill_id: int, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    bill  = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill: raise HTTPException(404, "Bill not found")
    if (bill.amount_paid or 0) <= 0: raise HTTPException(400, "No confirmed payments yet")
    conn  = db.query(WaterConnection).filter(WaterConnection.id == bill.connection_id).first()
    owner = db.query(User).filter(User.id == conn.owner_id).first() if conn else None
    if current_user.role == UserRole.citizen and (not conn or conn.owner_id != current_user.id):
        raise HTTPException(403, "Not your bill")
    pdf = generate_bill_pdf(bill, conn, owner, is_receipt=True)
    fn  = f"Receipt_{conn.connection_number or bill_id}_{bill.billing_year}.pdf"
    return StreamingResponse(pdf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={fn}"})

@router.post("/ai-explain")
def ai_explain(req: AIExplainRequest, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    bill  = db.query(Bill).filter(Bill.id == req.bill_id).first()
    if not bill: raise HTTPException(404, "Bill not found")
    conn  = db.query(WaterConnection).filter(WaterConnection.id == bill.connection_id).first()
    owner = db.query(User).filter(User.id == conn.owner_id).first() if conn else None
    if current_user.role == UserRole.citizen and (not conn or conn.owner_id != current_user.id):
        raise HTTPException(403, "Not your bill")

    lang_map = {"marathi":"Reply ONLY in Marathi (Devanagari). Simple words.",
                "hindi":  "Reply ONLY in Hindi (Devanagari). Simple words.",
                "english":"Reply in simple English."}
    name = owner.name if owner else (conn.applicant_name if conn else "Consumer")
    remaining = max(0.0, bill.remaining_amount or 0)
    prompt = f"""CiviCare water bill assistant for Phaltan Municipal Council.
Explain this panipatti bill to {name}:
FY {bill.billing_year}-{bill.billing_year+1} | {CONN_LABEL.get(str(conn.connection_type),'Domestic')} | {PIPE_LABEL.get(str(conn.pipe_size),'½ inch')}
Flat rate: ₹{bill.panipatti_rate} | Arrears: ₹{bill.arrears or 0} | Total: ₹{bill.total_amount}
Paid: ₹{bill.amount_paid or 0} | Remaining: ₹{remaining} | Due: {due_date(bill.billing_year)}
{lang_map.get(req.language, lang_map['english'])}
Max 4 sentences. Mention arrears if any. State remaining balance clearly."""

    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        return {"explanation": f"तुमचे FY {bill.billing_year}-{bill.billing_year+1} चे पाणी पट्टी बिल ₹{bill.total_amount} आहे. उर्वरित ₹{remaining} भरायचे आहे. देय तारीख {due_date(bill.billing_year)}."}
    try:
        from google import genai
        client = genai.Client(api_key=settings.GEMINI_API_KEY, http_options={"api_version":"v1"})
        r = client.models.generate_content(model="models/gemini-2.5-flash",
            contents=[{"role":"user","parts":[{"text":prompt}]}],
            config={"temperature":0.3,"max_output_tokens":1000})
        return {"explanation": r.text.strip()}
    except Exception as e:
        return {"explanation": f"बिल ₹{bill.total_amount}. उर्वरित ₹{remaining}. देय {due_date(bill.billing_year)}."}

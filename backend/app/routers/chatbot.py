# chatbot.py — CiviCare v4
from pyexpat import model

from fastapi import APIRouter, Depends
from google import genai
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from app.database import get_db
from app.models.models import User, WaterConnection, Bill, BillingStatus, SupplyLog, Complaint, ComplaintStatus
from app.routers.auth import get_current_user
from app.config import settings
from datetime import date

router = APIRouter()

# ── System prompt ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are CiviCare Assistant for Phaltan Municipal Council's water management portal.

YOUR ROLE: Help citizens with water service queries ONLY. Be concise (2-4 sentences max).

SYSTEM RULES YOU MUST KNOW:
- New connections require Aadhaar + property document (both compulsory, uploaded online)
- Login: Consumer Number format PMC-YYYY-XXXXX (e.g. PMC-2024-10001). Initial password = Consumer Number.
- Bills: Annual flat-rate (no meter). Pipe size + connection type determines amount. Due date: March 31 every year.
- Unpaid balance after March 31 becomes arrear added to next year's bill.
- Pay oldest unpaid bill first before newer ones.
- Disconnection warning after 3 months overdue. Auto-disconnect after 6 months.
- Reconnection fee: ₹500. Disconnection blocked if bills are unpaid.
- Complaints: assigned to plumber for infra issues (pipe burst, no supply, low pressure, dirty water). Billing complaints handled by officer.
- Service requests: name transfer, temp/perm disconnection, reconnection, pipe size change.
- SLA: Pipe burst = 4h, Dirty water = 8h, No supply = 12h, Low pressure = 24h.

LANGUAGE: Reply in the same language the user writes in. Marathi/Hindi are common — support them naturally.

OUT OF SCOPE: If asked anything unrelated to water services, reply: "मी फक्त पाण्याच्या सेवांसाठी मदत करू शकतो. / I can only help with water services."

Do NOT make up data. If you don't know something specific, say so and direct to the municipal office."""


def build_citizen_context(user: User, db: Session) -> str:
    """Build a rich, natural-language context string from live DB data."""
    lines = ["CITIZEN DETAILS:"]
    lines.append(f"- Name: {user.name}")
    lines.append(f"- Property Number: {user.property_number or 'None'}")
    lines.append(f"- Ward: {user.ward_id or 'Not assigned'}")

    conn = db.query(WaterConnection).filter(WaterConnection.owner_id == user.id).first()
    if conn:
        lines.append(f"- Connection: {conn.status.upper()} | {conn.connection_type} | Pipe {conn.pipe_size}\"  ")
        lines.append(f"- Address: {conn.address}")

        # Unpaid bills
        unpaid = db.query(Bill).filter(
            Bill.connection_id == conn.id,
            Bill.status.in_([BillingStatus.pending, BillingStatus.overdue,
                              BillingStatus.partial, BillingStatus.payment_declared,BillingStatus.absorbed])
        ).order_by(Bill.billing_year.asc()).all()
        if unpaid:
            lines.append(f"- Unpaid bills ({len(unpaid)}):")
            for b in unpaid:
                status_note = "(arrear absorbed into next bill)" if b.status == BillingStatus.absorbed else ""
                lines.append(f"    FY {b.billing_year}-{b.billing_year+1}: Rs.{b.total_amount} ({b.status}) due {b.due_date} {status_note}".strip())
        
        else:
            last_paid = db.query(Bill).filter(
                Bill.connection_id == conn.id, Bill.status == BillingStatus.paid
            ).order_by(Bill.billing_year.desc()).first()
            lines.append(f"- Bills: {'All paid. Last FY ' + str(last_paid.billing_year) if last_paid else 'None generated yet.'}")

        # Open complaints
        open_c = db.query(Complaint).filter(
            Complaint.user_id == user.id,
            Complaint.status != ComplaintStatus.resolved
        ).order_by(Complaint.created_at.desc()).limit(3).all()
        if open_c:
            lines.append(f"- Open complaints ({len(open_c)}):")
            for c in open_c:
                lines.append(f"    {c.complaint_type} | WO:{c.work_order_no} | {c.status}")
        else:
            lines.append("- No open complaints.")
    else:
        lines.append("- No active water connection.")

    # Today's supply
    if user.ward_id:
        today_log = db.query(SupplyLog).filter(
            SupplyLog.ward_id == user.ward_id,
            SupplyLog.date == str(date.today())
        ).first()
        supply_str = today_log.status if today_log else "not yet logged"
        if today_log and today_log.supply_start:
            supply_str += f" from {today_log.supply_start}"
        if today_log and today_log.reason:
            supply_str += f" ({today_log.reason})"
        lines.append(f"- Today's supply Ward {user.ward_id}: {supply_str}")

    return "\n".join(lines)


class ChatMessage(BaseModel):
    role: str   # "user" or "model"
    text: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


def detect_language(text: str) -> str:
    # Detect Marathi (Devanagari)
    if any('\u0900' <= ch <= '\u097F' for ch in text):
        return "marathi"
    return "english"


def call_gemini(system_prompt: str, citizen_context: str,
                history: List[ChatMessage], new_message: str):
    """Stable Gemini call with language control + history + fallback"""

    try:
        client = genai.Client(
            api_key=settings.GEMINI_API_KEY,
            http_options={"api_version": "v1"}
        )

        # ── Language Control ──
        lang = detect_language(new_message)

        if lang == "marathi":
            language_instruction = "Reply STRICTLY in Marathi. Do NOT use English."
        else:
            language_instruction = "Reply STRICTLY in English. Do NOT use Marathi or Hindi."

        # ── Convert history → text (better than chat session) ──
        history_text = "\n".join(
            [f"{m.role}: {m.text}" for m in history[-6:]]
        )

        # ── Build final prompt ──
        full_prompt = f"""
{system_prompt}

{language_instruction}

CITIZEN DATA:
{citizen_context if citizen_context else "No personal data available"}

CONVERSATION:
{history_text}

USER QUESTION:
{new_message}
"""

        # ── Gemini Call ──
        response = client.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=[
                {"role": "user", "parts": [{"text": full_prompt}]}
            ],
            config={
                "temperature": 0.3,
                "max_output_tokens": 180
            }
        )

        # ── Safe extraction ──
        try:
            reply = response.candidates[0].content.parts[0].text.strip()
        except:
            return None

        # ── Weak response fix ──
        if not reply or len(reply) < 15:
            if lang == "marathi":
                return "माहिती सध्या उपलब्ध नाही. कृपया नंतर पुन्हा तपासा."
            else:
                return "Information is not available right now. Please try again later."

        return reply

    except Exception as e:
        print("Gemini error:", e)
        return None


@router.post("/message")
def chat_public(req: ChatRequest, db: Session = Depends(get_db)):
    """Public endpoint — system rules only, no personal data."""
    if settings.GEMINI_API_KEY:
        reply = call_gemini(SYSTEM_PROMPT, "", req.history, req.message)
        if reply:
            return {"response": reply, "source": "gemini"}
    return {"response": rule_based_response(req.message), "source": "rule_based"}


@router.post("/message-authenticated")
def chat_authenticated(req: ChatRequest, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Authenticated endpoint — Gemini gets full live citizen context."""
    citizen_context = build_citizen_context(current_user, db)

    if settings.GEMINI_API_KEY:
        reply = call_gemini(SYSTEM_PROMPT, citizen_context, req.history, req.message)
        if reply:
            return {"response": reply, "source": "gemini"}

    return {"response": rule_based_response(req.message), "source": "rule_based"}


def rule_based_response(message: str) -> str:
    """Fallback when Gemini is unavailable."""
    msg = message.lower()
    if any(w in msg for w in ["apply", "new connection", "नवीन", "अर्ज"]):
        return "Apply for Connection वर जा. Aadhaar proof आणि property proof अपलोड करणे अनिवार्य आहे. Inspection नंतर connection active होईल."
    elif any(w in msg for w in ["login", "password", "पासवर्ड", "consumer number"]):
        return "Consumer Number (PMC-YYYY-XXXXX) वापरून login करा. Initial password = Consumer Number. पहिल्या login नंतर password बदलणे आवश्यक आहे."
    elif any(w in msg for w in ["bill", "payment", "बिल", "भरणा", "पाणी पट्टी"]):
        return "वार्षिक पाणीपट्टी pipe size आणि connection type नुसार ठरते. Due date: March 31. न भरलेले पैसे पुढील वर्षाच्या बिलात arrear म्हणून जोडले जातात. जुने बिल आधी भरा."
    elif any(w in msg for w in ["complaint", "no water", "तक्रार", "पाणी नाही", "pipe burst", "dirty"]):
        return "Login → Complaints tab → तक्रार नोंदवा. Pipe burst/no supply साठी plumber assign केला जाईल (4-12h SLA)."
    elif any(w in msg for w in ["name transfer", "transfer"]):
        return "Services tab → Name Transfer. नवीन मालकाचे नाव, फोन आणि documents द्या. Officer approve करेल."
    elif any(w in msg for w in ["disconnect", "reconnect", "reconnection"]):
        return "Services tab मध्ये जा. Reconnection fee Rs.500 आहे. Unpaid bills असल्यास disconnection होणार नाही."
    elif any(w in msg for w in ["track", "application", "status"]):
        return "Track Application page वर जा आणि तुमचा Application ID टाका."
    else:
        return "मी water connections, bills, complaints आणि service requests साठी मदत करू शकतो. कृपया प्रश्न नीट सांगा."
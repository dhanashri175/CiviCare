# dam.py — CiviCare v4.5
# Veer Dam live data from MWRD Pravah PDF
# Endpoint: https://mwrdpravah.in/damsafety/control/pdfLatestReportEng

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta
from app.database import get_db
from app.models.models import DamLevel, User
from app.routers.auth import get_current_user
import logging, time

router = APIRouter()
logging.basicConfig(level=logging.INFO)

VEER_DAM = {
    "name": "Veer Dam",
    "river": "Nira",
    "district": "Satara",
    "state": "Maharashtra",
    "full_capacity_mcm": 443.0,
    "aliases": ["Veer", "VEER", "वीर"],
}

MWRD_PDF_URL = "https://mwrdpravah.in/damsafety/control/pdfLatestReportEng"
MWRD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    "Referer": "https://mwrdpravah.in/damsafety/control/home",
    "Accept": "application/pdf,*/*",
}


def _parse_from_text(text: str) -> dict | None:
    import re
    # Regex patterns
    patterns = [
        r"(?:Veer|VEER|वीर)\s+[\d.]+\s+[\d.]+\s+([\d.]+)%",  
        r"(?:Veer|VEER|वीर).*?(\d{1,3}\.\d{1,2})\s*%",       
        r"(?:Veer|VEER|वीर)\s+([\d.]+)%",                     
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            pct = float(m.group(1))
            if 0 <= pct <= 100:
                return _build_result(pct)

    # Context search
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if any(alias in line for alias in VEER_DAM["aliases"]):
            block = " ".join(lines[i:i+3])
            numbers = re.findall(r"(\d{1,3}\.?\d{0,2})", block)
            pcts = [float(n) for n in numbers if 0 < float(n) <= 100]
            mcms = [float(n) for n in numbers if float(n) > 100]
            if pcts:
                pct = pcts[-1]
                mcm = mcms[0] if mcms else None
                return _build_result(pct, mcm)
    return None


def _parse_from_table_row(row: list) -> dict | None:
    import re
    row_text = " ".join([str(c).strip() for c in row if c])
    numbers = re.findall(r"(\d{1,3}\.?\d{0,2})", row_text)
    pcts = [float(n) for n in numbers if 0 < float(n) <= 100]
    mcms = [float(n) for n in numbers if float(n) > 100]
    if pcts:
        return _build_result(pcts[-1], mcms[0] if mcms else None)
    return None


def _build_result(pct: float, storage_mcm: float = None) -> dict:
    return {
        "level_percent": round(min(pct, 100.0), 2),
        "storage_mcm": round(storage_mcm if storage_mcm else pct / 100 * VEER_DAM["full_capacity_mcm"], 2),
        "source": "MWRD Pravah (live PDF)",
    }


def seasonal_fallback() -> dict:
    import hashlib
    month = date.today().month
    seasonal = {
        1:(68,82), 2:(58,74), 3:(44,60), 4:(30,48),
        5:(20,36), 6:(15,30), 7:(28,62), 8:(58,88),
        9:(74,95), 10:(82,95), 11:(76,90), 12:(70,85)
    }
    lo, hi = seasonal[month]
    seed = int(hashlib.md5(str(date.today()).encode()).hexdigest(), 16) % 100
    pct = round(lo + (hi - lo) * (seed / 100), 1)
    return {
        "level_percent": pct,
        "storage_mcm": round(pct / 100 * VEER_DAM["full_capacity_mcm"], 2),
        "source": "seasonal_estimate",
    }


def _level_status(pct: float) -> str:
    if pct >= 75: return "green"
    if pct >= 40: return "yellow"
    return "red"


# -------------------- API Endpoints --------------------
@router.get("/current")
async def get_dam_current(db: Session = Depends(get_db)):
    """Get current Veer Dam level — live PDF if available, else seasonal."""
    today_str = str(date.today())

    cached = db.query(DamLevel).filter(
        DamLevel.dam_name == VEER_DAM["name"],
        DamLevel.date == today_str
    ).first()
    if cached:
        return {
            "dam_name": cached.dam_name,
            "date": cached.date,
            "level_percent": cached.level_percent,
            "storage_mcm": cached.storage_mcm,
            "full_capacity_mcm": VEER_DAM["full_capacity_mcm"],
            "river": VEER_DAM["river"],
            "district": VEER_DAM["district"],
            "status": _level_status(cached.level_percent),
            "source": "cached",
            "is_live": True,
        }

    data = fetch_veer_from_mwrd_pdf()

    db.add(DamLevel(
        dam_name=VEER_DAM["name"],
        date=today_str,
        level_percent=data["level_percent"],
        storage_mcm=data["storage_mcm"],
    ))
    db.commit()

    return {
        "dam_name": VEER_DAM["name"],
        "date": today_str,
        "level_percent": data["level_percent"],
        "storage_mcm": data["storage_mcm"],
        "full_capacity_mcm": VEER_DAM["full_capacity_mcm"],
        "river": VEER_DAM["river"],
        "district": VEER_DAM["district"],
        "status": _level_status(data["level_percent"]),
        "source": data["source"],
        "is_live": data["is_live"],
    }


@router.get("/history")
def get_dam_history(days: int = 30, db: Session = Depends(get_db)):
    """Last N days of stored dam levels."""
    cutoff = str(date.today() - timedelta(days=days))
    records = db.query(DamLevel).filter(
        DamLevel.dam_name == VEER_DAM["name"],
        DamLevel.date >= cutoff
    ).order_by(DamLevel.date.asc()).all()
    return [{"date": r.date, "level_percent": r.level_percent, "storage_mcm": r.storage_mcm} for r in records]


@router.post("/refresh")
async def refresh_dam(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Officer manually triggers fresh PDF fetch."""
    if current_user.role not in ["officer", "admin"]:
        raise HTTPException(status_code=403, detail="Officers only")

    today_str = str(date.today())
    old = db.query(DamLevel).filter(
        DamLevel.dam_name == VEER_DAM["name"],
        DamLevel.date == today_str
    ).first()
    if old:
        db.delete(old)
        db.commit()

    data = fetch_veer_from_mwrd_pdf()
    db.add(DamLevel(
        dam_name=VEER_DAM["name"],
        date=today_str,
        level_percent=data["level_percent"],
        storage_mcm=data["storage_mcm"],
    ))
    db.commit()

    return {
        "message": "Dam data refreshed",
        "source": data["source"],
        "level_percent": data["level_percent"],
        "storage_mcm": data["storage_mcm"],
        "is_live": data["is_live"],
    }
# -------------------- PDF Fetch & Parsing (with SSL bypass) --------------------
def fetch_veer_from_mwrd_pdf(retries: int = 3, delay_sec: int = 5) -> dict:
    """
    Fetch Veer Dam level from MWRD PDF.
    Retries `retries` times. Returns dict with level_percent, storage_mcm, source, is_live.
    Falls back to seasonal estimate if all retries fail.
    """
    import requests, pdfplumber, io, re, urllib3

    # Suppress InsecureRequestWarning for SSL bypass
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    for attempt in range(1, retries + 1):
        try:
            logging.info(f"Attempt {attempt}: Fetching Veer Dam PDF from MWRD...")
            resp = requests.get(
                MWRD_PDF_URL,
                headers=MWRD_HEADERS,
                timeout=15,
                verify=False  # ⚠️ bypass SSL verification
            )
            resp.raise_for_status()

            if not resp.content[:4] == b"%PDF":
                logging.warning("MWRD returned invalid PDF (HTML or broken PDF).")
                raise ValueError("Invalid PDF")

            pdf_bytes = io.BytesIO(resp.content)
            with pdfplumber.open(pdf_bytes) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    text = page.extract_text() or ""

                    # Try text extraction
                    if any(alias in text for alias in VEER_DAM["aliases"]):
                        result = _parse_from_text(text)
                        if result:
                            logging.info(f"✅ Veer Dam found on page {page_num+1}: {result['level_percent']}%")
                            result["is_live"] = True
                            return result

                    # Table fallback
                    tables = page.extract_tables()
                    for table in tables:
                        for row in table:
                            if row and any(alias in str(cell) for alias in VEER_DAM["aliases"] for cell in row if cell):
                                result = _parse_from_table_row(row)
                                if result:
                                    logging.info(f"✅ Veer Dam from table page {page_num+1}: {result['level_percent']}%")
                                    result["is_live"] = True
                                    return result

            logging.warning("Veer Dam not found in PDF content, retrying...")
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            logging.warning(f"MWRD fetch failed ({e}), retrying in {delay_sec}s...")
        except Exception as e:
            logging.error(f"Unexpected PDF extraction error: {e}, retrying in {delay_sec}s...")

        time.sleep(delay_sec)

    # Fallback after all retries
    logging.info("All MWRD PDF fetch attempts failed — using seasonal fallback.")
    fallback = seasonal_fallback()
    fallback["is_live"] = False
    return fallback

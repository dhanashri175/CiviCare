# dashboard.py — CiviCare v4 (complaint stats, no connection stats, no water quality)
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Complaint, SupplyLog, DamLevel, Ward, ComplaintStatus, ComplaintType
from datetime import date, timedelta

router = APIRouter()

@router.get("/public")
def get_public_dashboard(db: Session = Depends(get_db)):
    today      = str(date.today())
    thirty_ago = str(date.today() - timedelta(days=30))
    seven_ago  = str(date.today() - timedelta(days=7))

    wards = db.query(Ward).order_by(Ward.ward_no).all()

    # ── Bulk fetch to avoid N+1 queries ──────────────────────────────────────
    # One query each — group in Python
    all_supply_30d = db.query(SupplyLog).filter(SupplyLog.date >= thirty_ago).all()
    all_supply_today = db.query(SupplyLog).filter(SupplyLog.date == today).all()
    all_complaints = db.query(Complaint).all()

    # Index by ward_id
    supply_by_ward   = {}
    for l in all_supply_30d:
        supply_by_ward.setdefault(l.ward_id, []).append(l)
    today_by_ward = {l.ward_id: l for l in all_supply_today}
    comps_by_ward = {}
    for c in all_complaints:
        comps_by_ward.setdefault(c.ward_id, []).append(c)

    ward_stats = []
    for ward in wards:
        logs     = supply_by_ward.get(ward.id, [])
        supplied = sum(1 for l in logs if l.status == "supplied")
        today_log = today_by_ward.get(ward.id)

        comps     = comps_by_ward.get(ward.id, [])
        total_c   = len(comps)
        resolved_c = sum(1 for c in comps if c.status == ComplaintStatus.resolved)
        open_c    = sum(1 for c in comps if c.status == ComplaintStatus.open)
        this_month = sum(1 for c in comps if c.created_at and str(c.created_at)[:10] >= thirty_ago)
        this_week  = sum(1 for c in comps if c.created_at and str(c.created_at)[:10] >= seven_ago)

        type_counts = {}
        for c in comps:
            type_counts[c.complaint_type] = type_counts.get(c.complaint_type, 0) + 1
        top_type = max(type_counts, key=type_counts.get) if type_counts else None

        resolved_timed = [c for c in comps if c.status == "resolved" and c.resolved_at and c.created_at]
        avg_resolution_h = None
        if resolved_timed:
            total_h = sum((c.resolved_at - c.created_at).total_seconds() / 3600 for c in resolved_timed)
            avg_resolution_h = round(total_h / len(resolved_timed), 1)

        ward_stats.append({
            "ward_id":               ward.id,
            "ward_no":               ward.ward_no,
            "ward_name":             ward.ward_name,
            "area_name":             ward.area_name,
            "supply_score_30d":      round(supplied / 30 * 100, 1),
            "today_status":          today_log.status if today_log else "not_logged",
            "today_supply_start":    today_log.supply_start if today_log else None,
            "total_complaints":      total_c,
            "resolved_complaints":   resolved_c,
            "open_complaints":       open_c,
            "complaints_this_month": this_month,
            "complaints_this_week":  this_week,
            # Fix: denominator is total_c (all statuses), not just open+resolved
            "resolution_rate":       round(resolved_c / total_c * 100, 1) if total_c else 0,
            "avg_resolution_hours":  avg_resolution_h,
            "top_complaint_type":    top_type,
        })

    dam   = db.query(DamLevel).order_by(DamLevel.date.desc()).first()
    level = dam.level_percent if dam else 50

    city_total    = len(all_complaints)
    city_open     = sum(1 for c in all_complaints if c.status == ComplaintStatus.open)
    city_resolved = sum(1 for c in all_complaints if c.status == ComplaintStatus.resolved)
    city_month    = sum(1 for c in all_complaints if c.created_at and str(c.created_at)[:10] >= thirty_ago)

    return {
        "date": today,
        "ward_stats": ward_stats,
        "dam_level": {
            "level_percent": level,
            "storage_mcm":   dam.storage_mcm if dam else None,
            "dam_name":      dam.dam_name if dam else "Veer Dam",
            "last_updated":  dam.date if dam else None,
            "status":        "green" if level >= 60 else ("yellow" if level >= 30 else "red")
        },
        "city_stats": {
            "open_complaints":         city_open,
            "resolved_complaints":     city_resolved,
            "complaints_this_month":   city_month,
            # Fix: divide by total (all statuses) — not just open+resolved
            "overall_resolution_rate": round(city_resolved / city_total * 100, 1) if city_total else 0
        }
    }

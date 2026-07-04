# billing_calculator.py — CiviCare v6
# ALL rates read from SystemRate DB table — zero hardcoded values in logic.
# Seed rates below are only for first-time DB population via simulate_data.py.
# Flat rate: panipatti = rate for (pipe_size, connection_type). No multipliers.

from sqlalchemy.orm import Session

# ── SEED RATES (DB population only — not used in calculations) ────────────────
SEED_RATES = {
    # Annual panipatti — flat rate (INR/year) by pipe_size × connection_type
    "panipatti_0.5_domestic":   2000,
    "panipatti_0.5_commercial": 4000,
    "panipatti_0.75_domestic":  3000,
    "panipatti_0.75_commercial":6000,
    "panipatti_1.0_domestic":   4500,
    "panipatti_1.0_commercial": 9000,
    "panipatti_1.5_domestic":   8000,
    "panipatti_1.5_commercial": 16000,

    # One-time refundable deposit — pipe_size × connection_type
    "deposit_0.5_domestic":   2000,
    "deposit_0.5_commercial": 6500,
    "deposit_0.75_domestic":  3000,
    "deposit_0.75_commercial":8000,
    "deposit_1.0_domestic":   4500,
    "deposit_1.0_commercial": 12000,
    "deposit_1.5_domestic":   7000,
    "deposit_1.5_commercial": 18000,

    # One-time fitting charges — per pipe size
    "fitting_0.5":  710,
    "fitting_0.75": 900,
    "fitting_1.0":  1200,
    "fitting_1.5":  1800,

    # One-time maintenance charges — per pipe size
    "maintenance_0.5":  3500,
    "maintenance_0.75": 4200,
    "maintenance_1.0":  5500,
    "maintenance_1.5":  7500,

    # Per-metre charge when main water line is more than 1m from connection point
    "pipe_distance_per_meter": 640,
}

SEED_DESCRIPTIONS = {
    "panipatti_0.5_domestic":   "Annual panipatti — ½\" domestic",
    "panipatti_0.5_commercial": "Annual panipatti — ½\" commercial",
    "panipatti_0.75_domestic":  "Annual panipatti — ¾\" domestic",
    "panipatti_0.75_commercial":"Annual panipatti — ¾\" commercial",
    "panipatti_1.0_domestic":   "Annual panipatti — 1\" domestic",
    "panipatti_1.0_commercial": "Annual panipatti — 1\" commercial",
    "panipatti_1.5_domestic":   "Annual panipatti — 1½\" domestic",
    "panipatti_1.5_commercial": "Annual panipatti — 1½\" commercial",
    "deposit_0.5_domestic":   "Refundable deposit — ½\" domestic",
    "deposit_0.5_commercial": "Refundable deposit — ½\" commercial",
    "deposit_0.75_domestic":  "Refundable deposit — ¾\" domestic",
    "deposit_0.75_commercial":"Refundable deposit — ¾\" commercial",
    "deposit_1.0_domestic":   "Refundable deposit — 1\" domestic",
    "deposit_1.0_commercial": "Refundable deposit — 1\" commercial",
    "deposit_1.5_domestic":   "Refundable deposit — 1½\" domestic",
    "deposit_1.5_commercial": "Refundable deposit — 1½\" commercial",
    "fitting_0.5":  "Fitting charges — ½\" pipe",
    "fitting_0.75": "Fitting charges — ¾\" pipe",
    "fitting_1.0":  "Fitting charges — 1\" pipe",
    "fitting_1.5":  "Fitting charges — 1½\" pipe",
    "maintenance_0.5":  "Maintenance charges — ½\" pipe",
    "maintenance_0.75": "Maintenance charges — ¾\" pipe",
    "maintenance_1.0":  "Maintenance charges — 1\" pipe",
    "maintenance_1.5":  "Maintenance charges — 1½\" pipe",
    "pipe_distance_per_meter": "Per-metre charge when main line is >1m away",
}


def get_rate(db: Session, key: str) -> float:
    """Fetch a single rate from DB. Raises ValueError if key not found."""
    from app.models.models import SystemRate
    row = db.query(SystemRate).filter(SystemRate.rate_key == key).first()
    if row is None:
        raise ValueError(f"Rate '{key}' not found in system_rates. Run simulate_data.py to seed.")
    return row.rate_value


def calculate_annual_bill(pipe_size: str, connection_type: str,
                           arrears: float, db: Session) -> dict:
    """
    Calculate annual panipatti. Flat rate — no construction multiplier.
    Reads rate from DB at call time (snapshot stored on Bill record).
    """
    key  = f"panipatti_{pipe_size}_{connection_type}"
    rate = get_rate(db, key)
    total = round(rate + arrears, 2)
    return {
        "panipatti_rate": rate,
        "arrears":        round(arrears, 2),
        "total":          total,
    }


def calculate_connection_charges(pipe_size: str, connection_type: str,
                                  pipe_distance_meters: float, db: Session) -> dict:
    """
    Calculate one-time connection charges from DB rates.
    Pipe distance charge only applies when distance > 1m.
    """
    deposit     = get_rate(db, f"deposit_{pipe_size}_{connection_type}")
    fitting     = get_rate(db, f"fitting_{pipe_size}")
    maintenance = get_rate(db, f"maintenance_{pipe_size}")
    dist_rate   = get_rate(db, "pipe_distance_per_meter")

    pipe_dist_charge = 0.0
    dist = pipe_distance_meters or 0
    if dist > 1:
        pipe_dist_charge = round(dist * dist_rate, 2)

    total = round(deposit + fitting + maintenance + pipe_dist_charge, 2)
    return {
        "deposit":               deposit,
        "fitting_charges":       fitting,
        "maintenance_charges":   maintenance,
        "pipe_distance_meters":  dist,
        "pipe_distance_charges": pipe_dist_charge,
        "total":                 total,
    }


def seed_rates(db: Session):
    """Seed default rates into system_rates. Skips keys that already exist."""
    from app.models.models import SystemRate
    inserted = 0
    for key, value in SEED_RATES.items():
        if not db.query(SystemRate).filter(SystemRate.rate_key == key).first():
            db.add(SystemRate(
                rate_key=key, rate_value=value,
                description=SEED_DESCRIPTIONS.get(key, key)
            ))
            inserted += 1
    db.commit()
    return inserted

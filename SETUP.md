# CiviCare v4 — Setup Guide
## AI-Powered Municipal Water Governance System
### Phaltan Municipal Council

---

## What's New in v4

- ✅ Renamed JalSetu → CiviCare throughout
- ✅ Glassmorphism warm amber UI (terracotta/saffron theme)
- ✅ Document proofs COMPULSORY during application (Aadhaar + Property)
- ✅ Plumber gets own separate portal (only sees assigned complaints)
- ✅ Water quality prediction module REMOVED (was simulated)
- ✅ Dashboard shows complaint transparency (not connection counts)
- ✅ Billing: PDF bill receipt + payment receipt downloadable
- ✅ AI Smart Billing Explainer in Marathi/Hindi (Gemini)
- ✅ Duplicate complaint detection (auto-checks same ward + type within 72h)
- ✅ Speech to text for complaint filing (elderly-friendly, Marathi/Hindi)
- ✅ Announcements: SMS via Twilio + AI text suggester
- ✅ Chatbot fixed (gemini-2.0-flash, correct model)
- ✅ New DB: civicare_db

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Gemini API Key (free from aistudio.google.com)
- Twilio Account (free trial at twilio.com)
- Cloudinary Account (existing from v3)

---

## Step 1 — Create Database

```bash
psql -U postgres
CREATE DATABASE civicare_db;
\q
```

---

## Step 2 — Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in your values in .env

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### .env file:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/civicare_db
SECRET_KEY=civicare-muni-secret-2025
GEMINI_API_KEY=your_key_from_aistudio.google.com
CLOUDINARY_CLOUD=dkuc9arra
CLOUDINARY_PRESET=jalsetu_uploads
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

---

## Step 3 — Seed Database

```bash
cd backend
python simulate_data.py
```

This creates:
- Wards 1-5 (Phaltan area names)
- 1 Officer, 3 Plumbers, 2 Corporators
- Sample citizens, connections, supply logs, complaints

---

## Step 4 — Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:3000

---

## Step 5 — Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy and paste into .env as GEMINI_API_KEY

Used for:
- Chatbot (citizen queries in Marathi/Hindi/English)
- Smart Bill Explainer (explains bill in Marathi/Hindi)
- AI Announcement Suggester (generates text based on complaint trends)

---

## Step 6 — Twilio SMS Setup

1. Go to https://twilio.com/try-twilio
2. Sign up (free trial)
3. Verify your Indian phone number
4. Copy Account SID, Auth Token, Phone Number from dashboard
5. Add to .env

SMS is sent when officer posts announcement with "Send SMS" checkbox ticked.

---

## Login Credentials (after seeding)

| Role       | Login                        | Password         |
|------------|------------------------------|------------------|
| Officer    | officer@phaltan.gov.in       | officer123       |
| Plumber 1  | plumber1@phaltan.gov.in      | plumber123       |
| Citizen    | Consumer Number (PMC-YYYY-X) | Consumer Number  |

---

## AI Features

| Feature | Where | API |
|---|---|---|
| Chatbot | Citizen → Assistant tab | Gemini |
| Bill Explainer | Citizen → Bills → "Explain My Bill" | Gemini |
| Duplicate Check | Citizen → File Complaint | Local DB |
| Speech to Text | Citizen → Complaint description | Browser Web Speech API |
| Announcement Suggester | Officer → Announcements | Gemini |
| SMS Announcements | Officer → Announcements | Twilio |

---

## Key Changes from v3

1. `water_quality` router and model REMOVED
2. `announcements` is now its own router (was part of supply.py)
3. Plumber uses `PlumberPortal.jsx` (no longer shares OfficerDashboard)
4. Bills have `/receipt/{id}` and `/payment-receipt/{id}` PDF endpoints
5. Complaints have `/duplicate-check` endpoint
6. Dashboard shows complaint stats not connection counts
7. `civicare_token` replaces `jalsetu_token` in localStorage

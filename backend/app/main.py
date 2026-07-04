from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import (auth, connections, billing, complaints, supply,
                          dashboard, service_requests, chatbot, users,
                          announcements, faults, dam)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="CiviCare Municipal Water Management API", version="4.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000","http://localhost:3001","http://localhost:5173"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

app.include_router(auth.router,             prefix="/api/auth",             tags=["Authentication"])
app.include_router(users.router,            prefix="/api/users",            tags=["Users"])
app.include_router(connections.router,      prefix="/api/connections",      tags=["Connections"])
app.include_router(billing.router,          prefix="/api/billing",          tags=["Billing"])
app.include_router(complaints.router,       prefix="/api/complaints",       tags=["Complaints"])
app.include_router(supply.router,           prefix="/api/supply",           tags=["Supply"])
app.include_router(service_requests.router, prefix="/api/service-requests", tags=["Service Requests"])
app.include_router(chatbot.router,          prefix="/api/chatbot",          tags=["Chatbot"])
app.include_router(dashboard.router,        prefix="/api/dashboard",        tags=["Dashboard"])
app.include_router(announcements.router,    prefix="/api/announcements",    tags=["Announcements"])
app.include_router(faults.router,           prefix="/api/faults",           tags=["Fault Detection"])


@app.get("/")
def root():
    return {"message": "CiviCare Municipal Water Management API v4.1", "docs": "/docs"}
# Include router
app.include_router(dam.router, prefix="/api/dam", tags=["Dam Data"])

# Start background task

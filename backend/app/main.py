from fastapi import FastAPI
from app.api.health import router as health_router
from app.api import transactions, scores, cases, audit_logs
# The modules above should each define `router = APIRouter(...)`

# Create the FastAPI application instance (this is what Uvicorn runs).
app = FastAPI(title="Fraud RPA Backend")

# Simple liveness endpoint for containers/monitors (K8s/Compose/health checks).
@app.get("/healthz")
async def health():
    return {"status": "ok"}

# Wire in the feature routers so their routes become part of the app.
# If any of these modules don’t exist or don’t define `router`, import will fail.
app.include_router(health_router, prefix="/api")

app.include_router(transactions.router)
app.include_router(scores.router)
app.include_router(cases.router)
app.include_router(audit_logs.router)
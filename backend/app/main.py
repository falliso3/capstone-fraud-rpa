from fastapi import FastAPI
from app.api.health import router as health_router
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
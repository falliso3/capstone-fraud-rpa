from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.health import router as health_router
from app.api import transactions, scores, cases, audit_logs
from app.api import scores
from app.api import reports
# The modules above should each define `router = APIRouter(...)`

# Create the FastAPI application instance (this is what Uvicorn runs).
app = FastAPI(title="Fraud RPA Backend")

# --- CORS configuration ---
# Allow the React app (localhost:3000 during development) and our Netlify site
# to call this API from the browser.
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # add  deployed Netlify URL when we know it, eg:
    # "https://fraud-rpa-frontend.netlify.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],   # allow GET, POST, etc.
    allow_headers=["*"],   # allow all request headers
)
# --- end CORS configuration ---

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
app.include_router(reports.router)


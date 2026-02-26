import os
import json
import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI
from pydantic import BaseModel

from features import FEATURE_COLUMNS

ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")
LATEST_PATH = os.path.join(ARTIFACT_DIR, "LATEST.json")

app = FastAPI(title="Fraud Model Scoring Service")

model = None
model_version = None

def load_latest():
    global model, model_version

    if not os.path.exists(LATEST_PATH):
        raise RuntimeError("No artifacts/LATEST.json found. Run train.py first.")

    with open(LATEST_PATH, "r", encoding="utf-8") as f:
        latest = json.load(f)

    model_version = latest["version"]
    model_path = latest["model_path"]
    model = joblib.load(model_path)
    return model_version

class ScoreRequest(BaseModel):
    log_amount: float = 0.0
    stripe_risk_score: float = 0.0
    internal_score: float = 0.0
    cnt10m: float = 0.0
    cnt1h: float = 0.0
    totalAmount1h: float = 0.0
    smallCount1h: float = 0.0
    failCount30m: float = 0.0
    cvc_fail: float = 0.0
    postal_fail: float = 0.0
    addr_checks_missing: float = 0.0
    country_mismatch_card_ship: float = 0.0
    country_mismatch_card_bill: float = 0.0
    has_fingerprint: float = 0.0

@app.on_event("startup")
def startup():
    v = load_latest()
    print(f"✅ Loaded model: {v}")

@app.get("/health")
def health():
    return {"ok": True, "model_version": model_version}

@app.post("/score")
def score(req: ScoreRequest):
    if model is None:
        load_latest()

    # Build DataFrame with correct feature names/order (removes sklearn warning)
    row = {c: float(getattr(req, c)) for c in FEATURE_COLUMNS}
    X = pd.DataFrame([row], columns=FEATURE_COLUMNS)

    # Handle single-class models safely
    classes = getattr(model, "classes_", None)

    if classes is None or len(classes) == 0:
        # Extremely defensive fallback
        prob = 0.0
    elif len(classes) == 1:
        # If the only class is 1, prob_fraud=1; if only class is 0, prob_fraud=0
        prob = 1.0 if int(classes[0]) == 1 else 0.0
    else:
        proba = model.predict_proba(X)
        # Find index of class "1" in classes_
        idx1 = int(np.where(classes == 1)[0][0]) if 1 in classes else None
        prob = float(proba[0, idx1]) if idx1 is not None else 0.0

    return {"prob_fraud": prob, "model_version": model_version, "classes": classes.tolist()}

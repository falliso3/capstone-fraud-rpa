import os
import json
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI
from pydantic import BaseModel

from features import FEATURE_COLUMNS

# Paths inside repo/container
BASE_DIR = Path(__file__).resolve().parent
ARTIFACT_DIR = BASE_DIR / "artifacts"
LATEST_PATH = ARTIFACT_DIR / "LATEST.json"

app = FastAPI(title="Fraud Model Scoring Service")

model = None
model_version = None


def _resolve_artifact_path(path_str: str) -> str:
    """
    Resolve a model/schema path from LATEST.json in a container-friendly way.

    Supports:
      - Absolute Linux paths: /app/artifacts/model.joblib
      - Windows absolute paths stored in json: C:\\Users\\...\\model.joblib
      - Relative paths: fraud_model_x.joblib or artifacts/fraud_model_x.joblib

    Strategy:
      1) If path exists as-is (rare in container), use it.
      2) Otherwise, use basename() inside ARTIFACT_DIR.
      3) Otherwise, treat as relative to BASE_DIR (handles "artifacts/xxx.joblib").
    """
    if not path_str:
        raise RuntimeError("Empty artifact path in LATEST.json")

    candidates = []

    # 1) raw as-is (covers absolute linux paths or relative if CWD matches)
    candidates.append(path_str)

    # 2) basename inside artifacts/ (covers Windows absolute paths and arbitrary absolutes)
    candidates.append(str(ARTIFACT_DIR / os.path.basename(path_str)))

    # 3) relative to the ml package directory (covers "artifacts/..." strings)
    candidates.append(str(BASE_DIR / path_str))

    for p in candidates:
        try:
            if os.path.exists(p):
                return p
        except OSError:
            # If there are weird characters or invalid path forms, skip
            pass

    # Helpful debug info
    try:
        artifact_listing = sorted([p.name for p in ARTIFACT_DIR.iterdir()])
    except Exception:
        artifact_listing = ["<unable to list artifacts dir>"]

    raise FileNotFoundError(
        f"Artifact file not found. Tried: {candidates}. "
        f"ARTIFACT_DIR={ARTIFACT_DIR}. Contents={artifact_listing}"
    )


def load_latest():
    global model, model_version

    if not LATEST_PATH.exists():
        raise RuntimeError("No artifacts/LATEST.json found. Run train.py first.")

    with open(LATEST_PATH, "r", encoding="utf-8") as f:
        latest = json.load(f)

    model_version = latest.get("version")

    model_path_raw = latest.get("model_path")
    model_path = _resolve_artifact_path(model_path_raw)

    # (Optional) if you later load schema_path, resolve it the same way:
    # schema_path_raw = latest.get("schema_path")
    # schema_path = _resolve_artifact_path(schema_path_raw)

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
        prob = 0.0
        classes_list = []
    elif len(classes) == 1:
        prob = 1.0 if int(classes[0]) == 1 else 0.0
        classes_list = classes.tolist() if hasattr(classes, "tolist") else list(classes)
    else:
        proba = model.predict_proba(X)
        idx1 = int(np.where(classes == 1)[0][0]) if 1 in classes else None
        prob = float(proba[0, idx1]) if idx1 is not None else 0.0
        classes_list = classes.tolist() if hasattr(classes, "tolist") else list(classes)

    return {"prob_fraud": prob, "model_version": model_version, "classes": classes_list}

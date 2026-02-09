#!/usr/bin/env python3
"""
kaggle_scoring.py

takes a kaggle-style tx csv and runs a saved model on it.

adds:
- fraud_proba (if we can get probabilities)
- pred_isFraud (0/1 based on threshold)

this expects your model file to be something like an sklearn Pipeline saved with joblib.
"""

import argparse
import csv
from typing import Any, Dict, List, Optional

import pandas as pd

try:
    import joblib
except ImportError:
    joblib = None


# columns we need to even attempt scoring
REQUIRED_COLS = [
    "step", "type", "amount", "nameOrig", "oldbalanceOrg", "newbalanceOrig",
    "nameDest", "oldbalanceDest", "newbalanceDest",
]


def _load_model(path: str) -> Any:
    # keep the error message obvious if someone forgot joblib
    if joblib is None:
        raise SystemExit("ERROR: joblib is not installed. Run: pip install joblib")
    return joblib.load(path)


def _ensure_columns(df: pd.DataFrame) -> None:
    # basic schema check so we don't get weird failures later
    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise SystemExit(f"ERROR: missing required columns: {missing}")


def _get_proba(model: Any, X: pd.DataFrame) -> Optional[List[float]]:
    """
    try to get "probability of fraud" for each row.
    if the model doesn't support it, returns None and we'll fall back to predict().
    """
    # best case: model has predict_proba
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X)

        # standard binary case: proba[:,1] is class 1
        if proba.shape[1] >= 2:
            return proba[:, 1].tolist()

        # odd case: sometimes only one column comes back
        return proba[:, 0].tolist()

    # fallback: decision_function -> squash into (0,1)
    if hasattr(model, "decision_function"):
        import math
        scores = model.decision_function(X)
        return [1.0 / (1.0 + math.exp(-float(s))) for s in scores]

    # nothing available
    return None


def main() -> None:
    # cli args
    p = argparse.ArgumentParser(description="Score Kaggle-style transactions with a saved ML model.")
    p.add_argument("--in", dest="inp", required=True, help="Input CSV (Kaggle schema).")
    p.add_argument("--model", required=True, help="Path to joblib/pickle model (ideally sklearn Pipeline).")
    p.add_argument("--out", default="kaggle_scored.csv", help="Output scored CSV filename.")
    p.add_argument("--threshold", type=float, default=0.5, help="Probability threshold for pred_isFraud=1.")
    args = p.parse_args()

    # load file + make sure it has the columns we expect
    df = pd.read_csv(args.inp)
    _ensure_columns(df)

    # load model from disk
    model = _load_model(args.model)

    # IMPORTANT: we send the raw columns through.
    # the pipeline needs to deal with encoding type, ids, numeric casting, etc.
    X = df.copy()

    proba = _get_proba(model, X)

    if proba is None:
        # last resort if model can't do proba:
        # just use predict() and treat it as 0/1
        if not hasattr(model, "predict"):
            raise SystemExit("ERROR: model has no predict_proba, decision_function, or predict.")
        preds = model.predict(X)
        df["fraud_proba"] = [float(p) for p in preds]
        df["pred_isFraud"] = [int(p) for p in preds]
    else:
        df["fraud_proba"] = proba
        df["pred_isFraud"] = [1 if p >= args.threshold else 0 for p in proba]

    # write scored file
    df.to_csv(args.out, index=False)
    print(f"Scored {len(df)} rows -> {args.out}")
    print(f"threshold={args.threshold}")


if __name__ == "__main__":
    main()

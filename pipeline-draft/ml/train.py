import os
import json
from datetime import datetime, timezone

import pandas as pd
from pymongo import MongoClient
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score, average_precision_score, classification_report
import joblib

from features import extract_features, FEATURE_COLUMNS

LABEL_WINDOW_DAYS = int(os.getenv("LABEL_WINDOW_DAYS", "45"))
ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")

def utcnow():
    return datetime.now(timezone.utc)

def label_tx(tx: dict, now_ts: float):
    # Positive label: explicitly fraudulent dispute
    reason = ((tx.get("dispute_details") or {}).get("reason") or None)
    if reason == "fraudulent":
        return 1

    created = tx.get("created")
    if not isinstance(created, int):
        return None

    age_days = (now_ts - created) / 86400.0

    # Negative label: old enough and no dispute info
    if age_days >= LABEL_WINDOW_DAYS and not tx.get("disputed", False) and not tx.get("dispute_details"):
        return 0

    return None  # too fresh / ambiguous

def main():
    mongo_uri = os.getenv("MONGODB_URI")
    mongo_db = os.getenv("MONGODB_DB")
    if not mongo_uri or not mongo_db:
        raise SystemExit("Missing MONGODB_URI or MONGODB_DB in environment")

    os.makedirs(ARTIFACT_DIR, exist_ok=True)

    client = MongoClient(mongo_uri)
    db = client[mongo_db]
    tx_col = db["transactions"]

    projection = {
        "_id": 1,
        "amount": 1,
        "created": 1,
        "risk.score": 1,
        "checks": 1,
        "card.country": 1,
        "card.fingerprint": 1,
        "shipping_country": 1,
        "billing_country": 1,
        "disputed": 1,
        "dispute_details": 1,
        "internalRisk.score": 1,
        "internalRisk.features": 1,
    }

    docs = list(tx_col.find({}, projection=projection).sort("created", 1))
    if not docs:
        raise SystemExit("No transactions found in MongoDB.")

    now_ts = utcnow().timestamp()

    rows, labels = [], []
    for tx in docs:
        y = label_tx(tx, now_ts)
        if y is None:
            continue
        rows.append(extract_features(tx))
        labels.append(y)

    if len(rows) == 0:
        raise SystemExit(
            "No labeled rows available.\n"
            "You need either:\n"
            "- a fraudulent dispute (dispute_details.reason == 'fraudulent'), OR\n"
            f"- transactions older than {LABEL_WINDOW_DAYS} days with no disputes.\n\n"
            "TEMP FIX for demo: set LABEL_WINDOW_DAYS=0 and rerun."
        )

    if len(rows) < 30:
        print(f"⚠️ Only {len(rows)} labeled rows available. Model will be weak, but pipeline will run.")

    df = pd.DataFrame(rows)
    y = pd.Series(labels, name="label")

    for c in FEATURE_COLUMNS:
        if c not in df.columns:
            df[c] = 0.0

    X = df[FEATURE_COLUMNS].fillna(0.0)

    # time-based split: oldest 80% train, newest 20% test
    n = len(X)
    split = max(1, int(n * 0.8))
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=6,
        min_samples_split=10,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    metrics = {
        "trained_at": utcnow().isoformat(),
        "label_window_days": LABEL_WINDOW_DAYS,
        "num_labeled_rows": int(n),
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "feature_columns": FEATURE_COLUMNS,
    }

    if len(X_test) >= 5 and len(set(y_test.tolist())) >= 2:
        probs = model.predict_proba(X_test)[:, 1]
        preds = (probs >= 0.5).astype(int)
        metrics["roc_auc"] = float(roc_auc_score(y_test, probs))
        metrics["pr_auc"] = float(average_precision_score(y_test, probs))
        metrics["classification_report"] = classification_report(y_test, preds, output_dict=True)
        print("✅ ROC-AUC:", metrics["roc_auc"])
        print("✅ PR-AUC:", metrics["pr_auc"])
    else:
        print("⚠️ Not enough test data (or only one class) for AUC/PR-AUC yet. Normal early on.")

    version = "v1_" + utcnow().strftime("%Y%m%d_%H%M%S")
    model_path = os.path.join(ARTIFACT_DIR, f"fraud_model_{version}.joblib")
    schema_path = os.path.join(ARTIFACT_DIR, f"feature_schema_{version}.json")
    metrics_path = os.path.join(ARTIFACT_DIR, f"metrics_{version}.json")
    latest_path = os.path.join(ARTIFACT_DIR, "LATEST.json")

    joblib.dump(model, model_path)

    with open(schema_path, "w", encoding="utf-8") as f:
        json.dump({"version": version, "feature_columns": FEATURE_COLUMNS}, f, indent=2)

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    with open(latest_path, "w", encoding="utf-8") as f:
        json.dump({"version": version, "model_path": model_path, "schema_path": schema_path}, f, indent=2)

    print("✅ Saved model:", model_path)
    print("✅ Updated:", latest_path)

if __name__ == "__main__":
    main()

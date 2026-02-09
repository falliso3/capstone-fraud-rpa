#!/usr/bin/env python3
"""
kaggle_evaluator.py

quick sanity checker for a scored csv.

expects:
- isFraud (0/1 ground truth)
- pred_isFraud (0/1 model prediction)
- type (tx type)

optional:
- fraud_proba (float)

prints some basic metrics + per-type breakdown so you can see what's getting missed.
"""

import argparse
import pandas as pd

from sklearn.metrics import (
    confusion_matrix,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    average_precision_score,
)


def _require_cols(df: pd.DataFrame, cols):
    # tiny guard so we fail early with a useful message
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise SystemExit(f"ERROR: missing required columns: {missing}")


def _safe_rate(numer: int, denom: int) -> float:
    # avoid div-by-zero weirdness
    return (numer / denom) if denom else 0.0


def main() -> None:
    # basic cli wrapper
    p = argparse.ArgumentParser(description="Evaluate Kaggle-style fraud predictions.")
    p.add_argument("--in", dest="inp", required=True, help="Input scored CSV (must include isFraud + pred_isFraud).")
    args = p.parse_args()

    # load scored file
    df = pd.read_csv(args.inp)

    # if these aren't here, nothing else matters
    _require_cols(df, ["isFraud", "pred_isFraud", "type"])

    y_true = df["isFraud"].astype(int).to_numpy()
    y_pred = df["pred_isFraud"].astype(int).to_numpy()

    # overall confusion matrix and the usual metrics
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()

    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)

    print("\n=== Overall ===")
    print(f"rows: {len(df)}")
    print("confusion_matrix [[TN FP],[FN TP]]:")
    print(cm)
    print(f"precision: {precision:.4f}")
    print(f"recall:    {recall:.4f}")
    print(f"f1:        {f1:.4f}")

    # if we have probabilities, we can do auc stuff too
    if "fraud_proba" in df.columns:
        proba = df["fraud_proba"].astype(float).to_numpy()

        # roc_auc needs both classes present or it crashes
        if len(set(y_true.tolist())) > 1:
            roc = roc_auc_score(y_true, proba)
            pr_auc = average_precision_score(y_true, proba)
            print(f"roc_auc:   {roc:.4f}")
            print(f"pr_auc:    {pr_auc:.4f}")
        else:
            print("roc_auc / pr_auc skipped (only one class present in y_true).")

    # breakdown by tx type so you can see where it's weak
    print("\n=== By transaction type ===")
    for t in sorted(df["type"].unique().tolist()):
        sub = df[df["type"] == t]
        yt = sub["isFraud"].astype(int).to_numpy()
        yp = sub["pred_isFraud"].astype(int).to_numpy()

        # keep it simple: always compute w/ labels=[0,1]
        cm_t = confusion_matrix(yt, yp, labels=[0, 1])
        tn_t, fp_t, fn_t, tp_t = cm_t.ravel()

        prec_t = precision_score(yt, yp, zero_division=0)
        rec_t = recall_score(yt, yp, zero_division=0)
        f1_t = f1_score(yt, yp, zero_division=0)

        base_rate = _safe_rate(int(yt.sum()), len(yt))

        print(f"\n-- {t} -- rows={len(sub)} fraud_base_rate={base_rate:.4f}")
        print(f"  cm [[TN FP],[FN TP]] = {cm_t.tolist()}")
        print(f"  precision={prec_t:.4f} recall={rec_t:.4f} f1={f1_t:.4f}")


if __name__ == "__main__":
    main()

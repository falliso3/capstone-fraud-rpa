# backend/app/reports/eval_metrics.py
"""
Compute evaluation metrics for a 3-class fraud classifier:
0 = No Fraud
1 = Suspicious
2 = Fraud

We derive predicted class from Score.score using thresholds.
We compute:
- confusion matrix (3x3)
- accuracy
- weighted precision/recall/f1

No scikit-learn dependency required.
"""

from typing import List, Tuple, Dict, Optional

CLASSES = [0, 1, 2]

def predicted_label_from_score(score: float) -> int:
    """
    Convert numeric score (0-100) -> class label.
    These thresholds should match how your pipeline interprets "flagged".
    """
    if score >= 80.0:
        return 2  # Fraud
    if score >= 50.0:
        return 1  # Suspicious
    return 0      # No Fraud

def empty_confusion_matrix() -> List[List[int]]:
    """Always return a stable 3x3 matrix."""
    return [[0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]]

def build_confusion_matrix(y_true: List[int], y_pred: List[int]) -> List[List[int]]:
    cm = empty_confusion_matrix()
    for t, p in zip(y_true, y_pred):
        if t in CLASSES and p in CLASSES:
            cm[t][p] += 1
    return cm

def compute_metrics_from_cm(cm: List[List[int]]) -> Dict[str, Optional[float]]:
    """
    Compute:
      - accuracy (%)
      - precision (% weighted)
      - recall (% weighted)
      - f1-score (% weighted)
    Return None values if there are no samples.
    """
    total = sum(sum(row) for row in cm)
    if total == 0:
        return {"accuracy": None, "precision": None, "recall": None, "f1-score": None}

    correct = cm[0][0] + cm[1][1] + cm[2][2]
    accuracy = correct / total

    # Per-class metrics
    supports = [sum(cm[i]) for i in range(3)]  # true count per class (row sums)

    precisions = []
    recalls = []
    f1s = []

    for i in range(3):
        tp = cm[i][i]
        fp = (cm[0][i] + cm[1][i] + cm[2][i]) - tp  # column sum minus tp
        fn = supports[i] - tp

        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec  = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1   = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

        precisions.append(prec)
        recalls.append(rec)
        f1s.append(f1)

    # Weighted average (by supports)
    weighted_precision = sum(precisions[i] * supports[i] for i in range(3)) / total
    weighted_recall    = sum(recalls[i] * supports[i] for i in range(3)) / total
    weighted_f1        = sum(f1s[i] * supports[i] for i in range(3)) / total

    # Return as percentages with 2 decimals (match mock UI style)
    return {
        "accuracy": round(accuracy * 100.0, 2),
        "precision": round(weighted_precision * 100.0, 2),
        "recall": round(weighted_recall * 100.0, 2),
        "f1-score": round(weighted_f1 * 100.0, 2),
    }

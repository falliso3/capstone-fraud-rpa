# Set working directory to script"s folder
import os
import sys

ROOT_FOLDER = os.path.dirname(os.path.abspath(__file__))
sys.path.append(ROOT_FOLDER)
os.chdir(ROOT_FOLDER)

# Imports
import csv
import glob

from tabulate import tabulate
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from detect_fraud import score_row, parse_time
from collections import defaultdict

# Functions
def calculate_metrics():
    y_true = []
    y_pred = []
    
    for csvfile in glob.glob("*.csv"):
        with open(csvfile, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        history_by_account = defaultdict(list)
        last_tx_time_by_account_device = defaultdict(list)

        for row in rows:
            acct = row["account_id"]
            device = row["device_id"]
            ts = parse_time(row["timestamp"])

            pred, reason = score_row(row, history_by_account, last_tx_time_by_account_device)
            y_pred.append(pred)
            y_true.append(int(row["label"]))

            history_by_account[acct].append(ts)
            last_tx_time_by_account_device[(acct, device)].append(ts)

    accuracy = accuracy_score(y_true, y_pred)
    precision = precision_score(y_true, y_pred, average="weighted", zero_division=0)
    recall = recall_score(y_true, y_pred, average="weighted", zero_division=0)
    f1 = f1_score(y_true, y_pred, average="weighted", zero_division=0)
    
    metrics = {
        "accuracy": round(accuracy * 100, 2),
        "precision": round(precision * 100, 2),
        "recall": round(recall * 100, 2),
        "f1": round(f1 * 100, 2)
    }

    return metrics

def main():
    metrics = calculate_metrics()

    table = [
        ["Accuracy", f"{metrics["accuracy"]}%"],
        ["Precision", f"{metrics["precision"]}%"],
        ["Recall", f"{metrics["recall"]}%"],
        ["F1-score", f"{metrics["f1"]}%"]
    ]

    print(tabulate(table, headers=["Metric", "Value"]))

if __name__ == "__main__":
    main()
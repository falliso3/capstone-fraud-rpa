# Set working directory to script's folder
import os
import sys

ROOT_FOLDER = os.path.dirname(os.path.abspath(__file__))

sys.path.append(ROOT_FOLDER)
os.chdir(ROOT_FOLDER)

# Imports
import csv
import glob
import webbrowser

from tabulate import tabulate
from datetime import datetime, timezone
from jinja2 import Environment, FileSystemLoader
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from detect_fraud import score_row, parse_time
from collections import defaultdict

# Constants
TEMPLATE_FOLDER = os.path.join(ROOT_FOLDER, "templates")
OUTPUT_FOLDER = os.path.join(ROOT_FOLDER, "metrics")

# Utility functions
def prompt_yes_no(question, default="y"):
    while True:
        choice = input(f"{question} (y/n): ").strip().lower()
        if choice in ["y", "yes"]:
            return True
        elif choice in ["n", "no"]:
            return False
        elif choice == "" and default:
            return default.lower() == "y"
        else:
            print("Please respond with 'y' or 'n'.")

def open_html_file(filepath):
    try:
        webbrowser.open(f"file://{os.path.abspath(filepath)}")
    except Exception as e:
        print(f"Unable to open file automatically: {e}")

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
        "f1-score": round(f1 * 100, 2)
    }

    return metrics

def display_metrics(metrics):
    table = [
        ["Accuracy", f"{metrics["accuracy"]}%"],
        ["Precision", f"{metrics["precision"]}%"],
        ["Recall", f"{metrics["recall"]}%"],
        ["F1-score", f"{metrics["f1-score"]}%"]
    ]

    print(tabulate(table, headers=["Metric", "Value"]))

def generate_report(metrics):
    # Load report template
    env = Environment(loader=FileSystemLoader(TEMPLATE_FOLDER))
    template_path = os.path.join(TEMPLATE_FOLDER, "report_template.html")

    if not os.path.exists(template_path):
       return print("Missing report template")

    template = env.get_template("report_template.html")

    # Fill out report template
    now = datetime.now(timezone.utc)
    timestamp_str = now.strftime("%Y-%m-%d %H:%M:%S UTC")
    file_timestamp = now.strftime("%Y-%m-%d_%H-%M-%S_UTC")
    html_output = template.render(metrics=metrics, timestamp=timestamp_str)

    # Create output folder (if doesnt exist)
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    # Write to output file
    output_filename = f"metrics_report_{file_timestamp}.html"
    output_path = os.path.join(OUTPUT_FOLDER, output_filename)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_output)

    # Output
    print(f"\n✅ Report saved at: {output_path}")
    if prompt_yes_no("Open the report?"):
        open_html_file(output_path)

def save_metrics_to_db(metrics):
    print("(DB insert placeholder — not implemented yet)")

def main():
    while True:
        print("\n=== Fraud Detection Evaluation Tool ===")
        print("1. Calculate and display metrics")
        print("2. Generate confusion matrix visualization")
        print("3. Generate full HTML report")
        print("4. Exit")

        choice = input("Select an option (1-4): ").strip()

        if choice == "1":
            metrics = calculate_metrics()
            display_metrics(metrics)

            if prompt_yes_no("Save metrics to database?"):
                save_metrics_to_db(metrics)

        elif choice == "2":
            print("(Confusion matrix visualization placeholder — not implemented yet)")

        elif choice == "3":
            metrics = calculate_metrics()
            generate_report(metrics)

        elif choice == "4":
            print("Exiting...")
            break

        else:
            print("Invalid option. Please try again.")

if __name__ == "__main__":
    main()
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
import numpy as np

from tabulate import tabulate
from datetime import datetime, timezone
from jinja2 import Environment, FileSystemLoader
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
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
        "accuracy": round(accuracy * 100, 2),       # How many predictions were correct?
        "precision": round(precision * 100, 2),     # How many false alarms?
        "recall": round(recall * 100, 2),           # How many
        "f1-score": round(f1 * 100, 2)
    }

    cm = confusion_matrix(y_true, y_pred)
    return metrics, cm

def display_metrics(metrics):
    table = [
        ["Accuracy", f"{metrics["accuracy"]}%"],
        ["Precision", f"{metrics["precision"]}%"],
        ["Recall", f"{metrics["recall"]}%"],
        ["F1-score", f"{metrics["f1-score"]}%"]
    ]

    print()
    print(tabulate(table, headers=["Metric", "Value"]))

def cm_to_html_table(cm: np.ndarray):
    labels = ["No Fraud (0)", "Suspicious (1)", "Fraud (2)"]
    max_value = cm.max() if cm.max() > 0 else 1

    html = '<table class="cm-table">'

    # Header row
    html += '<tr>'
    html += (
        '<th class="cm-corner">'
        '<span class="cm-actual">Actual</span>'
        '<span class="cm-pred">Predicted</span>'
        '</th>'
    )
    for pred_label in labels:
        html += f"<th>{pred_label}</th>"
    html += "</tr>"

    # Rows
    for i, actual_label in enumerate(labels):
        html += f"<tr><th>{actual_label}</th>"
        for j in range(len(labels)):
            value = cm[i, j]
            intensity = value / max_value
            r = 255                                # 255
            g = int(255 - (255 - 81) * intensity)  # 255 -> 81
            b = int(255 - (255 - 81) * intensity)  # 255 -> 81
            color = f"rgb({r}, {g}, {b})"
            html += f'<td style="background-color:{color}">{value}</td>'
        html += "</tr>"

    html += "</table>" # TODO: add legend (gradient bar)
    return html

def generate_report(metrics, cm: np.ndarray):
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

    cm_html = cm_to_html_table(cm)
    cm_max = int(cm.max())

    html_output = template.render(
        metrics=metrics,
        cm_html=cm_html,
        cm_max=cm_max,
        timestamp=timestamp_str
    )

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

def display_confusion_matrix(cm: np.ndarray):
    labels = ["0: No Fraud", "1: Suspicious", "2: Fraud"]

    # Prepare table with column headers
    table = []
    for i, row in enumerate(cm):
        table.append([labels[i]] + list(row))

    headers = ["Actual \\ Predicted"] + labels

    print("\nConfusion Matrix:")
    print(tabulate(table, headers=headers, tablefmt="grid"))

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
            metrics, _ = calculate_metrics()
            display_metrics(metrics)

            if prompt_yes_no("\nSave metrics to database?"):
                save_metrics_to_db(metrics)

        elif choice == "2":
            _, cm = calculate_metrics()
            display_confusion_matrix(cm)
            

        elif choice == "3":
            generate_report(*calculate_metrics())

        elif choice == "4":
            print("Exiting...")
            break

        else:
            print("Invalid option. Please try again.")

if __name__ == "__main__":
    main()
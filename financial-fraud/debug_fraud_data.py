import csv
import argparse
from collections import defaultdict

# mapping the numeric labels to something readable
# 0 = clean, 1 = suspicious, 2 = fraud
LABEL_NAMES = {
    0: "clean",
    1: "suspicious",
    2: "fraud",
}

def safe_int(value, default=None):
    """
    tiny helper so we don't blow up if a column is empty or junk.
    tries to cast to int, otherwise just returns default.
    """
    try:
        return int(value)
    except (TypeError, ValueError):
        return default

def main(input_csv):
    # load the csv into memory
    # for 1-10k transactions/rows this is more than robust enough
    with open(input_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        print("no rows found in input CSV.")
        return

    # ADDED: sanity check: make sure we have both ground truth + model prediction
    sample = rows[0]
    if "label" not in sample:
        print("ERROR: input CSV has no 'label' column (ground truth).")
        print("make sure you are using the generator that writes a 'label' field.")
        return

    if "predicted_label" not in sample:
        print("ERROR: input CSV has no 'predicted_label' column.")
        print("run detect_fraud_robust.py with --out first, then feed THAT file here.")
        return

    # counters for stats
    total = 0
    # how many clean/susp/fraud we GENERATED
    label_counts = defaultdict(int)
    # how many clean/susp/fraud we PREDICTED
    pred_counts = defaultdict(int)
    # confusion[true][pred]
    confusion = defaultdict(lambda: defaultdict(int))

    # walk every row and build our stats
    for r in rows:
        true_label = safe_int(r.get("label"))
        pred_label = safe_int(r.get("predicted_label"))

        # skip anything that looks busted
        if true_label is None or pred_label is None:
            continue
        if true_label not in LABEL_NAMES or pred_label not in LABEL_NAMES:
            continue

        total += 1
        label_counts[true_label] += 1
        pred_counts[pred_label] += 1
        confusion[true_label][pred_label] += 1

    if total == 0:
        print("no valid labeled rows to evaluate.")
        return

    print(f"evaluating {total} labeled transactions\n")

    # how many of each label did the generator produce? (ground truth)
    print("=== ground truth label distribution (from generator) ===")
    for lbl in sorted(LABEL_NAMES.keys()):
        count = label_counts[lbl]
        pct = (count / total) * 100.0
        print(f"{LABEL_NAMES[lbl]:>10}: {count:5d} ({pct:5.1f}%)")
    print()

    # how many of each label did the rules-based detector predict?
    print("=== predicted label distribution (rules-based detector) ===")
    for lbl in sorted(LABEL_NAMES.keys()):
        count = pred_counts[lbl]
        pct = (count / total) * 100.0
        print(f"{LABEL_NAMES[lbl]:>10}: {count:5d} ({pct:5.1f}%)")
    print()

    # confusion matrix: rows = true, cols = predicted
    # lets you see where it's over/under calling each class.
    print("=== confusion matrix (rows = true, cols = predicted) ===")
    header = "true\\pred" + "".join(
        f"{LABEL_NAMES[l]:>12}" for l in sorted(LABEL_NAMES.keys())
    )
    print(header)

    for true_lbl in sorted(LABEL_NAMES.keys()):
        row_str = f"{LABEL_NAMES[true_lbl]:>9}"
        for pred_lbl in sorted(LABEL_NAMES.keys()):
            row_str += f"{confusion[true_lbl][pred_lbl]:12d}"
        print(row_str)
    print()

    # overall accuracy + per-class precision/recall
    correct = sum(confusion[l][l] for l in LABEL_NAMES.keys())
    accuracy = correct / total * 100.0

    print("=== overall accuracy ===")
    print(f"accuracy: {correct}/{total} = {accuracy:.2f}%\n")

    print("=== per-class precision / recall ===")
    for cls in sorted(LABEL_NAMES.keys()):
        tp = confusion[cls][cls]
        fp = sum(confusion[other][cls] for other in LABEL_NAMES.keys() if other != cls)
        fn = sum(confusion[cls][other] for other in LABEL_NAMES.keys() if other != cls)

        precision = tp / (tp + fp) * 100.0 if (tp + fp) > 0 else 0.0
        recall    = tp / (tp + fn) * 100.0 if (tp + fn) > 0 else 0.0

        print(
            f"{LABEL_NAMES[cls]:>10}: "
            f"precision={precision:6.2f}%  "
            f"recall={recall:6.2f}% "
            f"(tp={tp}, fp={fp}, fn={fn})"
        )

if __name__ == "__main__":
    # simple cli wrapper: point this at the _scored.csv file
    parser = argparse.ArgumentParser(
        description="quick debugger: how close is the rules-based detector to the generator's labels?"
    )
    parser.add_argument("input", help="scored CSV (output from detect_fraud_robust.py --out)")
    args = parser.parse_args()

    main(args.input)

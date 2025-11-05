import csv
import sys
import argparse
from collections import defaultdict, Counter
from datetime import datetime, timedelta
from math import isclose

# -------------------------
# Tunable thresholds/scoring
# -------------------------
HIGH_AMOUNT = 5000.0               # immediate strong indicator
HIGH_RISK_COUNTRIES = {'NG', 'IR', 'RU', 'KP'}
MICRO_THRESHOLD = 5.00
SMALL_AMOUNT_THRESHOLD = 20.00     # small purchase threshold (used by some rules)
MICRO_REPEAT_WINDOW = 120          # seconds for micro repeat
DUPLICATE_WINDOW = 120             # seconds for duplicate similar tx
VELOCITY_WINDOW = 90               # seconds for velocity count
VELOCITY_COUNT = 3
AGG_WINDOW_HOURS = 24              # aggregate window for sum checks
AGG_MULTIPLIER = 5.0               # flag if sum in window > multiplier * avg (avg approximated from history)
NEAR_ZERO_BALANCE = 1.0

# Scoring weights (you can tune these)
SCORES = {
    "high_amount": 5,
    "high_risk_country": 3,
    "negative_balance": 5,
    "impossible_balance": 5,
    "micro_repeat": 1,
    "small_repeat": 1,
    "rapid_back_to_back": 1,
    "high_velocity": 2,
    "near_zero_balance": 1,
    "new_payee": 1,
    "payee_freq": 1,
    "device_change": 1,
    "ip_change": 1,
    "duplicate_tx": 3,
    "agg_24h_spike": 3,
}

# Mapping risk score -> predicted label
# score >= FRAUD_SCORE -> label 2 (fraud)
# score >= SUSPICIOUS_SCORE -> label 1 (suspicious)
FRAUD_SCORE = 6
SUSPICIOUS_SCORE = 2

# -------------------------
# Helper functions
# -------------------------
def parse_time(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ")

def within_seconds(t1, t2, s):
    return abs((t1 - t2).total_seconds()) <= s

# -------------------------
# Core scoring function
# -------------------------
def score_row(row, state):
    """
    row: dict of CSV fields
    state: dict of histories and indices to compute contextual checks
    returns: (pred_label, risk_score, reasons_list)
    """
    # parse basic fields
    amt = float(row.get('amount', 0.0))
    country = row.get('country', '').upper()
    bal_after = float(row.get('balance_after', 0.0))
    bal_before = float(row.get('balance_before', 0.0))
    ts = parse_time(row['timestamp'])
    acct = row['account_id']
    device = row.get('device_id', '')
    ip = row.get('ip_hash', '')
    payee = row.get('payee_id', '')
    notes = row.get('notes', '')

    score = 0
    reasons = []

    # STRONG / HARD RULES (big score)
    if amt >= HIGH_AMOUNT:
        score += SCORES["high_amount"]; reasons.append("high_amount")
    if country in HIGH_RISK_COUNTRIES and amt > 1000:
        score += SCORES["high_risk_country"]; reasons.append("high_risk_country")
    if bal_after < 0:
        score += SCORES["negative_balance"]; reasons.append("negative_balance")
    # impossible balance math (allow small rounding)
    if not isclose((bal_before - amt), bal_after, abs_tol=0.01):
        score += SCORES["impossible_balance"]; reasons.append("impossible_balance")

    # MICRO / SMALL repeats on same device
    if amt <= MICRO_THRESHOLD:
        prevs = state['by_account_device'][(acct, device)]
        if prevs and (ts - prevs[-1]).total_seconds() <= MICRO_REPEAT_WINDOW:
            score += SCORES["micro_repeat"]; reasons.append("micro_repeat")

    # small purchase repeat across devices for same account
    if amt <= SMALL_AMOUNT_THRESHOLD:
        last_small = state['last_small_time'].get(acct)
        if last_small and (ts - last_small).total_seconds() <= MICRO_REPEAT_WINDOW:
            score += SCORES["small_repeat"]; reasons.append("small_repeat")

    # rapid back-to-back small charges
    last_any = state['last_tx_time'].get(acct)
    if last_any and amt <= SMALL_AMOUNT_THRESHOLD and (ts - last_any).total_seconds() <= 60:
        score += SCORES["rapid_back_to_back"]; reasons.append("rapid_back_to_back")

    # velocity: count previous txs in VELOCITY_WINDOW
    recent = [t for t in state['history_by_account'][acct] if (ts - t).total_seconds() <= VELOCITY_WINDOW]
    if len(recent) >= VELOCITY_COUNT - 1:
        score += SCORES["high_velocity"]; reasons.append("high_velocity")

    # near-zero balance after non-micro spend
    if bal_after <= NEAR_ZERO_BALANCE and amt > MICRO_THRESHOLD:
        score += SCORES["near_zero_balance"]; reasons.append("near_zero_balance")

    # NEW payee: never seen this payee for this account before
    payee_count = state['payee_counter'][acct][payee]
    if payee_count == 0:
        score += SCORES["new_payee"]; reasons.append("new_payee")
    else:
        # if this payee has unusually many transactions in short time, flag
        if payee_count >= 5:
            score += SCORES["payee_freq"]; reasons.append("payee_freq")

    # device / IP change for this account (simple: seen before or not)
    if device and device not in state['devices_by_account'][acct]:
        # if account had prior devices, a new device is suspicious
        if state['devices_by_account'][acct]:
            score += SCORES["device_change"]; reasons.append("device_change")
    if ip and ip not in state['ips_by_account'][acct]:
        if state['ips_by_account'][acct]:
            score += SCORES["ip_change"]; reasons.append("ip_change")

    # duplicate transaction detection: same payee + same amount within DUPLICATE_WINDOW
    duplicates = state['recent_by_account'][acct]
    for (amt_prev, payee_prev, ts_prev) in duplicates:
        if payee_prev == payee and isclose(float(amt_prev), float(amt), rel_tol=1e-6, abs_tol=0.01) and (ts - ts_prev).total_seconds() <= DUPLICATE_WINDOW:
            score += SCORES["duplicate_tx"]; reasons.append("duplicate_tx")
            break

    # aggregate 24h spike: sum amounts in last AGG_WINDOW_HOURS
    cutoff = ts - timedelta(hours=AGG_WINDOW_HOURS)
    agg_sum = sum(a for (a,t) in state['amount_time_by_account'][acct] if t >= cutoff)
    # approximate average: use historical total / count (exclude current), avoid division by zero
    hist_total = state['hist_total_by_account'][acct]
    hist_count = state['hist_count_by_account'][acct]
    avg = (hist_total / hist_count) if hist_count > 0 else 0.0
    if avg > 0 and agg_sum > (AGG_MULTIPLIER * avg):
        score += SCORES["agg_24h_spike"]; reasons.append("agg_24h_spike")

    # Determine predicted label from score
    if score >= FRAUD_SCORE:
        pred = 2
    elif score >= SUSPICIOUS_SCORE:
        pred = 1
    else:
        pred = 0

    return pred, score, reasons

# -------------------------
# Main driver
# -------------------------
def main(input_csv, output_csv=None):
    # read input rows
    with open(input_csv, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    # state for historical/context checks
    state = {
        'history_by_account': defaultdict(list),      # acct -> list of datetimes
        'by_account_device': defaultdict(list),       # (acct,device) -> list of datetimes
        'last_tx_time': {},                           # acct -> last datetime
        'last_small_time': {},                        # acct -> last small tx datetime
        'payee_counter': defaultdict(Counter),        # acct -> Counter(payee -> count)
        'devices_by_account': defaultdict(set),
        'ips_by_account': defaultdict(set),
        'recent_by_account': defaultdict(list),       # acct -> list of tuples (amount,payee,ts) for duplicate detection
        'amount_time_by_account': defaultdict(list),  # acct -> list of tuples (amount,ts) used for 24h aggregation
        'hist_total_by_account': defaultdict(float),  # running totals for avg calc
        'hist_count_by_account': defaultdict(int),
    }

    # prepare output writer (if requested)
    out_f = None
    out_writer = None
    if output_csv:
        out_f = open(output_csv, 'w', newline='', encoding='utf-8')
        fieldnames = list(rows[0].keys()) + ['predicted_label','risk_score','reasons']
        out_writer = csv.DictWriter(out_f, fieldnames=fieldnames)
        out_writer.writeheader()

    # also print a compact legacy header for quick terminal view
    print("id,pred_label,rule,amount,account_id,timestamp,notes")

    # iterate and score
    for r in rows:
        acct = r['account_id']
        ts = parse_time(r['timestamp'])
        # compute score & predicted label
        pred, score, reasons = score_row(r, state)

        # choose a human-readable "primary" rule (first reason) for the legacy print
        primary_rule = reasons[0] if reasons else "clean"
        print(f"{r['transaction_id']},{pred},{primary_rule},{r.get('amount','')},{acct},{r.get('timestamp','')},{r.get('notes','')}")

        # write to output CSV if requested
        if out_writer:
            out_row = dict(r)  # copy original fields
            out_row['predicted_label'] = pred
            out_row['risk_score'] = score
            out_row['reasons'] = ";".join(reasons)
            out_writer.writerow(out_row)

        # ----- Update state AFTER scoring (important) -----
        amt = float(r.get('amount', 0.0))
        device = r.get('device_id','')
        ip = r.get('ip_hash','')
        payee = r.get('payee_id','')

        state['history_by_account'][acct].append(ts)
        state['by_account_device'][(acct, device)].append(ts)
        state['last_tx_time'][acct] = ts
        if amt <= SMALL_AMOUNT_THRESHOLD:
            state['last_small_time'][acct] = ts
        state['payee_counter'][acct][payee] += 1
        if device: state['devices_by_account'][acct].add(device)
        if ip: state['ips_by_account'][acct].add(ip)
        # store for duplicates
        state['recent_by_account'][acct].append((amt, payee, ts))
        # store for 24h aggregation
        state['amount_time_by_account'][acct].append((amt, ts))
        state['hist_total_by_account'][acct] += amt
        state['hist_count_by_account'][acct] += 1

    if out_f:
        out_f.close()

    # Simple summary
    print("\nSummary: done.")
    if output_csv:
        print(f"Wrote output -> {output_csv}")
    return

# -------------------------
# CLI
# -------------------------
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Improved rule-based fraud detector (risk scoring).")
    parser.add_argument("input", help="Input transactions CSV")
    parser.add_argument("--out", help="Output CSV filename (optional)")
    args = parser.parse_args()

    main(args.input, args.out)

# detect_rules.py
import csv, sys
from collections import defaultdict
from datetime import datetime, timedelta

HIGH_AMOUNT = 5000.0             # threshold to consider immediate fraud
HIGH_RISK_COUNTRIES = {'NG','IR','NG','IR','RU','KP'}  # example high-risk
MICRO_THRESHOLD = 5.00
MICRO_REPEAT_WINDOW = 120        # seconds
VELOCITY_WINDOW = 60             # seconds
VELOCITY_COUNT = 3               # many txs in this window -> suspicious

def parse_time(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ")

def score_row(row, history_by_account, last_tx_time_by_account_device):
    amt = float(row['amount'])
    country = row['country']
    bal_after = float(row['balance_after'])
    ts = parse_time(row['timestamp'])
    acct = row['account_id']
    device = row['device_id']

    # Rule checks
    if amt >= HIGH_AMOUNT:
        return 2, "high_amount"
    if country in HIGH_RISK_COUNTRIES and amt>1000:
        return 2, "high_risk_country_large_amount"
    if bal_after < 0:
        return 2, "negative_balance"
    # micro pattern
    if amt <= MICRO_THRESHOLD:
        # check previous micro within window for same account/device
        prev_times = last_tx_time_by_account_device.get((acct,device), [])
        if prev_times and (ts - prev_times[-1]).total_seconds() <= MICRO_REPEAT_WINDOW:
            return 1, "micro_repeat"
    # velocity: count previous txs within window
    recent = [t for t in history_by_account[acct] if (ts - t).total_seconds() <= VELOCITY_WINDOW]
    if len(recent) >= VELOCITY_COUNT-1:
        return 1, "high_velocity"
    return 0, "clean"

def main(csvfile):
    with open(csvfile, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    history_by_account = defaultdict(list)
    last_tx_time_by_account_device = defaultdict(list)

    print("id,pred_label,rule,amount,account_id,timestamp,notes")
    for r in rows:
        acct = r['account_id']; device = r['device_id']
        ts = parse_time(r['timestamp'])
        pred, reason = score_row(r, history_by_account, last_tx_time_by_account_device)
        print(f"{r['transaction_id']},{pred},{reason},{r['amount']},{acct},{r['timestamp']},{r.get('notes','')}")
        history_by_account[acct].append(ts)
        last_tx_time_by_account_device[(acct,device)].append(ts)

if __name__ == '__main__':
    if len(sys.argv)<2:
        print("Usage: python detect_rules.py transactions.csv")
    else:
        main(sys.argv[1])

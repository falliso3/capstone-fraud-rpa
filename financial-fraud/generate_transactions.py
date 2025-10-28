import csv
from datetime import datetime, timedelta
import random

random.seed(42)

accounts = [f"acct_{i:04}" for i in range(1001, 1301)]
payers = [f"user_{i:04}" for i in range(1001, 1301)]
merchants = [f"merc_{i:04}" for i in range(9001, 9201)]
countries = ["US", "US", "US", "US", "FR", "CA", "GB", "DE", "NG", "IR", "RU"]
channels = ["app", "web", "mobile", "atm"]
merchant_categories = [
    "grocery", "digital_goods", "wire", "airfare", "subscription",
    "restaurant", "books", "crypto_exchange", "clothing", "consulting"
]

def generate_transaction(i, base_time):
    account_id = random.choice(accounts)
    payer_id = random.choice(payers)
    payee_id = random.choice(merchants)
    country = random.choice(countries)
    channel = random.choice(channels)
    category = random.choice(merchant_categories)
    device_id = f"dev_{random.choice('abcdefghijklmnopqrstuvwxyz')}{random.randint(1,10)}"
    ip_hash = f"ip_{random.randint(1,9999)}"
    balance_before = round(random.uniform(20, 20000), 2)

    fraud_type = random.choices(["clean", "suspicious", "fraud"], weights=[0.7, 0.2, 0.1])[0]
    amount = round(random.uniform(1, 10000), 2)
    notes = "normal transaction"
    label = 0

    if fraud_type == "fraud":
        fraud_pattern = random.choice(["high_amount", "negative_balance", "high_risk_country"])
        if fraud_pattern == "high_amount":
            amount = round(random.uniform(5000, 25000), 2)
            notes = "large transfer to new payee"
        elif fraud_pattern == "negative_balance":
            amount = round(balance_before + random.uniform(10, 2000), 2)
            notes = "transaction exceeds balance"
        elif fraud_pattern == "high_risk_country":
            country = random.choice(["NG", "IR", "RU", "KP"])
            amount = round(random.uniform(1000, 20000), 2)
            notes = "wire to high-risk country"
        label = 2
    elif fraud_type == "suspicious":
        pattern = random.choice(["micro_repeat", "high_velocity", "near_zero_balance"])
        if pattern == "micro_repeat":
            amount = round(random.uniform(1, 5), 2)
            notes = "repeated small micro-charges"
        elif pattern == "high_velocity":
            amount = round(random.uniform(10, 100), 2)
            notes = "multiple quick purchases"
        elif pattern == "near_zero_balance":
            amount = round(balance_before - random.uniform(18, 19), 2)
            notes = "near-zero balance after transaction"
        label = 1
    else:
        notes = random.choice([
            "normal grocery", "monthly subscription", "restaurant meal",
            "book purchase", "travel expense"
        ])

    balance_after = round(balance_before - amount, 2)
    if label == 2 and notes == "transaction exceeds balance":
        balance_after = round(random.uniform(-500, -1), 2)

    tx_time = base_time + timedelta(minutes=random.randint(1, 5*i))

    return {
        "transaction_id": f"tx{i:04}",
        "timestamp": tx_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "account_id": account_id,
        "payer_id": payer_id,
        "payee_id": payee_id,
        "amount": amount,
        "currency": "USD",
        "merchant_category": category,
        "country": country,
        "channel": channel,
        "device_id": device_id,
        "ip_hash": ip_hash,
        "balance_before": balance_before,
        "balance_after": balance_after,
        "label": label,
        "notes": notes
    }

base_time = datetime(2025, 10, 1, 8, 0, 0)
transactions = [generate_transaction(i, base_time) for i in range(1, 1001)]

with open("transactions_1000.csv", "w", newline='', encoding="utf-8") as csvfile:
    fieldnames = [
        "transaction_id", "timestamp", "account_id", "payer_id", "payee_id",
        "amount", "currency", "merchant_category", "country", "channel",
        "device_id", "ip_hash", "balance_before", "balance_after", "label", "notes"
    ]
    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(transactions)

print("✅ Generated transactions_1000.csv successfully!")

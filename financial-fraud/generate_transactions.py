import csv
from datetime import datetime, timedelta
import random

# just a fixed random seed, change if you want unique datasets
random.seed(42)

# simulated account, pauer, merchant IDs
accounts = [f"acct_{i:04}" for i in range(1001, 1301)]
payers = [f"user_{i:04}" for i in range(1001, 1301)]
merchants = [f"merc_{i:04}" for i in range(9001, 9201)]
# countries include some low risk ones (US) and high risk ones (RU)
countries = ["US", "US", "US", "US", "FR", "CA", "GB", "DE", "NG", "IR", "RU"]
# where the transaction occured
channels = ["app", "web", "mobile", "atm"]
# non-exhaustive list of merchants used to mimmic real transactions
merchant_categories = [
    "grocery", "digital_goods", "wire", "airfare", "subscription",
    "restaurant", "books", "crypto_exchange", "clothing", "consulting"
]

# creates a synthetic transaction dictionary based off a mix of clean, suspicious, and fraudulent patterns.
def generate_transaction(i, base_time):
    #randomly select transaction fields
    account_id = random.choice(accounts)
    payer_id = random.choice(payers)
    payee_id = random.choice(merchants)
    country = random.choice(countries)
    channel = random.choice(channels)
    category = random.choice(merchant_categories)
    device_id = f"dev_{random.choice('abcdefghijklmnopqrstuvwxyz')}{random.randint(1,10)}"
    ip_hash = f"ip_{random.randint(1,9999)}"
    # starting balance for account (can be modified)
    balance_before = round(random.uniform(20, 20000), 2)
    # randomly decide transaction type using weighted probabilities, for testing we are using:
    # 70% clean, 20% suspicicious, 10% fraudulent
    fraud_type = random.choices(["clean", "suspicious", "fraud"], weights=[0.7, 0.2, 0.1])[0]
    amount = round(random.uniform(1, 10000), 2)
    notes = "normal transaction"
    label = 0

    # fraudulent transactions
    if fraud_type == "fraud":
        # randomly pick fraud pattern
        fraud_pattern = random.choice(["high_amount", "negative_balance", "high_risk_country"])
        if fraud_pattern == "high_amount":
            # very large amount (potentially suspicious, needs to be reported to IRS)
            amount = round(random.uniform(5000, 25000), 2)
            notes = "large transfer to new payee"
        elif fraud_pattern == "negative_balance":
            # withdraws more than the account balance (impossible balances, outright impossible not necessarily fraud)
            amount = round(balance_before + random.uniform(10, 2000), 2)
            notes = "transaction exceeds balance"
        elif fraud_pattern == "high_risk_country":
            # wire transfer to known high-risk country
            country = random.choice(["NG", "IR", "RU", "KP"])
            amount = round(random.uniform(1000, 20000), 2)
            notes = "wire to high-risk country"
        label = 2 # mark these as fradulent transactions

    # suspicious transactions    
    elif fraud_type == "suspicious":
        # randomly select suspicious behavior
        pattern = random.choice(["micro_repeat", "high_velocity", "near_zero_balance"])
        if pattern == "micro_repeat":
            # multiple small charges
            amount = round(random.uniform(1, 5), 2)
            notes = "repeated small micro-charges"
        elif pattern == "high_velocity":
            # multiple purchases in quick succesion
            amount = round(random.uniform(10, 100), 2)
            notes = "multiple quick purchases"
        elif pattern == "near_zero_balance":
            # leaves account almost or zero after a transaction
            amount = round(balance_before - random.uniform(18, 19), 2)
            notes = "near-zero balance after transaction"
        label = 1 # mark these as a suspicious transaction
    
    # clean transactions
    else:
        # normal legit purchases (white noise to test accuracy)
        notes = random.choice([
            "normal grocery", "monthly subscription", "restaurant meal",
            "book purchase", "travel expense"
        ])

    # calculate new account balance
    balance_after = round(balance_before - amount, 2)
    # if account was overdrawn, make the balance negative
    if label == 2 and notes == "transaction exceeds balance":
        balance_after = round(random.uniform(-500, -1), 2)

    # synthesize a realistic timestamp in minutes
    tx_time = base_time + timedelta(minutes=random.randint(1, 5*i))

    # one completed transaction record
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

# start making transactions from this time (YYYY, MM, DD, etc)
base_time = datetime(2025, 10, 1, 8, 0, 0)
transactions = [generate_transaction(i, base_time) for i in range(1, 10001)]

# write to CSV in format specified
with open("transactions_10000.csv", "w", newline='', encoding="utf-8") as csvfile:
    fieldnames = [
        "transaction_id", "timestamp", "account_id", "payer_id", "payee_id",
        "amount", "currency", "merchant_category", "country", "channel",
        "device_id", "ip_hash", "balance_before", "balance_after", "label", "notes"
    ]
    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(transactions)

print("Generated transactions successfully!")

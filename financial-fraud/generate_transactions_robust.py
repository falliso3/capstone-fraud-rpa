import csv
import argparse
import random
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple

# here are a few tunable knobs at the top so you don't have to dig throughout the script
DEFAULT_N_TRANSACTIONS = 10_000

# label mix which get normalized but it's nice to control here
DEFAULT_LABEL_WEIGHTS = {
    "clean": 0.7,
    "suspicious": 0.2,
    "fraud": 0.1,
}

# if seed=None: new randomness each run (nice for entropy)
# change to an integer number for repeatable results (e.g. 42)
DEFAULT_SEED = 42

# how many days to spread timestamps over
DEFAULT_DAYS_SPAN = 30

# starting money range in accounts (randomized per account)
ACCOUNT_START_BALANCE = (500, 5000)

# -------------------------------------------------------------------------
# more realistic IDs and merchant data
# -------------------------------------------------------------------------

# looks like bank account numbers (synthetic but less fakeish)
accounts = [f"ACCT{100000 + i}" for i in range(300)]

# payer is usually "your card" so these sorta mimic that
payers = [f"CARD{4000 + i:04d}" for i in range(300)]

# list of merchants w/ categories, rough frequency weights, and amount ranges
# trying to keep these realistic-ish without being crazy exhaustive
MERCHANT_PROFILES = [
    # groceries / big box stuff
    {"name": "Safeway", "category": "groceries", "weight": 10, "amt": (30, 150)},
    {"name": "Walmart Supercenter", "category": "groceries", "weight": 10, "amt": (25, 180)},
    {"name": "Costco Wholesale", "category": "groceries", "weight": 6, "amt": (60, 300)},

    # coffee + quick eats
    {"name": "Starbucks", "category": "coffee", "weight": 8, "amt": (4, 15)},
    {"name": "Dutch Bros Coffee", "category": "coffee", "weight": 6, "amt": (4, 15)},
    {"name": "McDonalds", "category": "fast_food", "weight": 6, "amt": (6, 18)},
    {"name": "Chipotle", "category": "restaurants", "weight": 5, "amt": (10, 25)},
    {"name": "Chick-fil-A", "category": "fast_food", "weight": 5, "amt": (8, 20)},

    # delivery / online
    {"name": "Uber Eats", "category": "delivery", "weight": 4, "amt": (15, 60)},
    {"name": "DoorDash", "category": "delivery", "weight": 4, "amt": (15, 60)},
    {"name": "Amazon Marketplace", "category": "online_retail", "weight": 9, "amt": (10, 120)},
    {"name": "Apple.com/Bill", "category": "online_services", "weight": 6, "amt": (5, 40)},

    # subs + utilities
    {"name": "Netflix.com", "category": "subscription", "weight": 4, "amt": (10, 20)},
    {"name": "Spotify", "category": "subscription", "weight": 4, "amt": (5, 15)},
    {"name": "Hulu", "category": "subscription", "weight": 2, "amt": (5, 15)},
    {"name": "T-Mobile", "category": "utilities", "weight": 3, "amt": (40, 120)},
    {"name": "Verizon Wireless", "category": "utilities", "weight": 3, "amt": (40, 140)},
    {"name": "SRP Electric", "category": "utilities", "weight": 3, "amt": (50, 200)},
    {"name": "City Water & Sewer", "category": "utilities", "weight": 2, "amt": (30, 120)},

    # fuel / rides
    {"name": "Shell Oil", "category": "fuel", "weight": 5, "amt": (30, 90)},
    {"name": "Circle K", "category": "fuel", "weight": 5, "amt": (20, 70)},
    {"name": "Uber Trip", "category": "rideshare", "weight": 4, "amt": (8, 45)},
    {"name": "Lyft Ride", "category": "rideshare", "weight": 3, "amt": (8, 45)},
    {"name": "Campus Parking", "category": "parking", "weight": 2, "amt": (5, 25)},

    # travel (rare)
    {"name": "Southwest Airlines", "category": "travel", "weight": 1, "amt": (120, 600)},
    {"name": "Airbnb", "category": "travel", "weight": 1, "amt": (80, 500)},

    # rent (big + rare)
    {"name": "Sunrise Apartments", "category": "rent", "weight": 1, "amt": (800, 1700)},

    # person to person (venmo/zelle etc)
    {"name": "Zelle Payment", "category": "p2p", "weight": 4, "amt": (10, 400)},
    {"name": "Venmo Cashout", "category": "p2p", "weight": 3, "amt": (5, 300)},

    # misc shopping
    {"name": "Target", "category": "retail", "weight": 6, "amt": (20, 150)},
    {"name": "Best Buy", "category": "electronics", "weight": 2, "amt": (40, 600)},
]

# mostly US, with some not-US and high-risk
countries = ["US"] * 7 + ["CA", "MX", "GB", "DE", "NG", "IR", "RU"]

# channel used: atm, online, mobile, etc
channels = ["in_store", "online", "mobile_app", "atm"]

CURRENCY = "USD"

# -------------------------------------------------------------------------
# helper funcs
# -------------------------------------------------------------------------

def pick_label(weights: Dict[str, float]) -> str:
    return random.choices(list(weights.keys()), list(weights.values()), k=1)[0]

def choose_merchant() -> Dict[str, Any]:
    return random.choices(MERCHANT_PROFILES,
                          weights=[m["weight"] for m in MERCHANT_PROFILES],
                          k=1)[0]

def random_device_id(account_id: str) -> str:
    return f"DEV-{account_id}-{random.randint(1,4)}"

def random_ip_hash(account_id: str) -> str:
    # quick fake ip 'fingerprint'
    prefix = hash(account_id) & 0xFFFF
    return f"ip_{prefix:04x}{random.randint(0,0xFFFF):04x}"

def init_balances() -> Dict[str, float]:
    # give each account its own starting balance
    return {
        acct: round(random.uniform(*ACCOUNT_START_BALANCE), 2)
        for acct in accounts
    }

def normalize_weights(raw):
    c, s, f = raw
    total = c + s + f
    return {"clean": c/total, "suspicious": s/total, "fraud": f/total}

# -------------------------------------------------------------------------
# main transaction generator
# -------------------------------------------------------------------------

def generate_transaction(tx_id, base_time, days_span, balances, label_weights):

    # pick account + merchant + random context stuff
    account_id = random.choice(accounts)
    payer_id   = random.choice([f"{account_id}-CHK", random.choice(payers)])
    merchant   = choose_merchant()
    payee_id   = "MCHT_" + merchant["name"].upper().replace(" ", "_").replace(".", "")

    country = random.choice(countries)
    channel = random.choice(channels)

    # timestamp is spread across (days_span) days
    ts = base_time + timedelta(seconds=random.randint(0, days_span * 86400))

    # light time-of-day realism so categories 'feel' right
    mc = merchant["category"]
    if mc in {"coffee", "fast_food"}:
        ts = ts.replace(hour=random.randint(6, 10), minute=random.randint(0, 59))
    elif mc in {"restaurants", "delivery"}:
        ts = ts.replace(hour=random.randint(17, 21), minute=random.randint(0, 59))
    elif mc == "fuel":
        ts = ts.replace(hour=random.choice([7, 8, 17, 18]), minute=random.randint(0, 59))
    elif mc == "rent":
        ts = ts.replace(hour=random.randint(0, 5), minute=random.randint(0, 59))

    # grab account balance
    bal_before = balances[account_id]

    # pick what type of transaction we’re making (clean/susp/fraud)
    tx_type = pick_label(label_weights)

    # defaults
    notes = ""
    amount = 0

    # ---------------------------------------------------------------------
    # fraudulent transaction patterns
    # ---------------------------------------------------------------------
    
    if tx_type == "fraud":
        p = random.choice(["high_amount", "drain_balance", "odd_country"])
        if p == "high_amount":
            low, high = merchant["amt"]
            amount = round(random.uniform(high*1.2, high*2.5), 2)
            notes = "high amount potential fraud"
        elif p == "drain_balance":
            amount = round(bal_before + random.uniform(50, 500), 2)
            notes = "sudden full-drain transaction"
        # odd country
        else:
            low, high = merchant["amt"]
            base = max(high, 750)
            amount = round(random.uniform(base, base*2), 2)
            if country == "US":
                country = random.choice(["NG", "IR", "RU"])
            notes = "unusual country high amount"
        label = 2

    # ---------------------------------------------------------------------
    # suspicious transaction patterns
    # ---------------------------------------------------------------------
    
    elif tx_type == "suspicious":
        p = random.choice(["odd_hour", "micro_bursts", "near_zero_balance"])
        if p == "odd_hour":
            ts = ts.replace(hour=random.randint(0, 4), minute=random.randint(0, 59))
            low, high = merchant["amt"]
            amount = round(random.uniform(low, high), 2)
            notes = "unusual late-night transaction"
        elif p == "micro_bursts":
            amount = round(random.uniform(2, 25), 2)
            notes = "multiple small purchases"
        else:
            # make balance basically 0 but not negative
            if bal_before <= 20:
                bal_before = balances[account_id] = round(random.uniform(100, 300), 2)
            amount = round(bal_before - random.uniform(1, 10), 2)
            notes = "near-zero balance after transaction"
        label = 1

    # ---------------------------------------------------------------------
    # clean transactions (normal everyday stuff)
    # ---------------------------------------------------------------------
    
    else:
        low, high = merchant["amt"]
        amount = round(random.uniform(low, high), 2)

        # give notes something kinda humany sounding
        if mc == "groceries":
            notes = "grocery run"
        elif mc in {"coffee", "fast_food"}:
            notes = "quick food/coffee"
        elif mc in {"restaurants", "delivery"}:
            notes = "meal out"
        elif mc == "fuel":
            notes = "gas station"
        elif mc == "subscription":
            notes = "subscription renewal"
        elif mc == "utilities":
            notes = "monthly bill"
        elif mc == "rent":
            notes = "monthly rent"
        elif mc == "p2p":
            notes = "peer payment"
        else:
            notes = "normal transaction"
        label = 0

    # update balance (fraud can go negative)
    bal_after = round(bal_before - amount, 2)
    balances[account_id] = bal_after

    #build final row
    return {
        "transaction_id": f"tx{tx_id:06d}",
        "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "account_id": account_id,
        "payer_id": payer_id,
        "payee_id": payee_id,
        "amount": f"{amount:.2f}",
        "currency": CURRENCY,
        "merchant_category": mc,
        "merchant_name": merchant["name"],
        "country": country,
        "channel": channel,
        "device_id": random_device_id(account_id),
        "ip_hash": random_ip_hash(account_id),
        "balance_before": f"{bal_before:.2f}",
        "balance_after": f"{bal_after:.2f}",
        "label": label,
        "notes": notes,
    }

# -------------------------------------------------------------------------
# main() CLI wrapper
# -------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="synthetic financial tx generator w/ tunable parameters")
    parser.add_argument("--n", type=int, default=DEFAULT_N_TRANSACTIONS)
    parser.add_argument("--p-clean", type=float, default=DEFAULT_LABEL_WEIGHTS["clean"])
    parser.add_argument("--p-suspicious", type=float, default=DEFAULT_LABEL_WEIGHTS["suspicious"])
    parser.add_argument("--p-fraud", type=float, default=DEFAULT_LABEL_WEIGHTS["fraud"])
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--days-span", type=int, default=DEFAULT_DAYS_SPAN)
    parser.add_argument("-o", "--output", default=None)

    args = parser.parse_args()

    # seed behavior: if seed is None, use 'fresh randomness'
    if args.seed is not None:
        random.seed(args.seed)
    else:
        random.seed()

    label_weights = normalize_weights((args.p_clean, args.p_suspicious, args.p_fraud))

    base_time = datetime.utcnow()
    balances = init_balances()

    rows = [
        generate_transaction(
            tx_id=i,
            base_time=base_time,
            days_span=args.days_span,
            balances=balances,
            label_weights=label_weights,
        )
        for i in range(1, args.n + 1)
    ]

    out = args.output or f"transactions_{args.n}.csv"

    fieldnames = [
        "transaction_id", "timestamp", "account_id", "payer_id", "payee_id",
        "amount", "currency", "merchant_category", "merchant_name", "country",
        "channel", "device_id", "ip_hash", "balance_before", "balance_after",
        "label", "notes"
    ]

    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    print(f"generated {args.n} transactions → {out}")
    print(f"label mix: clean {label_weights['clean']:.2f}, suspicious {label_weights['suspicious']:.2f}, fraud {label_weights['fraud']:.2f}")

if __name__ == "__main__":
    main()

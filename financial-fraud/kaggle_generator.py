#!/usr/bin/env python3
"""
kaggle_generator.py

makes fake transactions using the kaggle "online payments fraud" columns.

goal here IS NOT perfect realism, it's just:
- not total nonsense
- balances mostly make sense
- fraud shows up mostly in TRANSFER/CASH_OUT like the dataset

good for sandbox testing / demos.
"""

import argparse
import csv
import random
from dataclasses import dataclass
from typing import Dict, List, Tuple


# basic type pool (same naming as kaggle dataset)
TX_TYPES = ["PAYMENT", "TRANSFER", "CASH_OUT", "DEBIT", "CASH_IN"]

# not exact, just "feels right" for lots of tests
TYPE_WEIGHTS = {
    "PAYMENT": 0.50,
    "TRANSFER": 0.20,
    "CASH_OUT": 0.18,
    "DEBIT": 0.07,
    "CASH_IN": 0.05,
}

# most fraud in that dataset is basically transfer/cashout
FRAUD_TYPE_WEIGHTS = {
    "TRANSFER": 0.55,
    "CASH_OUT": 0.45,
}

# amount ranges per type (super hand-wavy but works)
AMOUNT_RANGES = {
    "PAYMENT": (1.0, 25_000.0),
    "TRANSFER": (1.0, 200_000.0),
    "CASH_OUT": (1.0, 200_000.0),
    "DEBIT": (1.0, 50_000.0),
    "CASH_IN": (1.0, 150_000.0),
}


@dataclass
class Account:
    # tiny struct to keep balances attached to ids
    name: str
    balance: float


def _weighted_choice(weights: Dict[str, float]) -> str:
    # quick helper for picking based on weights dict
    keys = list(weights.keys())
    vals = list(weights.values())
    return random.choices(keys, weights=vals, k=1)[0]


def _make_customer_ids(n: int) -> List[str]:
    # kaggle uses C##########, so we mimic that shape
    return [f"C{random.randint(10**9, 10**10 - 1)}" for _ in range(n)]


def _make_merchant_ids(n: int) -> List[str]:
    # kaggle merchants often look like M##########
    return [f"M{random.randint(10**9, 10**10 - 1)}" for _ in range(n)]


def _init_accounts(customer_ids: List[str], start_range: Tuple[float, float]) -> Dict[str, Account]:
    # give each customer some starting balance so transactions can happen
    lo, hi = start_range
    out: Dict[str, Account] = {}
    for cid in customer_ids:
        out[cid] = Account(name=cid, balance=round(random.uniform(lo, hi), 2))
    return out


def _clip2(x: float) -> float:
    # keep balances from going negative for clean rows (fraud can still do weird stuff)
    return round(max(0.0, x), 2)


def _sample_amount(tx_type: str) -> float:
    # pick an amount with a skew (more small ones than huge ones)
    lo, hi = AMOUNT_RANGES[tx_type]
    r = random.random()
    r = r ** 2.2  # bias towards small
    amt = lo + (hi - lo) * r
    return round(max(lo, amt), 2)


def _choose_dest_for_type(tx_type: str, customers: List[str], merchants: List[str]) -> str:
    # keep it simple:
    # - payment/debit -> merchant
    # - transfer/cashout/cashin -> customer
    if tx_type in ("PAYMENT", "DEBIT"):
        return random.choice(merchants)
    if tx_type in ("TRANSFER", "CASH_OUT", "CASH_IN"):
        return random.choice(customers)
    return random.choice(customers)


def _generate_clean_row(step: int, tx_type: str, orig: str, dest: str, accounts: Dict[str, Account]) -> Dict[str, str]:
    # normal transactions that mostly behave like you'd expect
    amt = _sample_amount(tx_type)

    old_org = accounts[orig].balance
    old_dest = accounts.get(dest, Account(dest, 0.0)).balance if dest.startswith("C") else 0.0

    # try to avoid "clean" rows doing impossible spends
    if tx_type in ("PAYMENT", "TRANSFER", "CASH_OUT", "DEBIT") and old_org < amt:
        amt = round(max(1.0, old_org * random.uniform(0.2, 0.95)), 2)

    # apply balance changes on origin
    if tx_type in ("PAYMENT", "DEBIT", "TRANSFER", "CASH_OUT"):
        new_org = _clip2(old_org - amt)
    else:  # CASH_IN
        new_org = round(old_org + amt, 2)

    # destination behavior is weird in the real dataset for merchants, so:
    # - merchants stay 0
    # - customers only really get credited on TRANSFER
    if dest.startswith("C"):
        if tx_type == "TRANSFER":
            new_dest = round(old_dest + amt, 2)
        elif tx_type == "CASH_IN":
            new_dest = old_dest
        elif tx_type == "CASH_OUT":
            new_dest = old_dest
        else:
            new_dest = old_dest
    else:
        new_dest = 0.0

    # persist updated balances
    accounts[orig].balance = new_org
    if dest.startswith("C") and dest in accounts and tx_type == "TRANSFER":
        accounts[dest].balance = new_dest

    return {
        "step": str(step),
        "type": tx_type,
        "amount": f"{amt:.2f}",
        "nameOrig": orig,
        "oldbalanceOrg": f"{old_org:.2f}",
        "newbalanceOrig": f"{new_org:.2f}",
        "nameDest": dest,
        "oldbalanceDest": f"{old_dest:.2f}" if dest.startswith("C") else "0.00",
        "newbalanceDest": f"{new_dest:.2f}" if dest.startswith("C") else "0.00",
        "isFraud": "0",
    }


def _generate_fraud_row(step: int, orig: str, dest: str, accounts: Dict[str, Account]) -> Dict[str, str]:
    # fraud rows: mostly drain-y transfers/cashouts with some dataset-like quirks
    fraud_type = _weighted_choice(FRAUD_TYPE_WEIGHTS)

    old_org = accounts[orig].balance

    # if balance is tiny, bump it so we can still generate a meaningful fraud row
    if old_org < 50.0:
        accounts[orig].balance = round(old_org + random.uniform(200.0, 5_000.0), 2)
        old_org = accounts[orig].balance

    # drain-ish amount (not always exactly 100%)
    amt = round(old_org * random.uniform(0.7, 1.2), 2)
    amt = max(10.0, amt)

    new_org = _clip2(old_org - amt)

    # destination in the kaggle dataset often stays at 0 even if money "moved"
    # so we mostly keep it that way, sometimes credit it
    credit_dest = random.random() < 0.25
    old_dest = accounts.get(dest, Account(dest, 0.0)).balance if dest.startswith("C") else 0.0

    if dest.startswith("C") and credit_dest and fraud_type == "TRANSFER":
        new_dest = round(old_dest + amt, 2)
        if dest in accounts:
            accounts[dest].balance = new_dest
    else:
        new_dest = old_dest if dest.startswith("C") else 0.0

    # update origin balance after the "theft"
    accounts[orig].balance = new_org

    return {
        "step": str(step),
        "type": fraud_type,
        "amount": f"{amt:.2f}",
        "nameOrig": orig,
        "oldbalanceOrg": f"{old_org:.2f}",
        "newbalanceOrig": f"{new_org:.2f}",
        "nameDest": dest,
        "oldbalanceDest": f"{old_dest:.2f}" if dest.startswith("C") else "0.00",
        "newbalanceDest": f"{new_dest:.2f}" if dest.startswith("C") else "0.00",
        "isFraud": "1",
    }


def main() -> None:
    # cli args (mostly just knobs for how big / how random)
    p = argparse.ArgumentParser(description="Generate Kaggle-style online payment transactions (sandbox).")
    p.add_argument("-n", "--num", type=int, default=10_000, help="Number of rows to generate.")
    p.add_argument("--seed", type=int, default=None, help="Random seed for reproducible runs.")
    p.add_argument("--steps", type=int, default=720, help="How many steps (hours) to span (default 720 ~ 30 days).")
    # CHANGE THIS LINE FOR FRAUD RATE
    # or just be sane and use the command line and pass --fraud-rate
    p.add_argument("--fraud-rate", type=float, default=0.02, help="Fraction of rows labeled isFraud=1 (0..1).")
    p.add_argument("--num-customers", type=int, default=2_000, help="Size of customer ID pool.")
    p.add_argument("--num-merchants", type=int, default=300, help="Size of merchant ID pool.")
    p.add_argument("--start-balance-min", type=float, default=0.0, help="Min starting balance for customers.")
    p.add_argument("--start-balance-max", type=float, default=200_000.0, help="Max starting balance for customers.")
    p.add_argument("-o", "--out", default="kaggle_sandbox_transactions.csv", help="Output CSV filename.")
    args = p.parse_args()

    # seed: set for repeatable, or leave None for fresh randomness
    if args.seed is not None:
        random.seed(args.seed)
    else:
        random.seed()

    if not (0.0 <= args.fraud_rate <= 1.0):
        raise SystemExit("ERROR: --fraud-rate must be between 0 and 1.")

    # make the pools
    customers = _make_customer_ids(args.num_customers)
    merchants = _make_merchant_ids(args.num_merchants)
    accounts = _init_accounts(customers, (args.start_balance_min, args.start_balance_max))

    fieldnames = [
        "step", "type", "amount", "nameOrig", "oldbalanceOrg", "newbalanceOrig",
        "nameDest", "oldbalanceDest", "newbalanceDest", "isFraud",
    ]

    # write the file out row by row
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()

        for _ in range(args.num):
            step = random.randint(1, max(1, args.steps))
            is_fraud = random.random() < args.fraud_rate

            tx_type = _weighted_choice(TYPE_WEIGHTS)
            orig = random.choice(customers)
            dest = _choose_dest_for_type(tx_type, customers, merchants)

            # keep it from doing orig == dest when dest is a customer
            if dest == orig and dest.startswith("C"):
                dest = random.choice(customers)

            if is_fraud:
                row = _generate_fraud_row(step, orig, dest, accounts)
            else:
                row = _generate_clean_row(step, tx_type, orig, dest, accounts)

            w.writerow(row)

    # quick log so you know what you generated
    print(f"Generated {args.num} rows -> {args.out}")
    print(f"fraud_rate={args.fraud_rate:.4f}, steps_span={args.steps}, customers={args.num_customers}, merchants={args.num_merchants}")


if __name__ == "__main__":
    main()

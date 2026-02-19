import math

FEATURE_COLUMNS = [
    "log_amount",
    "stripe_risk_score",
    "internal_score",
    "cnt10m",
    "cnt1h",
    "totalAmount1h",
    "smallCount1h",
    "failCount30m",
    "cvc_fail",
    "postal_fail",
    "addr_checks_missing",
    "country_mismatch_card_ship",
    "country_mismatch_card_bill",
    "has_fingerprint",
]

def _get(d, path, default=None):
    cur = d
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            return default
        cur = cur[p]
    return cur

def extract_features(tx: dict) -> dict:
    amount = tx.get("amount") or 0
    risk_score = _get(tx, ["risk", "score"], 0) or 0
    internal_score = _get(tx, ["internalRisk", "score"], 0) or 0

    feats = _get(tx, ["internalRisk", "features"], {}) or {}

    cvc = _get(tx, ["checks", "cvc_check"], None)
    postal = _get(tx, ["checks", "address_postal_code_check"], None)
    line1 = _get(tx, ["checks", "address_line1_check"], None)

    card_country = _get(tx, ["card", "country"], None)
    ship_country = tx.get("shipping_country", None)
    bill_country = tx.get("billing_country", None)

    fingerprint = _get(tx, ["card", "fingerprint"], None)

    return {
        "log_amount": math.log1p(amount),
        "stripe_risk_score": float(risk_score) if isinstance(risk_score, (int, float)) else 0.0,
        "internal_score": float(internal_score) if isinstance(internal_score, (int, float)) else 0.0,
        "cnt10m": float(feats.get("cnt10m", 0) or 0),
        "cnt1h": float(feats.get("cnt1h", 0) or 0),
        "totalAmount1h": float(feats.get("totalAmount1h", 0) or 0),
        "smallCount1h": float(feats.get("smallCount1h", 0) or 0),
        "failCount30m": float(feats.get("failCount30m", 0) or 0),
        "cvc_fail": 1.0 if cvc == "fail" else 0.0,
        "postal_fail": 1.0 if postal == "fail" else 0.0,
        "addr_checks_missing": 1.0 if (postal is None and line1 is None) else 0.0,
        "country_mismatch_card_ship": 1.0 if (card_country and ship_country and card_country != ship_country) else 0.0,
        "country_mismatch_card_bill": 1.0 if (card_country and bill_country and card_country != bill_country) else 0.0,
        "has_fingerprint": 1.0 if fingerprint else 0.0,
    }

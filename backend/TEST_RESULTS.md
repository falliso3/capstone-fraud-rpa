# ✅ TEST RESULTS — Task #68
**Goal:** Verify API connectivity and core routes for Transactions service.

**Environment**
- OS: Windows 11
- Runtime: Docker Desktop
- Stack: FastAPI + PostgreSQL
- Date: 2025-10-14

---

## 🩺 Health Checks

**Commands**
```bash
curl -s http://localhost:8000/healthz
curl -s http://localhost:8000/api/health
Output

json
Copy code
{"status":"ok"}
{"status":"ok"}
🧩 POST /transactions (tx0001)
Command (PowerShell)

powershell
Copy code
$body = @{
  transaction_id   = "tx0001"
  timestamp        = "2025-09-29T08:12:22Z"
  account_id       = "acct_1001"
  payer_id         = "user_1001"
  payee_id         = "merc_9001"
  amount           = 12.50
  currency         = "USD"
  merchant_category= "grocery"
  country          = "US"
  channel          = "app"
  device_id        = "dev_a1"
  ip_hash          = "ip_h1"
  balance_before   = 100.00
  balance_after    = 87.50
  label            = 0
  notes            = "normal weekly grocery"
} | ConvertTo-Json -Depth 5

irm -Method Post -Uri http://localhost:8000/transactions -ContentType "application/json" -Body $body
Response

json
Copy code
{
  "transaction_id": "tx0001",
  "timestamp": "2025-09-29T08:12:22Z",
  "account_id": "acct_1001",
  "payer_id": "user_1001",
  "payee_id": "merc_9001",
  "amount": 12.5,
  "currency": "USD",
  "merchant_category": "grocery",
  "country": "US",
  "channel": "app",
  "device_id": "dev_a1",
  "ip_hash": "ip_h1",
  "balance_before": 100.0,
  "balance_after": 87.5,
  "label": 0,
  "notes": "normal weekly grocery"
}
🔁 Duplicate POST
Command

powershell
Copy code
irm -Method Post -Uri http://localhost:8000/transactions -ContentType "application/json" -Body $body
Response

json
Copy code
{"detail":"transaction_id already exists"}
✅ Confirms duplicate PK returns conflict (409) as expected.

🧾 GET /transactions
Command

bash
Copy code
curl -s http://localhost:8000/transactions
Output (current DB state)

json
Copy code
[
  {
    "transaction_id":"tx0002",
    "timestamp":"2025-10-01T10:00:00+00:00",
    "account_id":"acct_2002",
    "payer_id":"user_2002",
    "payee_id":"merc_9002",
    "amount":25.0,
    "currency":"USD",
    "merchant_category":"online",
    "country":"US",
    "channel":"web",
    "device_id":"dev_b2",
    "ip_hash":"ip_h2",
    "balance_before":250.0,
    "balance_after":225.0,
    "label":0,
    "notes":"test insert"
  },
  {
    "transaction_id":"tx0001",
    "timestamp":"2025-09-29T08:12:22+00:00",
    "account_id":"acct_1001",
    "payer_id":"user_1001",
    "payee_id":"merc_9001",
    "amount":12.5,
    "currency":"USD",
    "merchant_category":"grocery",
    "country":"US",
    "channel":"app",
    "device_id":"dev_a1",
    "ip_hash":"ip_h1",
    "balance_before":100.0,
    "balance_after":87.5,
    "label":0,
    "notes":"normal weekly grocery"
  }
]
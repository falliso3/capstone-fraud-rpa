🚨 Fraud Detection Pipeline (Draft Architecture)

This folder contains a full end-to-end fraud detection pipeline prototype built for the Capstone project.

It integrates:

Stripe Webhooks

MongoDB Event Storage

Rule-Based Risk Scoring

Machine Learning Scoring (FastAPI)

GPT Analyst Summaries

React Fraud Ops Dashboard

This is an isolated architecture draft and does not modify the main project structure.

🏗 Architecture Overview
Stripe (Test Payment)
        ↓
stripe listen (CLI)
        ↓
backend/server.js (/webhook)
        ↓
MongoDB (stripe_events + transactions)
        ↓
backend/worker.js
    ↳ Internal Risk Rules
    ↳ ML Scoring (FastAPI service)
    ↳ GPT Summary (OpenAI)
        ↓
frontend/ React Dashboard

📁 Folder Structure
pipeline-draft/
│
├── backend/
│   ├── server.js
│   ├── worker.js
│   ├── package.json
│   └── README.md
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── .env
│
├── ml/
│   ├── score_service.py
│   ├── model artifacts
│   └── training utilities
│
├── start-dev.ps1
├── stop-dev.ps1
└── README.md (this file)

🔹 backend/

Node.js + Express service.

Responsibilities

Receives Stripe webhook events

Stores raw events in stripe_events

Maintains curated transactions collection

Computes rule-based fraud decision

Queues summaries for background processing

Exposes API endpoints for dashboard

Key Collections

stripe_events

Raw Stripe webhook payloads

transactions

Projection layer used by fraud dashboard

Includes:

Stripe data

Internal risk score

ML probability

GPT summary

Final decision

🔹 ml/

Python FastAPI microservice.

Runs on:
http://localhost:8000

Endpoint
POST /score

Returns
{
  "prob_fraud": 0.87,
  "model_version": "v1_20260219"
}


Used by worker.js to enrich transactions.

🔹 frontend/

React + Vite dashboard.

Displays

Transaction list

Stripe risk score

Internal rule score

ML fraud probability

GPT-generated analyst summary

Raw JSON view

“Queue Summary” action

Runs on:

http://localhost:5173

⚙️ Required Environment Variables
backend/.env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
OPENAI_API_KEY=
MONGODB_URI=
MONGODB_DB=

frontend/.env
VITE_API_BASE=http://localhost:5000

🚀 How To Run

You must run 5 services.

Option 1 — Recommended (Dev Script)

From project root:

.\pipeline-draft\start-dev.ps1


To stop everything:

.\pipeline-draft\stop-dev.ps1

Option 2 — Manual Startup
1️⃣ Backend API
cd pipeline-draft/backend
node server.js

2️⃣ Worker
cd pipeline-draft/backend
node worker.js

3️⃣ Stripe Webhook Forwarder
stripe listen --forward-to http://localhost:5000/webhook

4️⃣ ML Service

Activate virtual environment:

C:\Users\bryso\ml-env\.venv\Scripts\Activate.ps1


Then:

cd pipeline-draft/ml
uvicorn score_service:app --host 0.0.0.0 --port 8000

5️⃣ Frontend
cd pipeline-draft/frontend
npm run dev

🧪 How To Test End-to-End
1️⃣ Trigger Stripe Event
stripe trigger payment_intent.succeeded


or create a test payment via Stripe dashboard.

2️⃣ Observe Backend Logs

You should see:

Received event: payment_intent.succeeded

3️⃣ Observe Worker Logs

You should see:

Internal risk scoring

ML scoring

GPT summary generation

4️⃣ Open Dashboard
http://localhost:5173


You should see:

New transaction

Risk scores

ML probability

GPT summary

🧠 Decision Logic

Final decision is computed from:

Stripe risk score

Internal rule score

ML probability

Dispute status

Examples:

fraud_confirmed

high_risk

manual_review

approved

declined

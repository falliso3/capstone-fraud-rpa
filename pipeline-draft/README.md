Fraud Detection with AI + Stripe + ML + GPT

This project is a full end-to-end fraud detection pipeline that integrates:

Stripe Webhooks

MongoDB

Rule-Based Risk Scoring

Machine Learning Scoring (FastAPI)

GPT-generated Analyst Summaries

React Fraud Ops Dashboard

It simulates a production-style fraud monitoring system.

📁 Project Structure
MongoDB/
│
├── backend/
├── frontend/
├── ml/
│
├── start-dev.ps1
├── stop-dev.ps1
└── README.md

🔹 1. backend/

The backend is a Node.js + Express API that:

Receives Stripe webhook events

Stores raw Stripe events in MongoDB (stripe_events)

Maintains a curated transactions collection

Applies rule-based fraud logic

Queues GPT summaries

Serves API endpoints for the dashboard

Key Files

server.js → Main API + Stripe webhook handler

worker.js → Background processor

Applies internal risk rules

Calls ML model

Generates GPT summaries

.env → Contains:

STRIPE_SECRET_KEY

STRIPE_WEBHOOK_SECRET

OPENAI_API_KEY

MONGODB_URI

MONGODB_DB

What It Does

When Stripe sends events:

Stripe → /webhook → MongoDB


The backend:

Stores raw event

Updates transactions projection

Computes decision status

Flags transaction for ML + GPT if needed

🔹 2. ml/

This folder contains the Machine Learning service.

It is a FastAPI app served by uvicorn.

Key Files

score_service.py → FastAPI API

train.py → Model training

features.py → Feature engineering

artifacts/ → Saved trained model

.venv → Python virtual environment

What It Does

The ML service exposes:

POST /score


The backend/worker calls this service to get:

prob_fraud
model_version


This score is written into MongoDB under:

ml: {
  prob_fraud,
  model_version,
  ml_scoredAt
}

🔹 3. frontend/

This is a React + Vite dashboard.

It displays:

Transactions

Stripe risk score

Internal rule score

ML probability

GPT summary

Raw JSON

“Queue Summary” button

Key Files

src/App.jsx → Dashboard UI

src/main.jsx → React entry point

.env → Must contain:

VITE_API_BASE=http://localhost:5000

What It Does

It pulls from:

GET /api/transactions


And allows:

POST /api/transactions/:id/queue-summary

🧠 End-to-End Data Flow
Stripe Test Payment
      ↓
stripe listen
      ↓
backend /webhook
      ↓
MongoDB stripe_events
      ↓
MongoDB transactions (projection)
      ↓
worker.js
    ↳ internal rules
    ↳ ML score (FastAPI)
    ↳ GPT summary
      ↓
Frontend dashboard displays results

🚀 How to Run the Project

You must run 5 services:

Backend API

Worker

Stripe webhook forwarder

ML FastAPI service

Frontend dashboard

Option 1 (Recommended): Use Dev Script

From project root:

.\start-dev.ps1


This launches:

server.js

worker.js

stripe listen

uvicorn ML service

React dashboard

To stop everything:

.\stop-dev.ps1

Option 2: Manual Startup
1️⃣ Backend
cd backend
node server.js

2️⃣ Worker
cd backend
node worker.js

3️⃣ Stripe Webhook Forwarder
stripe listen --forward-to http://localhost:5000/webhook

4️⃣ ML Service

Activate Python environment:

C:\Users\bryso\ml-env\.venv\Scripts\Activate.ps1


Then:

cd ml
uvicorn score_service:app --host 0.0.0.0 --port 8000

5️⃣ Frontend
cd frontend
npm run dev


Open:

http://localhost:5173

🧪 How to Test End-to-End
1. Create Test Payment

Use Stripe CLI:

stripe trigger payment_intent.succeeded


OR create a test payment in Stripe dashboard.

2. Watch Backend Logs

You should see:

Received event: payment_intent.succeeded

3. Watch Worker Logs

You should see:

Internal risk computed

ML scored

GPT summary generated

4. Open Dashboard
http://localhost:5173


You should see:

New transaction

Risk scores

ML probability

GPT summary

🗄 MongoDB Collections
stripe_events

Stores raw Stripe webhook events.

transactions

Curated fraud-monitoring view containing:

Stripe data

Risk scores

Internal rule scores

ML probability

GPT summary

Decision status

🔐 Required Environment Variables
backend/.env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
OPENAI_API_KEY=
MONGODB_URI=
MONGODB_DB=

frontend/.env
VITE_API_BASE=http://localhost:5000

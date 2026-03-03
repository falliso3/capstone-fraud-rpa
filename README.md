# Fraud Detection Pipeline

## Deploy on Vercel

This repository can now be deployed directly from the repo root as a single Vercel project.

Vercel uses:

- static site output from `frontend/dist`
- serverless API routes from `api/[...route].js`

Required Vercel environment variables:

- `MONGODB_URI`
- `MONGODB_DB`
- `OPENAI_API_KEY`

Optional:

- `VITE_API_BASE`

If `VITE_API_BASE` is unset, the frontend calls the Vercel-hosted API at `/api/...` on the same deployment origin.

This Vercel setup is intended for the dashboard and transaction API. The `summarize` API route can now generate GPT summaries on demand, but it still does not replace the long-running webhook listener, worker, or ML service in `backend/` and `ml/`.

## Legacy architecture notes

This folder contains a full end-to-end fraud detection pipeline prototype built for the Capstone project.

- It integrates:
  - Stripe Webhooks
  - MongoDB Event Storage
  - Rule-Based Risk Scoring
  - Machine Learning Scoring (FastAPI)
  - GPT Analyst Summaries
  - React Fraud Ops Dashboard

This is an isolated architecture draft and does not modify the main project structure.

## 🏗 Architecture Overview
Stripe (Test Payment) <br>
&emsp; &emsp; &emsp; ↓ <br>
stripe listen (CLI) <br>
&emsp; &emsp; &emsp; ↓ <br>
backend/server.js (/webhook) <br>
&emsp; &emsp; &emsp; ↓ <br>
MongoDB (stripe_events + transactions) <br>
&emsp; &emsp; &emsp; ↓ <br>
backend/worker.js <br>
&emsp; ↳ Internal Risk Rules <br>
&emsp; ↳ ML Scoring (FastAPI service) <br>
&emsp; ↳ GPT Summary (OpenAI) <br>
&emsp; &emsp; &emsp; ↓ <br>
frontend/ React Dashboard

## 📁 Folder Structure
```
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
```

## What each peice does (high-level)
### 🔹 backend/
- Node.js + Express service.
- Responsibilities:
  - Receives Stripe webhook events
  - Stores raw events in MongoDB (`stripe_events`)
  - Maintains curated transactions collection (`transactions`)
  - Computes rule-based fraud decision
  - Queues summaries for background processing
  - Exposes API endpoints for dashboard

### Key Collections (MonogoDB)
**stripe_events**
- Raw Stripe webhook payloads
**transactions**
- Projection layer used by fraud dashboard
- Includes:
  - Stripe data
  - Internal risk score
  - ML probability (`ml_prob_fraud`)
  - GPT summary
  - Final decision

### 🔹 ml/
Python FastAPI microservice resposible for fraud probability scoring. <br>

**Runs on:** <br>
```http://localhost:8000```
<br> **Endpoint** <br>
`POST /score`
<br> **Returns**
```
{
  "prob_fraud": 0.87,
  "model_version": "v1_20260219"
}
```
Used by `worker.js` to enrich transactions.

### 🔹 frontend/
- React + Vite dashboard.
- Displays:
  - Transaction list
  - Stripe risk score
  - Internal rule score
  - ML fraud probability
  - GPT-generated analyst summary
  - Raw JSON view
  - “Queue Summary” action button (behavior depends on worker + API)
- **Runs on:**
```
http://localhost:5173
```

## 1) System Prerequisites
**Installed on your machine:**
- Node.js (LTS) + npm (comes with Node)
- Python 3.10+
- Stripe CLI
- MongoDB connection access
  - Either MongoDB Atlas or a local MongoDB server
- Git (optional)
**Stripe CLI auth**
- To use:
  - `stripe listen --forward-to http://localhost:5000/webhook`
- You must first be logged in first:
  - `stripe login`

## 2) Install Dependencies (one-time)
### Backend
Run inside: 
- `pipeline-draft/backend`
``` bash
npm install
```
### Frontend
Run inside: 
- `pipeline-draft/frontend`
``` bash
npm install
```

### ML service 
Install command (inside the venv):
```bash
pip install scikit-learn pandas numpy pymongo joblib fastapi uvicorn
```

## 3) ⚙️ Required Environment Variables
- backend/.env
  - STRIPE_SECRET_KEY=
  - STRIPE_WEBHOOK_SECRET=
  - OPENAI_API_KEY=
  - MONGODB_URI=
  - MONGODB_DB=
- frontend/.env
  - VITE_API_BASE=http://localhost:5000

## 4) 🚀 How To Run
You must run 5 services.
### Option 1 — Recommended (Dev Script)
From project root:
``` bash
.\pipeline-draft\start-dev.ps1`
```
To stop everything:
``` bash
.\pipeline-draft\stop-dev.ps1
```

### Option 2 — Manual Startup
1️⃣ Backend API
``` bash
cd pipeline-draft/backend
node server.js
```
Expected:
- Backend running on port **5000**

2️⃣ Worker
``` bash
cd pipeline-draft/backend
node worker.js
```
Expected:
- Worker watched MongoDB for new transactions
- Worker claims transactions, runs rule scoring (velocity checks etc), calls ML scoring, calls GPT summaries, and writes results back to Mongo.

3️⃣ Stripe Webhook Forwarder
``` bash
stripe listen --forward-to http://localhost:5000/webhook
```
- Copy the `whsec_...` value Stripe prints
- Set that as:
  - `STRIPE_WEBHOOK_SECRET=whsec_...`

4️⃣ ML Service
Activate virtual environment: <br>
`C:\Users\bryso\ml-env\.venv\Scripts\Activate.ps1`
<br> Then:
```bash
cd pipeline-draft/ml
uvicorn score_service:app --host 0.0.0.0 --port 8000
```
Expected:
- ML service running on port **8000**

5️⃣ Frontend
```bash
cd pipeline-draft/frontend
npm run dev
```
Expected: 
- Frontend runs on Vite default:
  - `http://localhost:5173/`

## 5) 🧪 How To Test End-to-End
1️⃣ **Trigger Stripe Event** <br>
stripe trigger payment_intent.succeeded <br>
**or** create a test payment via Stripe dashboard. <br>

2️⃣ **Observe Backend Logs** <br>
You should see: <br>
`Received event: payment_intent.succeeded` <br>

3️⃣ **Observe Worker Logs** <br>
You should see: <br>
- Internal risk scoring
- ML scoring
- GPT summary generation

4️⃣ **Open Dashboard** <br>
```bash
http://localhost:5173
```
You should see:
- New transaction
- Risk scores
- ML probability
- GPT summary

## 6) Troubleshooting
If Stripe events are not showing up:
- Confirm `stripe listen` is running
- Confirm backend is listening on `/webhook`
- Confirm `STRIPE_WEBHOOK_SECRET` matches the `whsec_...` from Stripe CLI

If worker isn’t updating transactions:
- Confirm `MONGODB_URI` + `MONGODB_DB`
- Confirm worker can reach ML service (`MODEL_SCORE_URL`)
- Check worker logs for errors

If dashboard is blank:
- Confirm backend API is running
- Confirm frontend `.env` has `VITE_API_BASE=http://localhost:5000`

## 7) 🧠 Decision Logic
Final decision is computed from:
- Stripe risk score
- Internal rule score
- ML probability
- Dispute status

**Examples:**
- fraud_confirmed
- high_risk
- manual_review
- approved
- declined

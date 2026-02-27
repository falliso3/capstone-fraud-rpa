# pages-api

Minimal API service for a GitHub Pages frontend.

This service keeps MongoDB access on the server side and exposes the same transaction
endpoints your frontend already uses:

- `GET /api/transactions?limit=50`
- `GET /api/transactions/:id`
- `POST /api/transactions/:id/queue-summary`
- `POST /api/transactions/:id/summarize`

It also includes a worker process that performs:

- Internal risk scoring
- Optional ML scoring via `MODEL_SCORE_URL`
- GPT summary generation for queued transactions

## Why this exists

GitHub Pages can only host static files. It cannot run Node/Express or connect to MongoDB
directly. Deploy this folder on a backend host, then point frontend API calls to it.

## Local run

1. Copy `.env.example` to `.env` and set values.
2. Install deps: `npm install`
3. Start API: `npm run dev`
4. Start worker (separate terminal): `npm run worker`

## Deploy

Deploy this folder as its own service (Render/Railway/Fly/Azure/etc.) and set env vars:

- `MONGODB_URI`
- `MONGODB_DB`
- `CORS_ORIGINS` (comma-separated origins allowed to call this API)
- `OPENAI_API_KEY` (required by worker for summaries)
- `MODEL_SCORE_URL` (optional; defaults to `http://localhost:8000/score`)

Run both processes in deployment:

- API process: `npm run start`
- Worker process: `npm run worker`

Then set your frontend env:

- `VITE_API_BASE=https://your-api-domain`

Rebuild/redeploy the GitHub Pages frontend after setting `VITE_API_BASE`.

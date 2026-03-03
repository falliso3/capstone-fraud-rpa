# Frontend

This folder now supports deploying the dashboard directly to Vercel.

## Local development

Install dependencies:

```bash
npm install
```

Run the Vite dev server:

```bash
npm run dev
```

For local development, point the frontend at your existing local API:

```bash
VITE_API_BASE=http://localhost:5000
```

## Vercel deployment

Deploy this `frontend/` folder as the Vercel project root.

Required Vercel environment variables:

- `MONGODB_URI`
- `MONGODB_DB`

Optional:

- `VITE_API_BASE`

If `VITE_API_BASE` is not set, the frontend uses the same Vercel deployment origin and calls the built-in serverless API at `/api/...`.

The Vercel API supports:

- `GET /api/transactions?limit=50`
- `GET /api/transactions/:id`
- `POST /api/transactions/:id/queue-summary`
- `POST /api/transactions/:id/summarize`

## Important limitation

This Vercel setup only replaces the read/write dashboard API. It does not run your long-lived Stripe webhook listener or background worker.

If you still need automated Stripe ingestion, ML scoring, or GPT summary generation, keep `backend/` and `worker.js` on a separate always-on host.

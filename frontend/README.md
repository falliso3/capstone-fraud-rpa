# Frontend

This folder supports the dashboard UI, and the repository root now supports direct Vercel deployment.

## Local development

Install dependencies:

```bash
npm install
```

Run the Vite dev server:

```bash
npm run dev
```

The local Vite dev server proxies `/api/...` requests to `http://localhost:5000` by default.
That means you can run the API locally on port `5000` without setting `VITE_API_BASE`.

For local development, point the frontend at your existing local API:

```bash
VITE_API_BASE=http://localhost:5000
```

## Vercel deployment

Recommended: deploy the repository root as the Vercel project root.

The root `vercel.json` builds `frontend/` and serves the root-level `api/` serverless function automatically.

If you prefer, you can still deploy just this `frontend/` folder as its own Vercel project.

Required Vercel environment variables:

- `MONGODB_URI`
- `MONGODB_DB`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Optional:

- `VITE_API_BASE`
- `AUTO_GENERATE_SUMMARY_ON_WEBHOOK=true`

If `VITE_API_BASE` is not set, the frontend uses the same Vercel deployment origin and calls the built-in serverless API at `/api/...`.

The Vercel API supports:

- `GET /api/transactions?limit=50`
- `GET /api/transactions/:id`
- `POST /api/transactions/:id/queue-summary`
- `POST /api/transactions/:id/summarize`
- `POST /api/stripe/webhook`

`POST /api/transactions/:id/summarize` now generates a GPT summary immediately and stores it back into MongoDB.
`POST /api/stripe/webhook` verifies Stripe signatures, stores raw events, and updates the `transactions` collection.

If `AUTO_GENERATE_SUMMARY_ON_WEBHOOK=true`, qualifying Stripe webhook events also generate a GPT summary immediately after the transaction record is updated.

## Important limitation

This Vercel setup only replaces the dashboard API. It does not run your long-lived Stripe webhook listener or background worker.

If you still need automated Stripe ingestion, ML scoring, or GPT summary generation, keep `backend/` and `worker.js` on a separate always-on host.

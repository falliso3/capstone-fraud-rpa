# pages-api

Minimal API service for a GitHub Pages frontend.

This service keeps MongoDB access on the server side and exposes the same transaction
endpoints your frontend already uses:

- `GET /api/transactions?limit=50`
- `GET /api/transactions/:id`
- `POST /api/transactions/:id/queue-summary`
- `POST /api/transactions/:id/summarize`

## Why this exists

GitHub Pages can only host static files. It cannot run Node/Express or connect to MongoDB
directly. Deploy this folder on a backend host, then point frontend API calls to it.

## Local run

1. Copy `.env.example` to `.env` and set values.
2. Install deps: `npm install`
3. Start: `npm run dev`

## Deploy

Deploy this folder as its own service (Render/Railway/Fly/Azure/etc.) and set env vars:

- `MONGODB_URI`
- `MONGODB_DB`
- `CORS_ORIGINS` (comma-separated origins allowed to call this API)

Then set your frontend env:

- `VITE_API_BASE=https://your-api-domain`

Rebuild/redeploy the GitHub Pages frontend after setting `VITE_API_BASE`.

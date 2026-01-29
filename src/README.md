# Frontend

## Environment Variables

The frontend uses an environment variable to determine the backend API base URL.

### Vite
Set this variable when running locally or in deployment:

VITE_API_BASE_URL=http://localhost:8000

If not set, the frontend defaults to `http://localhost:8000`.

## Admin Dashboard Smoke Test
1. Start backend: docker compose up --build
2. Confirm backend: GET /healthz returns {"status":"ok"}
3. Confirm report: GET /reports/latest returns metrics + confusion_matrix
4. Open frontend /admin
5. Verify:
   - Loading state appears briefly
   - If runs exist: report card renders
   - Clicking View shows:
     - Accuracy/Precision/Recall/F1 values (or N/A if backend returns null)
     - Confusion matrix is 3x3 and matches backend JSON


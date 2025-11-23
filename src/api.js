// Small helper module to talk to the FastAPI backend.
// It knows the base URL and how to handle errors.

// Use an environment variable if defined; otherwise default to local dev.
const API_BASE =
  process.env.REACT_APP_API_BASE || "http://localhost:8000";

/**
 * Fetch the latest fraud run summary from the backend.
 *
 * Returns:
 *   - an object with run_id, started_at, metrics, etc. if successful
 *   - null if the backend returns 404 "No runs found"
 * Throws:
 *   - an Error for any other HTTP status or network failure
 */
export async function fetchLatestRun() {
  const response = await fetch(`${API_BASE}/reports/latest`);

  if (response.status === 404) {
    // No runs yet – treat this as "empty state" in the UI
    return null;
  }

  if (!response.ok) {
    // Any other non-200 status is treated as an error
    throw new Error(`Backend error: ${response.status}`);
  }

  // Parse JSON body and return it
  const data = await response.json();
  return data;
}

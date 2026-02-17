// Small helper module to talk to the backend API.
// Centralizes base URL + consistent error handling.

// Prefer Vite env var if present, otherwise CRA env var, otherwise localhost.
const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_BASE) ||
  "/api/";

/**
 * Fetch the latest fraud run summary from the backend.
 *
 * Returns:
 *   - an object with run_id, started_at, finished_at, status, metrics, confusion_matrix, etc. if successful
 *   - null if the backend returns 404 (meaning "no runs found yet")
 *
 * Throws:
 *   - an Error for any other HTTP status or network failure
 */
export async function fetchLatestRun() {
  let response;

  try {
    response = await fetch(`${API_BASE}/reports/latest`);
  } catch (err) {
    // Network failure (backend down, CORS issue, etc.)
    throw new Error(`Network error calling ${API_BASE}/reports/latest`);
  }

  if (response.status === 404) {
    // No runs yet — treat this as "empty state" in the UI
    return null;
  }

  if (!response.ok) {
    // Any other non-200 status is an error
    const text = await response.text().catch(() => "");
    throw new Error(
      `Backend error ${response.status} on /reports/latest: ${text}`
    );
  }

  // Parse JSON and return it
  const data = await response.json();
  return data;
}

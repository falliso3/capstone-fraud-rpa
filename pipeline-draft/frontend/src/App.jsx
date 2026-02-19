import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

const money = (amount, currency) => {
  if (typeof amount !== "number") return "-";
  const cur = (currency || "usd").toUpperCase();
  return `${(amount / 100).toFixed(2)} ${cur}`;
};

const fmtTime = (v) => {
  if (!v) return "-";
  if (typeof v === "number") return new Date(v * 1000).toLocaleString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};

function Badge({ text }) {
  if (!text) return null;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        border: "1px solid #333",
        background: "#111",
        color: "#ddd",
        marginRight: 6,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ border: "1px solid #222", borderRadius: 10, padding: 12, background: "#0b0b0b" }}>
      <div style={{ fontSize: 13, color: "#bbb", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function KeyValue({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "4px 0", borderBottom: "1px solid #111" }}>
      <div style={{ width: 170, color: "#888" }}>{label}</div>
      <div style={{ color: "#ddd", wordBreak: "break-word" }}>{value ?? "-"}</div>
    </div>
  );
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [limit, setLimit] = useState(50);
  const [q, setQ] = useState("");
  const [onlyNeedsSummary, setOnlyNeedsSummary] = useState(false);

  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const selected = useMemo(
    () => rows.find((r) => r._id === selectedId) || null,
    [rows, selectedId]
  );

  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  };

  const fetchRows = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/transactions?limit=${encodeURIComponent(limit)}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      if (!selectedId && Array.isArray(data) && data[0]?._id) setSelectedId(data[0]._id);
    } catch (e) {
      setError(e.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    const t = setInterval(fetchRows, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyNeedsSummary && !r.summary_needed) return false;
      if (!term) return true;

      const hay = [
        r._id,
        r.payment_intent,
        r.latest_charge,
        r.last_event_type,
        r.status,
        r.decision,
        r.card?.brand,
        r.card?.last4,
        r.risk?.level,
        r.internalRisk?.label,
        r.summary,
        r.ml?.model_version,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(term);
    });
  }, [rows, q, onlyNeedsSummary]);

  const queueSummary = async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`${API_BASE}/api/transactions/${encodeURIComponent(id)}/queue-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.error || `Queue failed (${res.status})`);
      showToast("Queued summary");
      fetchRows();
    } catch (e) {
      showToast(e.message || "Queue failed");
    }
  };

  const grid = {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr",
    gap: 14,
    padding: 14,
    height: "100vh",
    boxSizing: "border-box",
    background: "#000",
    color: "#fff",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
  };

  return (
    <div style={grid}>
      {/* LEFT */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Fraud Ops Dashboard</div>
          <div style={{ color: "#888", fontSize: 12 }}>
            Stripe + internal rules + ML + GPT summaries
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search (id, last4, decision, summary...)"
            style={{
              flex: "1 1 260px",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #222",
              background: "#0b0b0b",
              color: "#fff",
              outline: "none",
            }}
          />

          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#bbb", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={onlyNeedsSummary}
              onChange={(e) => setOnlyNeedsSummary(e.target.checked)}
            />
            summary_needed
          </label>

          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #222",
              background: "#0b0b0b",
              color: "#fff",
              outline: "none",
            }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>

          <button
            onClick={fetchRows}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #222",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div style={{ padding: 10, border: "1px solid #3a1b1b", background: "#120707", borderRadius: 10, color: "#ffb4b0" }}>
            {error}
          </div>
        ) : null}

        <div style={{ flex: 1, overflow: "auto", border: "1px solid #111", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ position: "sticky", top: 0, background: "#050505", zIndex: 1 }}>
              <tr>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #111" }}>ID</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #111" }}>Amount</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #111" }}>Status</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #111" }}>Decision</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #111" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isSel = r._id === selectedId;
                return (
                  <tr
                    key={r._id}
                    onClick={() => setSelectedId(r._id)}
                    style={{
                      cursor: "pointer",
                      background: isSel ? "#0b1220" : "transparent",
                      borderBottom: "1px solid #0b0b0b",
                    }}
                  >
                    <td style={{ padding: 10, color: "#ddd", maxWidth: 280 }}>
                      <div style={{ fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r._id}
                      </div>
                      <div style={{ color: "#777", fontSize: 12 }}>
                        {r.card?.brand ? `${r.card.brand.toUpperCase()} •••• ${r.card.last4 || "----"}` : "—"}
                        {"  "}·{"  "}
                        {r.last_event_type || "—"}
                      </div>
                    </td>
                    <td style={{ padding: 10 }}>{money(r.amount, r.currency)}</td>
                    <td style={{ padding: 10 }}>
                      <Badge text={r.status || "unknown"} />
                      {r.summary_needed ? <Badge text="summary_needed" /> : null}
                      {r.summary_in_progress ? <Badge text="summary_in_progress" /> : null}
                    </td>
                    <td style={{ padding: 10 }}>
                      <Badge text={r.decision || "unknown"} />
                    </td>
                    <td style={{ padding: 10, color: "#aaa" }}>{fmtTime(r.updatedAt)}</td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, color: "#777" }}>
                    No matching transactions.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selected ? selected._id : "Select a transaction"}
            </div>
            <div style={{ color: "#777", fontSize: 12 }}>
              Created: {selected ? fmtTime(selected.created) : "-"} · Last event: {selected?.last_event_type || "-"}
            </div>
          </div>

          <button
            disabled={!selected?._id}
            onClick={() => queueSummary(selected?._id)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #222",
              background: "#111",
              color: "#fff",
              cursor: selected?._id ? "pointer" : "not-allowed",
              opacity: selected?._id ? 1 : 0.6,
            }}
            title="Sets summary_needed=true; worker will generate GPT summary"
          >
            Queue Summary
          </button>
        </div>

        {toast ? (
          <div style={{ marginBottom: 10, padding: 10, border: "1px solid #222", background: "#0b0b0b", borderRadius: 10, color: "#ddd" }}>
            {toast}
          </div>
        ) : null}

        {!selected ? (
          <div style={{ color: "#777" }}>Click a row on the left.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
            <Section title="Quick Facts">
              <KeyValue label="Amount" value={money(selected.amount, selected.currency)} />
              <KeyValue label="Status" value={selected.status} />
              <KeyValue label="Decision" value={selected.decision} />
              <KeyValue label="Payment Intent" value={selected.payment_intent || selected._id} />
              <KeyValue label="Latest charge" value={selected.latest_charge || "-"} />
              <KeyValue label="Stripe risk" value={`${selected.risk?.level || "-"} ${typeof selected.risk?.score === "number" ? `(${selected.risk.score})` : ""}`} />
              <KeyValue label="Internal risk" value={`${selected.internalRisk?.label || "-"} ${typeof selected.internalRisk?.score === "number" ? `(${selected.internalRisk.score})` : ""}`} />
              <KeyValue label="ML prob_fraud" value={typeof selected.ml?.prob_fraud === "number" ? String(selected.ml.prob_fraud) : "-"} />
              <KeyValue label="ML model" value={selected.ml?.model_version || "-"} />
            </Section>

            <Section title="Summary (GPT)">
              <div style={{ color: selected.summary ? "#ddd" : "#777", whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                {selected.summary || "No summary yet. Click “Queue Summary” or wait for worker."}
              </div>
              <div style={{ marginTop: 8, color: "#777", fontSize: 12 }}>
                Model: {selected.summary_model || "-"} · Updated: {fmtTime(selected.summary_updatedAt)}
              </div>
            </Section>

            <Section title="Raw Document (JSON)">
              <pre style={{ margin: 0, color: "#ddd", fontSize: 12, overflowX: "auto" }}>
                {JSON.stringify(selected, null, 2)}
              </pre>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

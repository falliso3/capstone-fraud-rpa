import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

const money = (amount, currency) => {
  if (typeof amount !== "number") return "-";
  const cur = (currency || "usd").toUpperCase();
  return `${(amount / 100).toFixed(2)} ${cur}`;
};

const fmtTime = (value) => {
  if (!value) return "-";
  if (typeof value === "number") return new Date(value * 1000).toLocaleString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const compactId = (value) => {
  if (!value) return "Unknown";
  const str = String(value);
  if (str.length <= 22) return str;
  return `${str.slice(0, 12)}...${str.slice(-6)}`;
};

const formatProbability = (value) => {
  if (typeof value !== "number") return "-";
  return `${(value * 100).toFixed(1)}%`;
};

function toneFromValue(value) {
  const normalized = String(value || "").toLowerCase();

  if (
    normalized.includes("fraud") ||
    normalized.includes("high") ||
    normalized.includes("failed") ||
    normalized.includes("declined")
  ) {
    return "danger";
  }

  if (
    normalized.includes("review") ||
    normalized.includes("disputed") ||
    normalized.includes("pending") ||
    normalized.includes("medium")
  ) {
    return "warn";
  }

  if (
    normalized.includes("approved") ||
    normalized.includes("succeeded") ||
    normalized.includes("low")
  ) {
    return "success";
  }

  return "neutral";
}

function Badge({ text, tone }) {
  if (!text) return null;

  return (
    <span className={`badge badge--${tone || toneFromValue(text)}`}>
      {text}
    </span>
  );
}

function MetricCard({ label, value, accent }) {
  return (
    <div className={`metric-card metric-card--${accent || "neutral"}`}>
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-row__label">{label}</span>
      <span className="detail-row__value">{value ?? "-"}</span>
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h3 className="panel__title">{title}</h3>
          {subtitle ? <p className="panel__subtitle">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(50);
  const [query, setQuery] = useState("");
  const [onlyNeedsSummary, setOnlyNeedsSummary] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const selected = useMemo(
    () => rows.find((row) => row._id === selectedId) || null,
    [rows, selectedId]
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (onlyNeedsSummary && !row.summary_needed) return false;
      if (!term) return true;

      const haystack = [
        row._id,
        row.payment_intent,
        row.latest_charge,
        row.last_event_type,
        row.status,
        row.decision,
        row.card?.brand,
        row.card?.last4,
        row.risk?.level,
        row.internalRisk?.label,
        row.summary,
        row.ml?.model_version,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [rows, query, onlyNeedsSummary]);

  const showToast = (message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  const fetchRows = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/transactions?limit=${encodeURIComponent(limit)}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);

      const data = await res.json();
      const nextRows = Array.isArray(data) ? data : [];

      setRows(nextRows);

      if (nextRows.length === 0) {
        setSelectedId(null);
      } else if (!nextRows.some((row) => row._id === selectedId)) {
        setSelectedId(nextRows[0]._id);
      }
    } catch (e) {
      setError(e.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async (id) => {
    if (!id) return;

    try {
      const res = await fetch(`${API_BASE}/api/transactions/${encodeURIComponent(id)}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.error || `Summary failed (${res.status})`);

      showToast("Summary generated");
      fetchRows();
    } catch (e) {
      showToast(e.message || "Summary failed");
    }
  };

  useEffect(() => {
    fetchRows();
    const timer = setInterval(fetchRows, 5000);

    return () => {
      clearInterval(timer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const totalVolume = useMemo(
    () =>
      filtered.reduce(
        (sum, row) => sum + (typeof row.amount === "number" ? row.amount : 0),
        0
      ),
    [filtered]
  );

  const reviewCount = useMemo(
    () =>
      filtered.filter((row) => {
        const decision = String(row.decision || "").toLowerCase();
        return (
          row.summary_needed ||
          decision.includes("review") ||
          decision.includes("high_risk") ||
          decision.includes("disputed")
        );
      }).length,
    [filtered]
  );

  return (
    <div className="app-shell">
      <div className="app-shell__glow app-shell__glow--left" />
      <div className="app-shell__glow app-shell__glow--right" />

      <div className="dashboard">
        <header className="hero">
          <div className="hero__content">
            <p className="hero__eyebrow">Fraud Intelligence Console</p>
            <h1 className="hero__title">Live transaction triage with Stripe, ML, and GPT context.</h1>
            <p className="hero__copy">
              Monitor the queue, spot outliers fast, and generate analyst-ready summaries without
              leaving the review surface.
            </p>
          </div>

          <div className="hero__metrics">
            <MetricCard label="Visible Transactions" value={String(filtered.length)} accent="ice" />
            <MetricCard label="Needs Review" value={String(reviewCount)} accent="amber" />
            <MetricCard label="Visible Volume" value={money(totalVolume, "usd")} accent="mint" />
          </div>
        </header>

        <main className="dashboard__grid">
          <section className="workspace workspace--list">
            <div className="toolbar">
              <label className="control control--search">
                <span className="control__label">Search</span>
                <input
                  className="control__input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ID, card, decision, model version..."
                />
              </label>

              <label className="toggle">
                <input
                  type="checkbox"
                  checked={onlyNeedsSummary}
                  onChange={(e) => setOnlyNeedsSummary(e.target.checked)}
                />
                <span>Only flagged</span>
              </label>

              <label className="control control--compact">
                <span className="control__label">Rows</span>
                <select
                  className="control__select"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </label>

              <button className="button button--secondary" onClick={fetchRows}>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {error ? <div className="notice notice--error">{error}</div> : null}

            <div className="transaction-list">
              <div className="transaction-list__header">
                <span>Transaction</span>
                <span>Risk State</span>
                <span>Updated</span>
              </div>

              <div className="transaction-list__body">
                {filtered.map((row, index) => {
                  const active = row._id === selectedId;

                  return (
                    <button
                      key={row._id}
                      type="button"
                      className={`transaction-row${active ? " transaction-row--active" : ""}`}
                      onClick={() => setSelectedId(row._id)}
                      style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
                    >
                      <div className="transaction-row__main">
                        <div className="transaction-row__topline">
                          <strong>{compactId(row._id)}</strong>
                          <span>{money(row.amount, row.currency)}</span>
                        </div>

                        <div className="transaction-row__meta">
                          <span>
                            {row.card?.brand
                              ? `${row.card.brand.toUpperCase()} •••• ${row.card.last4 || "----"}`
                              : "Card unavailable"}
                          </span>
                          <span>{row.last_event_type || "No event type"}</span>
                        </div>
                      </div>

                      <div className="transaction-row__signals">
                        <div className="transaction-row__badges">
                          <Badge text={row.status || "unknown"} />
                          <Badge text={row.decision || "unknown"} />
                          {row.summary_needed ? <Badge text="summary_needed" tone="warn" /> : null}
                          {row.summary_in_progress ? (
                            <Badge text="summary_in_progress" tone="neutral" />
                          ) : null}
                        </div>
                      </div>

                      <div className="transaction-row__time">{fmtTime(row.updatedAt)}</div>
                    </button>
                  );
                })}

                {!loading && filtered.length === 0 ? (
                  <div className="transaction-list__empty">No matching transactions.</div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="workspace workspace--detail">
            <div className="detail-header">
              <div>
                <p className="detail-header__eyebrow">Selected Transaction</p>
                <h2 className="detail-header__title">
                  {selected ? compactId(selected._id) : "Pick a transaction"}
                </h2>
                <p className="detail-header__meta">
                  Created: {selected ? fmtTime(selected.created) : "-"} • Last event:{" "}
                  {selected?.last_event_type || "-"}
                </p>
              </div>

              <button
                className="button button--primary"
                disabled={!selected?._id}
                onClick={() => generateSummary(selected?._id)}
                title="Generates a GPT summary immediately using the deployed API"
              >
                Generate Summary
              </button>
            </div>

            {toast ? <div className="notice">{toast}</div> : null}

            {!selected ? (
              <div className="empty-state">
                <p className="empty-state__title">No transaction selected</p>
                <p className="empty-state__copy">
                  Choose a record from the left rail to inspect raw payment signals and analyst
                  notes.
                </p>
              </div>
            ) : (
              <div className="detail-stack">
                <div className="metric-strip">
                  <MetricCard
                    label="Decision"
                    value={selected.decision || "unknown"}
                    accent={toneFromValue(selected.decision)}
                  />
                  <MetricCard
                    label="Stripe Risk"
                    value={
                      typeof selected.risk?.score === "number"
                        ? `${selected.risk?.level || "unknown"} (${selected.risk.score})`
                        : selected.risk?.level || "-"
                    }
                    accent={toneFromValue(selected.risk?.level)}
                  />
                  <MetricCard
                    label="ML Probability"
                    value={formatProbability(selected.ml?.prob_fraud)}
                    accent={
                      typeof selected.ml?.prob_fraud === "number" && selected.ml.prob_fraud >= 0.7
                        ? "danger"
                        : typeof selected.ml?.prob_fraud === "number" &&
                            selected.ml.prob_fraud >= 0.3
                          ? "amber"
                          : "mint"
                    }
                  />
                </div>

                <Panel title="Quick Facts" subtitle="Core payment and model signals">
                  <div className="detail-grid">
                    <DetailRow label="Amount" value={money(selected.amount, selected.currency)} />
                    <DetailRow label="Status" value={selected.status || "-"} />
                    <DetailRow label="Payment Intent" value={selected.payment_intent || selected._id} />
                    <DetailRow label="Latest Charge" value={selected.latest_charge || "-"} />
                    <DetailRow
                      label="Internal Risk"
                      value={
                        typeof selected.internalRisk?.score === "number"
                          ? `${selected.internalRisk?.label || "-"} (${selected.internalRisk.score})`
                          : selected.internalRisk?.label || "-"
                      }
                    />
                    <DetailRow label="ML Model" value={selected.ml?.model_version || "-"} />
                  </div>
                </Panel>

                <Panel title="Analyst Summary" subtitle="Live GPT-generated narrative">
                  <div className={`summary-box${selected.summary ? "" : " summary-box--empty"}`}>
                    {selected.summary || "No summary yet. Generate one to create an analyst note."}
                  </div>
                  <p className="summary-meta">
                    Model: {selected.summary_model || "-"} • Updated:{" "}
                    {fmtTime(selected.summary_updatedAt)}
                  </p>
                </Panel>

                <Panel title="Raw Payload" subtitle="Full transaction projection from MongoDB">
                  <pre className="json-view">{JSON.stringify(selected, null, 2)}</pre>
                </Panel>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

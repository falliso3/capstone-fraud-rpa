import React, { useState, useRef } from "react";
import "./FraudCSVAnalyzer.css";

export default function FraudCsvAnalyzer() {
  const [rawCsv, setRawCsv] = useState("");
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [threshold, setThreshold] = useState(1000);
  const [duplicateTolerance, setDuplicateTolerance] = useState(2);
  const [summary, setSummary] = useState(null);
  const fileInputRef = useRef(null);

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((r) => r.trim() !== "");
    if (lines.length === 0) return { headers: [], data: [] };
    const headers = lines[0].split(",");
    const data = lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj = {};
      headers.forEach((h, i) => (obj[h] = vals[i]));
      return obj;
    });
    return { headers, data };
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      setRawCsv(text);
      const { headers, data } = parseCSV(text);
      setHeaders(headers);
      setRows(data);
      runHeuristics(headers, data);
    };
    reader.readAsText(file);
  }

  function guessKey(headers, candidates) {
    const lower = headers.map((h) => h.toLowerCase());
    for (const c of candidates) {
      const idx = lower.findIndex((h) => h.includes(c));
      if (idx >= 0) return headers[idx];
    }
    return null;
  }

  function runHeuristics(headers, data) {
    const amountKey = guessKey(headers, ["amount", "amt", "transaction_amount"]);
    const dateKey = guessKey(headers, ["date", "transaction_date"]);
    const descKey = guessKey(headers, ["description", "memo", "details"]);

    const flaggedIndices = new Set();
    data.forEach((r, i) => {
      const amt = parseFloat((r[amountKey] || "").replace(/[^0-9.-]/g, ""));
      if (!isNaN(amt) && Math.abs(amt) >= threshold) flaggedIndices.add(i);

      const desc = (r[descKey] || "").toLowerCase();
      const badWords = ["fraud", "dispute", "chargeback", "unknown"];
      if (badWords.some((w) => desc.includes(w))) flaggedIndices.add(i);
    });

    const flaggedList = Array.from(flaggedIndices).map((i) => ({ index: i, row: data[i] }));
    setFlagged(flaggedList);
    setSummary({ total: data.length, flagged: flaggedList.length, amountKey, dateKey, descKey });
  }

  function downloadFlagged() {
    if (!flagged.length) return;
    const hdr = headers.join(",") + "\n";
    const lines = flagged.map((f) => headers.map((h) => f.row[h] || "").join(",")).join("\n");
    const blob = new Blob([hdr + lines], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flagged_transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clear() {
    setRawCsv("");
    setRows([]);
    setHeaders([]);
    setFlagged([]);
    setSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = null;
  }

  return (
    <div className="fraud-analyzer-container">
      <h2 className="fraud-analyzer-title">CSV Financial Fraud Detector</h2>
      <p className="fraud-analyzer-subtitle">Upload a CSV and run client-side heuristics to flag suspicious transactions.</p>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} />
        <button className="button-secondary" onClick={clear}>Clear</button>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <div className="summary-box">
          <label>Amount threshold: ${threshold}</label><br />
          <input type="range" min="0" max="50000" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </div>

        <div className="summary-box">
          <label>Duplicate tolerance</label><br />
          <input type="number" min="2" max="10" value={duplicateTolerance} onChange={(e) => setDuplicateTolerance(Number(e.target.value))} />
        </div>

        <div className="summary-box">
          <button className="button-primary" onClick={() => runHeuristics(headers, rows)}>Analyze</button>
          <button className="button-primary" style={{ marginLeft: "0.5rem", backgroundColor: "#16a34a" }} onClick={downloadFlagged}>Download flagged</button>
        </div>
      </div>

      {summary && (
        <div className="summary-box">
          <div>Total transactions: <strong>{summary.total}</strong></div>
          <div>Flagged: <strong>{summary.flagged}</strong></div>
          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Amount column: {summary.amountKey || 'none'}, Description: {summary.descKey || 'none'}</div>
        </div>
      )}

      <table className="fraud-analyzer-table">
        <thead>
          <tr>
            <th>#</th>
            {headers.map((h) => <th key={h}>{h}</th>)}
            <th>Flagged</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isFlag = flagged.some((f) => f.index === i);
            return (
              <tr key={i} className={isFlag ? 'flagged-row' : ''}>
                <td>{i + 1}</td>
                {headers.map((h) => <td key={h}>{r[h]}</td>)}
                <td className={isFlag ? 'flagged-cell' : ''}>{isFlag ? 'Yes' : '—'}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={headers.length + 2}>No data loaded</td></tr>}
        </tbody>
      </table>

      <div className="notes-section">
      </div>
    </div>
  );
}
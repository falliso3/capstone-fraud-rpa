import React, { useState, useRef } from "react";
import "./FraudCSVAnalyzer.css";

export default function FraudCsvAnalyzer() {
  // State variables
  const [rawCsv, setRawCsv] = useState("");
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [threshold, setThreshold] = useState(1000);
  const [duplicateTolerance, setDuplicateTolerance] = useState(2);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingMode, setProcessingMode] = useState("local"); // "local" or "uipath"
  const [uipathJobId, setUipathJobId] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  
  const fileInputRef = useRef(null);

  // Handle file upload
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      setRawCsv(text);
      setError(null);
    };
    reader.onerror = () => {
      setError("Failed to read file");
    };
    reader.readAsText(file);
  }

  // Analyze CSV using backend
  async function analyzeCSV() {
    if (!rawCsv) {
      setError("Please upload a CSV file first");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (processingMode === "local") {
        // Send to local backend processing
        const response = await fetch("http://localhost:5000/api/analyze-csv", { // TODO: dont specify localhost
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            csv: rawCsv,
            threshold,
            duplicateTolerance,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Analysis failed");
        }

        const result = await response.json();
        
        // Update state with results
        setHeaders(result.data.headers);
        setRows(result.data.rows);
        setFlagged(result.data.flaggedTransactions);
        setSummary({
          total: result.data.total,
          flagged: result.data.flagged,
          amountKey: result.data.columns.amount,
          descKey: result.data.columns.description,
        });

      } else {
        // Send to UiPath
        const response = await fetch("http://localhost:5000/api/uipath/start-job", { // TODO: dont specify localhost
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv: rawCsv }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to start UiPath job");
        }

        const result = await response.json();
        setUipathJobId(result.jobId);
        
        // Start polling for results
        startPolling(result.jobId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (processingMode === "local") {
        setLoading(false);
      }
    }
  }

  // Poll UiPath for results
  function startPolling(jobId) {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/uipath/get-result?jobId=${jobId}`);
        const result = await response.json();

        if (result.status === "completed") {
          // Process UiPath results
          clearInterval(interval);
          setPollingInterval(null);
          setLoading(false);
          
          // Transform UiPath output to match our format
          processUiPathResults(result.data);
        } else if (result.status === "failed") {
          clearInterval(interval);
          setPollingInterval(null);
          setLoading(false);
          setError(result.error || "UiPath job failed");
        }
        // If still processing, continue polling
      } catch (err) {
        clearInterval(interval);
        setPollingInterval(null);
        setLoading(false);
        setError("Error retrieving results: " + err.message);
      }
    }, 3000); // Poll every 3 seconds

    setPollingInterval(interval);
  }

  // Process UiPath results
  function processUiPathResults(uipathData) {
    // UiPath returns array of {transaction_id, risk_score, decision, explanation}
    // We need to match this back to our CSV rows
    
    if (!Array.isArray(uipathData)) {
      setError("Invalid UiPath response format");
      return;
    }

    // Parse our CSV to get rows
    const lines = rawCsv.split(/\r?\n/).filter((r) => r.trim() !== "");
    const headers = lines[0].split(",").map(h => h.trim());
    const data = lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj = {};
      headers.forEach((h, i) => (obj[h] = vals[i]));
      return obj;
    });

    // Match UiPath results to rows
    const flaggedList = [];
    uipathData.forEach((result, index) => {
      if (result.decision === "medium_risk" || result.decision === "high_risk") {
        flaggedList.push({
          index,
          row: data[index],
          reasons: [result.explanation],
          riskScore: result.risk_score,
          decision: result.decision,
        });
      }
    });

    setHeaders(headers);
    setRows(data);
    setFlagged(flaggedList);
    setSummary({
      total: data.length,
      flagged: flaggedList.length,
      mode: "UiPath AI Agent",
    });
  }

  // Download flagged transactions
  function downloadFlagged() {
    if (!flagged.length) return;

    const hdr = headers.join(",") + "\n";
    const lines = flagged
      .map((f) => headers.map((h) => f.row[h] || "").join(","))
      .join("\n");

    const blob = new Blob([hdr + lines], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flagged_transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Clear all data
  function clear() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setRawCsv("");
    setRows([]);
    setHeaders([]);
    setFlagged([]);
    setSummary(null);
    setError(null);
    setUipathJobId(null);
    if (fileInputRef.current) fileInputRef.current.value = null;
  }

  return (
    <div className="fraud-analyzer-container">
      <h2 className="fraud-analyzer-title">CSV Financial Fraud Detector</h2>
      <p className="fraud-analyzer-subtitle">
        Upload a CSV and run fraud detection analysis. Choose between local processing or UiPath AI agent.
      </p>

      {/* Error display */}
      {error && (
        <div style={{ 
          padding: "12px", 
          backgroundColor: "#fee", 
          color: "#c00", 
          borderRadius: "4px", 
          marginBottom: "16px" 
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* File upload */}
      <div className="file-input-group">
        <input 
          ref={fileInputRef} 
          type="file" 
          accept=".csv,text/csv" 
          onChange={handleFile}
          disabled={loading}
        />
        <button className="button-secondary ml-2" onClick={clear} disabled={loading}>
          Clear
        </button>
      </div>

      {/* Processing mode selector */}
      <div className="summary-inputs">
        <div className="summary-box">
          <label>Processing Mode:</label>
          <select 
            value={processingMode} 
            onChange={(e) => setProcessingMode(e.target.value)}
            disabled={loading}
            style={{ padding: "8px", marginTop: "8px", width: "100%" }}
          >
            <option value="local">Local Backend Processing</option>
            <option value="uipath">UiPath AI Agent</option>
          </select>
        </div>

        {processingMode === "local" && (
          <>
            <div className="summary-box">
              <label>Amount threshold: ${threshold}</label>
              <input
                type="range"
                min="0"
                max="50000"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                disabled={loading}
              />
            </div>

            <div className="summary-box">
              <label>Duplicate tolerance</label>
              <input
                type="number"
                min="2"
                max="10"
                value={duplicateTolerance}
                onChange={(e) => setDuplicateTolerance(Number(e.target.value))}
                disabled={loading}
              />
            </div>
          </>
        )}

        <div className="summary-box">
          <button 
            className="button-primary" 
            onClick={analyzeCSV}
            disabled={loading || !rawCsv}
          >
            {loading ? "Processing..." : "Analyze"}
          </button>
          <button 
            className="button-success ml-2" 
            onClick={downloadFlagged}
            disabled={flagged.length === 0}
          >
            Download flagged
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="summary-box">
          <div>Total transactions: <strong>{summary.total}</strong></div>
          <div>Flagged: <strong>{summary.flagged}</strong></div>
          {summary.mode && <div>Processed by: <strong>{summary.mode}</strong></div>}
          {summary.amountKey && (
            <div className="summary-note">
              Amount column: {summary.amountKey}, Description: {summary.descKey || "none"}
            </div>
          )}
        </div>
      )}

      {/* UiPath job status */}
      {uipathJobId && loading && (
        <div style={{ 
          padding: "12px", 
          backgroundColor: "#e3f2fd", 
          borderRadius: "4px", 
          marginBottom: "16px" 
        }}>
          <strong>UiPath Job ID:</strong> {uipathJobId}<br/>
          <em>Polling for results...</em>
        </div>
      )}

      {/* Results table */}
      <table className="fraud-analyzer-table">
        <thead>
          <tr>
            <th>#</th>
            {headers.map((h) => <th key={h}>{h}</th>)}
            <th>Flagged</th>
            {processingMode === "uipath" && <th>Risk Score</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const flagData = flagged.find((f) => f.index === i);
            const isFlag = !!flagData;
            return (
              <tr key={i} className={isFlag ? "flagged-row" : ""}>
                <td>{i + 1}</td>
                {headers.map((h) => <td key={h}>{r[h]}</td>)}
                <td className={isFlag ? "flagged-cell" : ""}>
                  {isFlag ? "Yes" : "—"}
                  {isFlag && flagData.reasons && (
                    <div style={{ fontSize: "0.85em", marginTop: "4px" }}>
                      {flagData.reasons.join("; ")}
                    </div>
                  )}
                </td>
                {processingMode === "uipath" && (
                  <td>{flagData?.riskScore?.toFixed(2) || "—"}</td>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length + (processingMode === "uipath" ? 3 : 2)}>
                No data loaded
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
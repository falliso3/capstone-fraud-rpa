import React, { useState, useRef } from "react";
import "./FraudCSVAnalyzer.css";

export default function FraudCsvAnalyzer() {
  //Define all state variables to be used in the page, including
  //rows, flagged items, user-defined parameters, and the CSV
  //file to be entered by the user.

  //CSV file
  const [rawCsv, setRawCsv] = useState("");
  //Parsed rows
  const [rows, setRows] = useState([]);
  //CSV headers
  const [headers, setHeaders] = useState([]);
  //List of flagged transactions/values
  const [flagged, setFlagged] = useState([]);
  //User-defined threshold
  const [threshold, setThreshold] = useState(1000);
  //Number of duplicates before considered suspicious
  const [duplicateTolerance, setDuplicateTolerance] = useState(2);
  //Summary at the bottom of the page
  const [summary, setSummary] = useState(null);
  //Reference to the file
  const fileInputRef = useRef(null);

  //Parses the CSV file, preparing it for reading/handling afterwards.
  //We use regular expressions to achieve this
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((r) => r.trim() !== "");
    if (lines.length === 0) return { headers: [], data: [] };

    //The first line contains headers, so we map remaining lines to
    //objects named after the headers
    const headers = lines[0].split(",");
    const data = lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj = {};
      headers.forEach((h, i) => (obj[h] = vals[i]));
      return obj;
    });
    return { headers, data };
  }

  //Read the file for fraudulent entries
  function handleFile(e) {
    //Receive uploaded file
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      //When the file is loaded, we read and analyze it
      const text = reader.result;
      setRawCsv(text);
      const { headers, data } = parseCSV(text);
      setHeaders(headers);
      setRows(data);

      //Run the fraud detection on the file
      runHeuristics(headers, data);
    };
    reader.readAsText(file);
  }

  //Helper function to guess the key CSV columns
  function guessKey(headers, candidates) {
    //Make everything lowercase for easy readability
    const lower = headers.map((h) => h.toLowerCase());
    //Iterate through
    for (const c of candidates) {
      const idx = lower.findIndex((h) => h.includes(c));
      if (idx >= 0) return headers[idx];
    }
    //Return null if no match was found
    return null;
  }

  //Test the data for fraudulent entries
  function runHeuristics(headers, data) {
    //These are automatically detected as key columns
    const amountKey = guessKey(headers, ["amount", "amt", "transaction_amount"]);
    const dateKey = guessKey(headers, ["date", "transaction_date"]);
    const descKey = guessKey(headers, ["description", "memo", "details"]);

    //Set to keep track of unique flagged row indeces
    const flaggedIndices = new Set();
    //For each numeric entry, convert to a float for comparison
    data.forEach((r, i) => {
      const amt = parseFloat((r[amountKey] || "").replace(/[^0-9.-]/g, ""));
      if (!isNaN(amt) && Math.abs(amt) >= threshold) flaggedIndices.add(i);

      //Items with "bad words" are immediately flagged for fraud
      const desc = (r[descKey] || "").toLowerCase();
      const badWords = ["fraud", "dispute", "chargeback", "unknown"];
      if (badWords.some((w) => desc.includes(w))) flaggedIndices.add(i);
    });

    //Update state with flagged transactions and a summary
    const flaggedList = Array.from(flaggedIndices).map((i) => ({ index: i, row: data[i] }));
    setFlagged(flaggedList);
    setSummary({ total: data.length, flagged: flaggedList.length, amountKey, dateKey, descKey });
  }

  function downloadFlagged() {
    if (!flagged.length) return;

    //Create the header line, add the flagged data
    const hdr = headers.join(",") + "\n";
    const lines = flagged.map((f) => headers.map((h) => f.row[h] || "").join(",")).join("\n");

    //Create a blob and have the user download it
    const blob = new Blob([hdr + lines], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flagged_transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  //Clear data
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
      <p className="fraud-analyzer-subtitle">
        Upload a CSV and run client-side heuristics to flag suspicious transactions.
      </p>

      <div className="file-input-group">
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} />
        <button className="button-secondary ml-2" onClick={clear}>
          Clear
        </button>
      </div>

      <div className="summary-inputs">
        <div className="summary-box">
          <label>Amount threshold: ${threshold}</label>
          <input
            type="range"
            min="0"
            max="50000"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
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
          />
        </div>

        <div className="summary-box">
          <button className="button-primary" onClick={() => runHeuristics(headers, rows)}>
            Analyze
          </button>
          <button className="button-success ml-2" onClick={downloadFlagged}>
            Download flagged
          </button>
        </div>
      </div>

      {summary && (
        <div className="summary-box">
          <div>Total transactions: <strong>{summary.total}</strong></div>
          <div>Flagged: <strong>{summary.flagged}</strong></div>
          <div className="summary-note">
            Amount column: {summary.amountKey || "none"}, Description: {summary.descKey || "none"}
          </div>
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
              <tr key={i} className={isFlag ? "flagged-row" : ""}>
                <td>{i + 1}</td>
                {headers.map((h) => <td key={h}>{r[h]}</td>)}
                <td className={isFlag ? "flagged-cell" : ""}>{isFlag ? "Yes" : "—"}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={headers.length + 2}>No data loaded</td></tr>}
        </tbody>
      </table>

      <div className="notes-section"></div>
    </div>
  );
}

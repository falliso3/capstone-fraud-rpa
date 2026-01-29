import React, { useState, useEffect } from "react";
import { fetchLatestRun } from "./api";
import "./AdminPage.css";

// Mock data for metric reports
const MOCK_REPORTS = [
  {
    id: 1,
    date: "2025-10-16",
    timestamp: "14:27:09 UTC",
    metrics: {
      accuracy: 46.15,
      precision: 57.9,
      recall: 46.15,
      "f1-score": 44.72,
    },
    confusionMatrix: [
      [18, 8, 2],
      [5, 15, 4],
      [3, 7, 20],
    ],
  },
  {
    id: 2,
    date: "2025-10-15",
    timestamp: "10:45:32 UTC",
    metrics: {
      accuracy: 48.5,
      precision: 59.2,
      recall: 48.5,
      "f1-score": 47.1,
    },
    confusionMatrix: [
      [20, 6, 2],
      [4, 17, 3],
      [2, 6, 22],
    ],
  },
  {
    id: 3,
    date: "2025-10-14",
    timestamp: "09:12:15 UTC",
    metrics: {
      accuracy: 45.8,
      precision: 56.3,
      recall: 45.8,
      "f1-score": 43.9,
    },
    confusionMatrix: [
      [16, 10, 2],
      [6, 14, 4],
      [4, 8, 18],
    ],
  },
];

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("reports");
  const [selectedReport, setSelectedReport] = useState(null);
  // State for the latest backend run
  const [latestRun, setLatestRun] = useState(null);    // JSON object from /reports/latest
  const [isLoadingRun, setIsLoadingRun] = useState(false);  // if were waiting for backend
  const [runError, setRunError] = useState(null);   // error message shown to UI

    // Call the backend to get the latest run summary
  async function loadLatestRun() {
    try {
      setIsLoadingRun(true);
      setRunError(null);

      const data = await fetchLatestRun();

      // data === null means backend returned 404 "No runs found"
      setLatestRun(data);
    } catch (err) {
      console.error("Failed to fetch latest run:", err);
      setRunError("Could not load latest run from the backend.");
    } finally {
      setIsLoadingRun(false);
    }
  }

    // When the Admin page first loads, fetch the latest run once.
    useEffect(() => {
      loadLatestRun();
    }, []);

  const handleRunReport = () => {
    alert("Report generation functionality is in progress!");
  };

  const handleViewReport = (report) => {
    setSelectedReport(report);
  };

  const handleBackToList = () => {
    setSelectedReport(null);
  };

  if (selectedReport) {
    return (
      <ReportDetail report={selectedReport} onBack={handleBackToList} />
    );
  }

  //Holds the various settings, as the name implies
  function SettingsPanel() {
    const [sensitivity, setSensitivity] = useState(0.5);
    const [autoReports, setAutoReports] = useState(true);
    const [reportFrequency, setReportFrequency] = useState("daily");
    const [threshold, setThreshold] = useState(0.7);
    const [savedMsg, setSavedMsg] = useState("");
  
    const handleSave = () => {
      setSavedMsg("Settings saved successfully!");
      setTimeout(() => setSavedMsg(""), 2500);
    };
  
    return (
      <div className="settings-section">
        <h2>System Settings</h2>
  
        <div className="setting-group">
          <label className="setting-label">Model Sensitivity</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={sensitivity}
            onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            className="setting-slider"
          />
          <span className="setting-value">{sensitivity.toFixed(2)}</span>
        </div>
  
        <div className="setting-group">
          <label className="setting-label">Fraud Threshold</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="setting-input"
          />
        </div>
  
        <div className="setting-group setting-toggle">
          <label className="setting-label">Auto-Generate Daily Reports</label>
          <label className="switch">
            <input
              type="checkbox"
              checked={autoReports}
              onChange={(e) => setAutoReports(e.target.checked)}
            />
            <span className="slider round"></span>
          </label>
        </div>
  
        <div className="setting-group">
          <label className="setting-label">Report Frequency</label>
          <select
            value={reportFrequency}
            onChange={(e) => setReportFrequency(e.target.value)}
            className="setting-select"
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
  
        <button className="btn-save-settings" onClick={handleSave}>
          Save Settings
        </button>
  
        {savedMsg && <p className="save-confirmation">{savedMsg}</p>}
      </div>
    );
  }
  
  // If the user has clicked “View” on a report, show the detailed view instead of the list.
  if (selectedReport) {
    return <ReportDetail report={selectedReport} onBack={handleBackToList} />;
  }

  // Decide what to show in the main report list:
  // - If we have backend data (latestRun), map it into the same shape the UI expects.
  // - If latestRun is null (404 from backend), show an empty list (UI will show "No reports available yet.")
  const reportsToShow = latestRun
    ? [
        {
          // Use run_id from backend so it's stable and unique
          id: latestRun.run_id,

          // These drive the "Generated at" header + list display
          date: new Date(latestRun.started_at).toISOString().slice(0, 10), // YYYY-MM-DD
          timestamp: new Date(
            latestRun.finished_at || latestRun.started_at
          ).toUTCString(),

          // Metrics now come directly from backend (you added these!)
          metrics: {
            accuracy: latestRun.metrics?.accuracy ?? null,
            precision: latestRun.metrics?.precision ?? null,
            recall: latestRun.metrics?.recall ?? null,
            "f1-score": latestRun.metrics?.["f1-score"] ?? null,

            // Keep these too if you want them available later (not required for UI right now)
            flag_rate_percent: latestRun.metrics?.flag_rate_percent ?? null,
            avg_score: latestRun.metrics?.avg_score ?? null,
          },

          // Confusion matrix now comes directly from backend
          confusionMatrix:
            latestRun.confusion_matrix ?? [
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ],

          // Optional fields if you want to keep for future UI
          status: latestRun.status,
          totalTransactions: latestRun.total_transactions,
          reportPath: latestRun.report_path,
        },
      ]
    : [];

  //Combines above functions to return fully assembled page
  return (
    <div className="admin-container">
      <h1 className="admin-title">Admin Dashboard</h1>

      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === "reports" ? "active" : ""}`}
          onClick={() => setActiveTab("reports")}
        >
          Metric Reports
        </button>
        <button
          className={`tab-button ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          Settings
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "reports" && (
          <div className="reports-section">
            <div className="reports-header">
              <h2>Metric Reports</h2>
              <button
                className="btn-run-report"
                onClick={handleRunReport}
              >
                + Run New Report
              </button>
            </div>

            {/* Show loading / error messages from backend */}
            {isLoadingRun && (
              <p className="loading-message">
                Loading latest run from backend...
              </p>
            )}
            {runError && (
              <p className="error-message">{runError}</p>
            )}

            {reportsToShow.length === 0 ? (
              <p className="no-data">No reports available yet.</p>
            ) : (
              <div className="reports-list">
                {reportsToShow.map((report) => (
                  <div key={report.id} className="report-card">
                    <div className="report-info">
                      <div className="report-datetime">
                        <span className="report-date">
                          {report.date}
                        </span>
                        <span className="report-time">
                          {report.timestamp}
                        </span>
                      </div>
                      <div className="report-metrics-preview">
                        <span className="metric-preview">
                          Accuracy:{" "}
                          {report.metrics.accuracy !== null &&
                          report.metrics.accuracy !== undefined
                            ? `${report.metrics.accuracy}%`
                            : "N/A"}
                        </span>
                        <span className="metric-preview">
                          F1-Score:{" "}
                          {report.metrics["f1-score"] !== null &&
                          report.metrics["f1-score"] !== undefined
                            ? `${report.metrics["f1-score"]}%`
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn-view"
                      onClick={() => handleViewReport(report)}
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
          {/*References above function. Placed there to make 
          this return section easier to read*/}
          {activeTab === "settings" && (
            <SettingsPanel />
          )}
      </div>
    </div>
  );
}

function ReportDetail({ report, onBack }) {
  const confusionLabels = ["No Fraud (0)", "Suspicious (1)", "Fraud (2)"];

  const cmMax = Math.max(...report.confusionMatrix.flat());

  const getConfusionColor = (value) => {
    if (cmMax === 0) return "rgb(255, 255, 255)";
    const intensity = value / cmMax;
    const r = Math.round(255 - (255 - 37) * intensity);
    const g = Math.round(255 - (255 - 99) * intensity);
    const b = Math.round(255 - (255 - 235) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div className="admin-container">
      <button className="btn-back" onClick={onBack}>
        ← Back to Reports
      </button>

      <div className="report-detail">
        <div className="report-header">
          <h1 className="report-title">Fraud Detection Metrics Report</h1>
          <p className="report-timestamp">
            Generated at: {report.date} {report.timestamp}
          </p>
        </div>

        <section className="metrics-section">
          <h2>Performance Metrics</h2>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Accuracy</div>
              <div className="metric-value">
                {report.metrics.accuracy !== null &&
                report.metrics.accuracy !== undefined
                  ? `${report.metrics.accuracy}%`
                  : "N/A"}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Precision</div>
              <div className="metric-value">
                {report.metrics.precision !== null &&
                report.metrics.precision !== undefined
                  ? `${report.metrics.precision}%`
                  : "N/A"}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Recall</div>
              <div className="metric-value">
                {report.metrics.recall !== null &&
                report.metrics.recall !== undefined
                  ? `${report.metrics.recall}%`
                  : "N/A"}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">F1-Score</div>
              <div className="metric-value">
                {report.metrics["f1-score"] !== null &&
                report.metrics["f1-score"] !== undefined
                  ? `${report.metrics["f1-score"]}%`
                  : "N/A"}
              </div>
            </div>
          </div>
        </section>

        <section className="confusion-section">
          <h2>Confusion Matrix</h2>
          <div className="confusion-container">
            <table className="confusion-matrix">
              <thead>
                <tr>
                  <th className="cm-corner">
                    <span className="cm-actual">Actual</span>
                    <span className="cm-pred">Predicted</span>
                  </th>
                  {confusionLabels.map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.confusionMatrix.map((row, i) => (
                  <tr key={i}>
                    <th>{confusionLabels[i]}</th>
                    {row.map((value, j) => (
                      <td
                        key={`${i}-${j}`}
                        style={{
                          backgroundColor: getConfusionColor(value),
                        }}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="cm-explanation">
              The confusion matrix shows how well the fraud detection algorithm classified transactions. 
              Each row is the <strong>actual</strong> value (0 = No Fraud, 1 = Suspicious, 2 = Fraud), 
              and each column is the <strong>predicted</strong> value. 
              Numbers indicate how many transactions fell into each actual/predicted combination. 
              Higher counts along the diagonal indicate correct predictions, 
              and the highest count in any cell is <strong>{cmMax}</strong>.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminDashboard;
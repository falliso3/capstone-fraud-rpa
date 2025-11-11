import React, { useState } from "react";
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

            {MOCK_REPORTS.length === 0 ? (
              <p className="no-data">No reports available yet.</p>
            ) : (
              <div className="reports-list">
                {MOCK_REPORTS.map((report) => (
                  <div key={report.id} className="report-card">
                    <div className="report-info">
                      <div className="report-datetime">
                        <span className="report-date">{report.date}</span>
                        <span className="report-time">{report.timestamp}</span>
                      </div>
                      <div className="report-metrics-preview">
                        <span className="metric-preview">
                          Accuracy: {report.metrics.accuracy}%
                        </span>
                        <span className="metric-preview">
                          F1-Score: {report.metrics["f1-score"]}%
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

        {activeTab === "settings" && (
          <div className="settings-section">
            <p>Settings content coming soon...</p>
          </div>
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
              <div className="metric-value">{report.metrics.accuracy}%</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Precision</div>
              <div className="metric-value">{report.metrics.precision}%</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Recall</div>
              <div className="metric-value">{report.metrics.recall}%</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">F1-Score</div>
              <div className="metric-value">{report.metrics["f1-score"]}%</div>
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

            <p class="cm-explanation">
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
// HelpPage.jsx
import React from "react";
import "./HelpPage.css";

//No logic on this page, and the HTML is pretty straightforward
export default function HelpPage() {
  return (
    <div className="help-container">
      <h2 className="help-title">Help & User Guide</h2>
      <p className="help-intro">
        Please reference this page if you encounter issues or difficulty 
        when using this tool.
      </p>

      <section className="help-section">
        <h3>1. Uploading Your CSV file</h3>
        <p>
          Click on the "Choose File” button on the main analyzer page and
          select a CSV file containing transaction data. The app will automatically parse
          the file and display its contents in a table.
        </p>
        <p>
          Make sure your CSV includes headers like Amount, Date,
          and Description for best results.
        </p>
      </section>

      <section className="help-section">
        <h3>2. Adjusting Analysis Settings</h3>
        <ul>
          <li>Amount Threshold: Transactions above this value are flagged as suspicious.</li>
          <li>Duplicate Tolerance: Helps detect repeated or duplicate transactions.</li>
        </ul>
      </section>

      <section className="help-section">
        <h3>3. Running the Analyzer</h3>
        <p>
          Click the "Analyze" button to run fraud detection heuristics.
          Flagged transactions will be highlighted in red in the table.
        </p>
      </section>

      <section className="help-section">
        <h3>4. Exporting Results</h3>
        <p>
          After analysis, click “Download Flagged” to save a new CSV
          containing only the suspicious transactions.
        </p>
      </section>

      <section className="help-section">
        <h3>5. Common Questions</h3>
        <p><strong>Q:</strong> What kinds of fraud does this detect?<br />
          <strong>A:</strong> The analyzer looks for large transactions, duplicate entries,
          and suspicious keywords like “fraud,” “chargeback,” or “dispute.”</p>
      </section>

      <section className="help-section">
        <h3>Tips and tricks</h3>
        <ul>
          <li>Try sorting your CSV columns before uploading for better readability.</li>
          <li>Flag thresholds can be adjusted dynamically without reuploading.</li>
          <li>All processing is client-side your data never leaves your device.</li>
        </ul>
      </section>
    </div>
  );
}

const express = require("express");
const app = express();
app.use(express.json());

const PORT = 3002;

// Import fraud context
const fraudContext = require("./FraudDetectionContext.json");

// Dummy risk scoring function
app.post("/evaluate", (req, res) => {
  const tx = req.body;

  const signals = {
    transaction_pattern: Math.min(1, tx.amount / (tx.user_baseline.avg_amount * 5)),
    device_location: tx.device_id !== tx.last_device ? 1 : 0,
    identity_risk: tx.identity_score ?? 0,
    merchant_risk: tx.merchant_risk_score ?? 0,
    behavioral: tx.behavioral_score ?? 0,
  };

  const risk_score = Object.entries(signals).reduce((sum, [k, v]) => {
    const weight = fraudContext.skills.find(s => s.id === k)?.weight ?? 0;
    return sum + v * weight;
  }, 0);

  const decision = risk_score < 0.3 ? "not_fraud" :
                   risk_score < 0.6 ? "low_risk" :
                   risk_score < 0.85 ? "medium_risk" :
                   "high_risk";

  res.json({ transaction_id: tx.transaction_id, risk_score, signals, decision });
});

app.listen(PORT, () => console.log(`Fraud API running on port ${PORT}`));

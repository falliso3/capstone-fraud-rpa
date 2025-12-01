// api/utils/fraudDetection.js
// Fraud detection heuristics for backend processing

function runFraudDetection(data, columns, options = {}) {
  const {
    threshold = 1000,
    duplicateTolerance = 2,
  } = options;

  const flaggedIndices = new Set();
  const flagReasons = {}; // Store reasons for each flagged transaction

  // Rule 1: High amount threshold
  data.forEach((row, index) => {
    if (!columns.amount) return;
    
    const amountStr = row[columns.amount] || "";
    const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ""));
    
    if (!isNaN(amount) && Math.abs(amount) >= threshold) {
      flaggedIndices.add(index);
      flagReasons[index] = flagReasons[index] || [];
      flagReasons[index].push(`High amount: $${amount.toFixed(2)} exceeds threshold of $${threshold}`);
    }
  });

  // Rule 2: Suspicious keywords in description
  const suspiciousKeywords = ["fraud", "dispute", "chargeback", "unknown", "suspicious", "unauthorized"];
  
  data.forEach((row, index) => {
    if (!columns.description) return;
    
    const desc = (row[columns.description] || "").toLowerCase();
    const foundKeywords = suspiciousKeywords.filter(keyword => desc.includes(keyword));
    
    if (foundKeywords.length > 0) {
      flaggedIndices.add(index);
      flagReasons[index] = flagReasons[index] || [];
      flagReasons[index].push(`Suspicious keywords found: ${foundKeywords.join(", ")}`);
    }
  });

  // Rule 3: Duplicate transaction detection
  if (columns.amount && columns.description) {
    const transactionSignatures = {};
    
    data.forEach((row, index) => {
      const amount = row[columns.amount] || "";
      const desc = row[columns.description] || "";
      const signature = `${amount}::${desc}`.toLowerCase();
      
      if (!transactionSignatures[signature]) {
        transactionSignatures[signature] = [];
      }
      transactionSignatures[signature].push(index);
    });

    // Flag duplicates that exceed tolerance
    Object.values(transactionSignatures).forEach(indices => {
      if (indices.length >= duplicateTolerance) {
        indices.forEach(index => {
          flaggedIndices.add(index);
          flagReasons[index] = flagReasons[index] || [];
          flagReasons[index].push(`Duplicate transaction (${indices.length} occurrences)`);
        });
      }
    });
  }

  // Rule 4: Negative balance (if balance columns exist)
  const balanceAfter = columns.balanceAfter || 
                       data[0] && Object.keys(data[0]).find(k => k.toLowerCase().includes("balance_after"));
  
  if (balanceAfter) {
    data.forEach((row, index) => {
      const balance = parseFloat((row[balanceAfter] || "").replace(/[^0-9.-]/g, ""));
      if (!isNaN(balance) && balance < 0) {
        flaggedIndices.add(index);
        flagReasons[index] = flagReasons[index] || [];
        flagReasons[index].push(`Negative balance: $${balance.toFixed(2)}`);
      }
    });
  }

  // Build flagged list with details
  const flaggedList = Array.from(flaggedIndices).map(index => ({
    index,
    row: data[index],
    reasons: flagReasons[index] || ["Flagged by system"]
  }));

  return {
    total: data.length,
    flagged: flaggedList.length,
    flaggedTransactions: flaggedList,
    columns,
  };
}

module.exports = { runFraudDetection };
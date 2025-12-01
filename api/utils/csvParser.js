// api/utils/csvParser.js
// Shared CSV parsing utility for backend

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  
  if (lines.length === 0) {
    return { headers: [], data: [] };
  }

  // Parse headers from first line
  const headers = lines[0].split(",").map(h => h.trim());
  
  // Parse data rows
  const data = lines.slice(1).map((line, index) => {
    const values = line.split(",");
    const row = {};
    
    headers.forEach((header, i) => {
      row[header] = values[i] ? values[i].trim() : "";
    });
    
    // Add row index for tracking
    row._rowIndex = index;
    
    return row;
  });

  return { headers, data };
}

// Helper to guess important column names
function guessColumns(headers) {
  const lowerHeaders = headers.map(h => h.toLowerCase());
  
  const findColumn = (candidates) => {
    for (const candidate of candidates) {
      const index = lowerHeaders.findIndex(h => h.includes(candidate));
      if (index >= 0) return headers[index];
    }
    return null;
  };

  return {
    amount: findColumn(["amount", "amt", "transaction_amount", "value"]),
    date: findColumn(["date", "timestamp", "transaction_date", "time"]),
    description: findColumn(["description", "memo", "details", "notes"]),
    transactionId: findColumn(["transaction_id", "id", "trans_id"]),
    accountId: findColumn(["account_id", "account", "acct_id"]),
    merchantCategory: findColumn(["merchant_category", "category", "merchant"]),
    country: findColumn(["country", "location", "region"]),
    deviceId: findColumn(["device_id", "device"]),
  };
}

module.exports = { parseCSV, guessColumns };
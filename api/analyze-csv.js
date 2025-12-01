// api/analyze-csv.js
// Main endpoint for CSV fraud analysis

const { parseCSV, guessColumns } = require('./utils/csvParser.js');
const { runFraudDetection } = require('./utils/fraudDetection.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { csv, threshold = 1000, duplicateTolerance = 2 } = req.body;

    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ 
        error: 'Missing or invalid CSV data',
        details: 'Request body must include "csv" field with CSV text content'
      });
    }

    const { headers, data } = parseCSV(csv);

    if (data.length === 0) {
      return res.status(400).json({
        error: 'Empty CSV',
        details: 'The CSV file contains no data rows'
      });
    }

    const columns = guessColumns(headers);

    const results = runFraudDetection(data, columns, { threshold, duplicateTolerance });

    return res.status(200).json({
      success: true,
      data: {
        headers,
        rows: data,
        ...results,
      }
    });

  } catch (error) {
    console.error('Error in analyze-csv:', error);
    return res.status(500).json({
      error: 'Server error during analysis',
      details: error.message
    });
  }
};

// api/uipath/start-job.js
// Submit CSV to UiPath Orchestrator queue

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { csv } = req.body;

    if (!csv) {
      return res.status(400).json({ 
        error: 'Missing CSV content',
        details: 'Request body must include "csv" field'
      });
    }

    const queueUrl = process.env.UIPATH_QUEUE_URL;
    const token = process.env.UIPATH_TOKEN;

    if (!queueUrl || !token) {
      return res.status(500).json({
        error: 'UiPath configuration missing',
        details: 'UIPATH_QUEUE_URL and UIPATH_TOKEN environment variables required'
      });
    }

    const payload = {
      itemData: {
        Name: "CSV_FRAUD_QUEUE",
        Priority: "Normal",
        SpecificContent: { 
          ConsumerFinancialData: csv 
        },
        Reference: `csv-upload-${Date.now()}`
      }
    };

    const response = await fetch(queueUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-UIPATH-OrganizationUnitId': process.env.UIPATH_FOLDER_ID || ''
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('UiPath queue error:', errorText);
      return res.status(500).json({
        error: 'Failed to enqueue job',
        details: 'UiPath Orchestrator rejected the request',
        uipathError: errorText
      });
    }

    const result = await response.json();
    const jobId = result.Id || result.QueueItemId || result.Result?.Id;

    if (!jobId) {
      return res.status(500).json({
        error: 'Invalid response from UiPath',
        details: 'Could not extract job ID from response'
      });
    }

    return res.status(200).json({
      success: true,
      jobId,
      message: 'CSV submitted to UiPath queue successfully',
      reference: payload.itemData.Reference
    });

  } catch (error) {
    console.error('Error starting UiPath job:', error);
    return res.status(500).json({
      error: 'Server error',
      details: error.message
    });
  }
};

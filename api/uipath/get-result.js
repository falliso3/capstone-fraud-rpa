// api/uipath/get-result.js
// Poll for UiPath job results

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Only GET allowed' });
  }

  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ 
        error: 'Missing jobId',
        details: 'Query parameter "jobId" is required'
      });
    }

    const token = process.env.UIPATH_TOKEN;
    const queueItemUrl = process.env.UIPATH_QUEUEITEM_URL;

    if (!token || !queueItemUrl) {
      return res.status(500).json({
        error: 'UiPath configuration missing',
        details: 'Server is not configured with UiPath credentials'
      });
    }

    const url = `${queueItemUrl}(${jobId})`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-UIPATH-OrganizationUnitId': process.env.UIPATH_FOLDER_ID || ''
      }
    });

    if (response.status === 204) {
      return res.status(202).json({
        status: 'processing',
        message: 'Job is still being processed'
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('UiPath retrieval error:', errorText);
      return res.status(500).json({
        error: 'Error retrieving result',
        details: 'Could not fetch queue item from UiPath',
        uipathError: errorText
      });
    }

    const item = await response.json();

    const output = item.Output || item.OutputData;
    const status = item.Status;

    if (!output || status === 'New' || status === 'InProgress') {
      return res.status(202).json({
        status: 'processing',
        message: 'Job is still being processed',
        currentStatus: status
      });
    }

    if (status === 'Failed') {
      return res.status(500).json({
        status: 'failed',
        error: 'UiPath job failed',
        details: item.ProcessingException?.Reason || 'Unknown error'
      });
    }

    let parsedOutput;
    try {
      parsedOutput = typeof output === 'string' ? JSON.parse(output) : output;
    } catch {
      parsedOutput = output;
    }

    return res.status(200).json({
      status: 'completed',
      success: true,
      data: parsedOutput,
      jobInfo: {
        id: item.Id,
        reference: item.Reference,
        processedTime: item.EndProcessing
      }
    });

  } catch (error) {
    console.error('Error getting UiPath result:', error);
    return res.status(500).json({
      error: 'Server error',
      details: error.message
    });
  }
};

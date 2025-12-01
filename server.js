const express = require('express');
const cors = require('cors');
require('dotenv').config();

console.log('==== Checking UiPath environment variables ====');
console.log('UIPATH_QUEUE_URL:', process.env.UIPATH_QUEUE_URL);
console.log('UIPATH_QUEUEITEM_URL:', process.env.UIPATH_QUEUEITEM_URL);
console.log('UIPATH_TOKEN:', process.env.UIPATH_TOKEN ? 'SET' : 'MISSING');
console.log('UIPATH_FOLDER_ID:', process.env.UIPATH_FOLDER_ID);
console.log('=================================================');

const analyzeCsv = require('./api/analyze-csv.js');
const startJob = require('./api/uipath/start-job.js');
const getResult = require('./api/uipath/get-result.js');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.post('/api/analyze-csv', analyzeCsv);
app.post('/api/uipath/start-job', startJob);
app.get('/api/uipath/get-result', getResult);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

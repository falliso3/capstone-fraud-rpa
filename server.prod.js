const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;

// Helper to start a service
function startService(scriptPath, name) {
    const service = spawn('node', [scriptPath], {
        stdio: 'inherit',
        env: { ...process.env } // Pass through env vars
    });

    service.on('error', (err) => {
        console.error(`[${name}] Failed to start:`, err);
    });

    service.on('exit', (code) => {
        if (code !== 0) {
            console.error(`[${name}] Exited with code ${code}`);
        }
    });
}

// Start Backend APIs
console.log('Starting Fraud API...');
startService(path.join(__dirname, 'api', 'APIFraudAgent', 'server.js'), 'FraudAPI');

console.log('Starting Auth API...');
startService(path.join(__dirname, 'api', 'APIAuthorization', 'server.js'), 'AuthAPI');

// Proxy API requests
// Note: We wait a bit or assume they start fast enough. 
// Ideally, we'd wait for ports to be open, but for this simple setup, proxies will just fail until they're up.
app.use('/api/fraud', createProxyMiddleware({
    target: 'http://localhost:3002',
    changeOrigin: true,
    pathRewrite: {
        '^/api/fraud': '' // Remove /api/fraud prefix when forwarding
    }
}));

app.use('/api/auth', createProxyMiddleware({
    target: 'http://localhost:3003',
    changeOrigin: true,
    pathRewrite: {
        '^/api/auth': '' // Remove /api/auth prefix when forwarding
    }
}));

// Serve React Frontend (Production Build)
app.use(express.static(path.join(__dirname, 'build')));

// Handle React Routing, return all requests to React app
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Production server running on port ${PORT}`);
});

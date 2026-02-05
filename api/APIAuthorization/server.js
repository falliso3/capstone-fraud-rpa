const express = require('express');
const app = express();
app.use(express.json());

const PORT = 3003;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Minimal stub for authorization (expand as needed)
app.post('/login', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'missing username' });
  // Incomplete: replace with real auth logic
  res.json({ message: `hello ${username}`, token: null });
});

app.listen(PORT, () => console.log(`Auth API running on port ${PORT}`));

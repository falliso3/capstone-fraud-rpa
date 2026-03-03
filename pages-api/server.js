require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

const { MONGODB_URI, MONGODB_DB, CORS_ORIGINS, MODEL_BASE_URL } = process.env;

if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");
if (!MONGODB_DB) throw new Error("Missing MONGODB_DB");

const client = new MongoClient(MONGODB_URI);
let txCol;

function getModelBaseUrl() {
  const raw = MODEL_BASE_URL;

  if (!raw) {
    throw new Error("Missing MODEL_BASE_URL. Point it at the VM model service.");
  }

  return String(raw).replace(/\/+$/, "");
}

async function fetchModelJson(pathname, options = {}) {
  const response = await fetch(`${getModelBaseUrl()}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body ? body.detail : response.statusText;
    throw new Error(`Model service request failed (${response.status}): ${detail || "Unknown error"}`);
  }

  return body ?? {};
}

function buildCorsOrigin() {
  if (!CORS_ORIGINS) return true;
  const normalize = (value) => {
    let raw = String(value || "").trim();
    raw = raw.replace(/^cors_origins\s*=\s*/i, "");
    if (!raw) return "";
    try {
      return new URL(raw).origin.toLowerCase();
    } catch (_) {
      return raw.replace(/\/+$/, "").toLowerCase();
    }
  };

  const allowed = CORS_ORIGINS.split(",")
    .map((s) => normalize(s))
    .filter(Boolean);

  const allowAll = allowed.includes("*");

  return (origin, callback) => {
    if (!origin || allowAll) return callback(null, true);

    const normalizedOrigin = normalize(origin);
    const matched = allowed.some((entry) => {
      if (entry === normalizedOrigin) return true;
      if (entry.startsWith("*.")) {
        const suffix = entry.slice(1); // ".example.com"
        return normalizedOrigin.endsWith(suffix);
      }
      return false;
    });

    if (matched) return callback(null, true);

    console.error("CORS rejected origin:", origin, "Allowed:", allowed.join(", "));
    return callback(new Error("Not allowed by CORS"));
  };
}

app.use(cors({ origin: buildCorsOrigin() }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/model/health", async (_req, res) => {
  try {
    const health = await fetchModelJson("/health", { method: "GET" });
    res.json({
      ok: true,
      target: getModelBaseUrl(),
      upstream: health,
    });
  } catch (err) {
    console.error("GET /api/model/health failed:", err.message);
    res.status(500).json({ error: "Failed to reach model service" });
  }
});

app.post("/api/model/score", async (req, res) => {
  try {
    const score = await fetchModelJson("/score", {
      method: "POST",
      body: JSON.stringify(req.body || {}),
    });

    res.json({
      ok: true,
      target: getModelBaseUrl(),
      ...score,
    });
  } catch (err) {
    console.error("POST /api/model/score failed:", err.message);
    res.status(500).json({ error: "Failed to score with model service" });
  }
});

app.get("/api/transactions", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const docs = await txCol.find({}).sort({ created: -1 }).limit(limit).toArray();
    res.json(docs);
  } catch (err) {
    console.error("GET /api/transactions failed:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

app.get("/api/transactions/:id", async (req, res) => {
  try {
    const doc = await txCol.findOne({ _id: req.params.id });
    if (!doc) return res.status(404).json({ error: "Transaction not found" });
    return res.json(doc);
  } catch (err) {
    console.error("GET /api/transactions/:id failed:", err.message);
    return res.status(500).json({ error: "Failed to fetch transaction" });
  }
});

app.post("/api/transactions/:id/queue-summary", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await txCol.updateOne(
      { _id: id },
      {
        $set: {
          summary_needed: true,
          updatedAt: new Date()
        }
      },
      { upsert: false }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    return res.json({ id, queued: true });
  } catch (err) {
    console.error("POST /api/transactions/:id/queue-summary failed:", err.message);
    return res.status(500).json({ error: "Failed to queue summary" });
  }
});

app.post("/api/transactions/:id/summarize", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await txCol.updateOne(
      { _id: id },
      {
        $set: {
          summary_needed: true,
          updatedAt: new Date()
        }
      },
      { upsert: false }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    return res.json({ id, queued: true, note: "Worker will generate the summary." });
  } catch (err) {
    console.error("POST /api/transactions/:id/summarize failed:", err.message);
    return res.status(500).json({ error: "Failed to queue transaction summary" });
  }
});

async function start() {
  await client.connect();
  const db = client.db(MONGODB_DB);
  txCol = db.collection("transactions");

  await txCol.createIndex({ created: -1 });
  await txCol.createIndex({ summary_needed: 1, updatedAt: -1 });

  app.listen(port, () => {
    console.log(`pages-api listening on http://localhost:${port}`);
  });
}

async function shutdown() {
  try {
    await client.close();
  } catch (_) {
    // ignore
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((err) => {
  console.error("Failed to start pages-api:", err);
  process.exit(1);
});

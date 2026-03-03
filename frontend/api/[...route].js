import { MongoClient } from "mongodb";

const { MONGODB_URI, MONGODB_DB } = process.env;

let mongoClientPromise;

function json(res, status, body) {
  res.status(status).json(body);
}

function getRouteParts(req) {
  const url = new URL(req.url, "http://localhost");
  return url.pathname
    .split("/")
    .filter(Boolean)
    .slice(1);
}

function getLimit(req) {
  const raw = new URL(req.url, "http://localhost").searchParams.get("limit");
  const parsed = Number.parseInt(raw || "50", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(parsed, 200);
}

async function getTransactionsCollection() {
  if (!MONGODB_URI || !MONGODB_DB) {
    throw new Error("Missing MONGODB_URI or MONGODB_DB");
  }

  if (!mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI);
    mongoClientPromise = client.connect();
  }

  const client = await mongoClientPromise;
  return client.db(MONGODB_DB).collection("transactions");
}

async function listTransactions(req, res) {
  const txCol = await getTransactionsCollection();
  const docs = await txCol.find({}).sort({ created: -1 }).limit(getLimit(req)).toArray();
  json(res, 200, docs);
}

async function getTransaction(res, id) {
  const txCol = await getTransactionsCollection();
  const doc = await txCol.findOne({ _id: id });

  if (!doc) {
    return json(res, 404, { error: "Transaction not found" });
  }

  return json(res, 200, doc);
}

async function queueSummary(res, id, action) {
  const txCol = await getTransactionsCollection();
  const result = await txCol.updateOne(
    { _id: id },
    {
      $set: {
        summary_needed: true,
        updatedAt: new Date(),
      },
    }
  );

  if (result.matchedCount === 0) {
    return json(res, 404, { error: "Transaction not found" });
  }

  return json(res, 200, {
    id,
    queued: true,
    note:
      action === "summarize"
        ? "Vercel marks the record for summarization, but you still need a separate worker to generate the summary."
        : "Vercel marks the record for summarization, but you still need a separate worker to process the queue.",
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET,POST,OPTIONS");
    return res.status(204).end();
  }

  try {
    const parts = getRouteParts(req);

    if (parts.length === 1 && parts[0] === "transactions" && req.method === "GET") {
      return await listTransactions(req, res);
    }

    if (parts.length === 2 && parts[0] === "transactions" && req.method === "GET") {
      return await getTransaction(res, parts[1]);
    }

    if (
      parts.length === 3 &&
      parts[0] === "transactions" &&
      parts[2] === "queue-summary" &&
      req.method === "POST"
    ) {
      return await queueSummary(res, parts[1], "queue-summary");
    }

    if (
      parts.length === 3 &&
      parts[0] === "transactions" &&
      parts[2] === "summarize" &&
      req.method === "POST"
    ) {
      return await queueSummary(res, parts[1], "summarize");
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("Vercel API error:", error);
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
}

const { MongoClient } = require("mongodb");
const OpenAI = require("openai");

const {
  MONGODB_URI,
  MONGODB_DB,
  OPENAI_API_KEY,
  MODEL_BASE_URL,
} = process.env;

let mongoClientPromise;
let openaiClient;

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

function getModelBaseUrl() {
  const raw = MODEL_BASE_URL;

  if (!raw) {
    throw new Error("Missing MODEL_BASE_URL. Point it at the VM model service.");
  }

  return String(raw).replace(/\/+$/, "");
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
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

function getOpenAIClient() {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }

  return openaiClient;
}

function buildSummaryInput(tx) {
  return {
    id: tx._id,
    last_event_type: tx.last_event_type || null,
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    paid: tx.paid,
    decision: tx.decision,
    stripe_risk: tx.risk
      ? {
          level: tx.risk.level ?? null,
          score: tx.risk.score ?? null,
          network_status: tx.risk.network_status ?? null,
          outcome_type: tx.risk.outcome_type ?? null,
          seller_message: tx.risk.seller_message ?? null,
          reason: tx.risk.reason ?? null,
        }
      : null,
    checks: tx.checks || null,
    card: tx.card
      ? {
          brand: tx.card.brand ?? null,
          last4: tx.card.last4 ?? null,
          funding: tx.card.funding ?? null,
          country: tx.card.country ?? null,
          fingerprint: tx.card.fingerprint
            ? `${String(tx.card.fingerprint).slice(0, 10)}...`
            : null,
        }
      : null,
    billing_country: tx.billing_country ?? null,
    shipping_country: tx.shipping_country ?? null,
    disputed: !!tx.disputed,
    dispute_id: tx.dispute_id ?? null,
    dispute_details: tx.dispute_details || null,
    internalRisk: tx.internalRisk || null,
    ml: tx.ml || null,
    created: tx.created,
    latest_charge: tx.latest_charge ?? null,
    charges: tx.charges || [],
  };
}

function buildSystemPrompt(tx) {
  const evt = tx.last_event_type || "";
  const disputed = !!tx.disputed || !!tx.dispute_id || !!tx.dispute_details;

  if (disputed) {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write a concise 3 to 5 sentence summary focused on dispute handling. " +
      "Include amount and currency, payment status, dispute status or reason if present, " +
      "Stripe risk level or score if present, internalRisk score or label if present, ML prob_fraud if present, " +
      "and the next action an analyst should take. " +
      "If key data is missing, say so. Do not include sensitive data beyond brand and last4."
    );
  }

  if (evt === "payment_intent.created") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2 to 3 sentences. This is a newly created payment intent. " +
      "Summarize the known amount, currency, current status, and whether any early signals suggest risk. " +
      "If there is no charge or card data yet, explicitly note that and recommend what to watch next. " +
      "Do not invent missing details."
    );
  }

  if (evt === "payment_intent.succeeded") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2 to 4 sentences. The payment intent succeeded. " +
      "Summarize amount, currency, final status, Stripe risk level or score if present, internalRisk if present, and ML prob_fraud if present. " +
      "Conclude with whether it appears clean or needs review, and why. " +
      "Do not invent missing details."
    );
  }

  if (evt === "payment_intent.payment_failed") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2 to 4 sentences. This payment attempt failed. " +
      "Summarize amount, currency, failure context if present, and any risk or verification signals. " +
      "Recommend next steps, including whether it looks like normal failure or suspicious retry behavior. " +
      "Do not invent missing details."
    );
  }

  if (evt === "payment_intent.canceled") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2 to 4 sentences. The payment intent was canceled. " +
      "Summarize amount, currency, cancellation status, and any suspicious context. " +
      "Recommend whether to ignore it as normal abandonment or review it. " +
      "Do not invent missing details."
    );
  }

  if (evt === "charge.failed") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2 to 4 sentences. This charge failed. " +
      "Summarize amount, currency, status, and any available risk or verification signals. " +
      "Call out whether this looks like card testing or a normal decline. " +
      "Do not invent missing details."
    );
  }

  if (evt === "charge.refunded") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2 to 4 sentences. This charge was refunded. " +
      "Summarize amount, currency, whether it had previously succeeded, and any risk or dispute signals. " +
      "Recommend whether this appears routine or suspicious. " +
      "Do not invent missing details."
    );
  }

  return (
    "You are a fraud-ops assistant for an internal dashboard. " +
    "Write 2 to 4 sentences. This charge succeeded. " +
    "Summarize amount, currency, payment outcome, Stripe risk level or score if present, internalRisk score or label if present, " +
    "ML prob_fraud if present, and whether it should be considered clean or needs review. " +
    "If Stripe and internalRisk disagree, mention that explicitly. " +
    "Do not invent missing details."
  );
}

async function generateSummary(tx) {
  const openai = getOpenAIClient();
  const response = await openai.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "system",
        content: buildSystemPrompt(tx),
      },
      {
        role: "user",
        content: `Transaction data:\n${JSON.stringify(buildSummaryInput(tx), null, 2)}`,
      },
    ],
  });

  return {
    summaryText: (response.output_text || "").trim(),
    modelUsed: response.model || "gpt-4.1",
  };
}

async function listTransactions(req, res) {
  const txCol = await getTransactionsCollection();
  const docs = await txCol.find({}).sort({ created: -1 }).limit(getLimit(req)).toArray();
  json(res, 200, docs);
}

async function getModelHealth(res) {
  const health = await fetchModelJson("/health", { method: "GET" });
  return json(res, 200, {
    ok: true,
    target: getModelBaseUrl(),
    upstream: health,
  });
}

async function scoreModel(req, res) {
  const payload = await readJsonBody(req);
  const score = await fetchModelJson("/score", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return json(res, 200, {
    ok: true,
    target: getModelBaseUrl(),
    ...score,
  });
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
        ? "Use POST /api/transactions/:id/summarize to generate a summary immediately."
        : "This marks the record for background processing if you still run a separate worker.",
  });
}

async function summarizeTransaction(res, id) {
  const txCol = await getTransactionsCollection();
  const tx = await txCol.findOne({ _id: id });

  if (!tx) {
    return json(res, 404, { error: "Transaction not found" });
  }

  await txCol.updateOne(
    { _id: id },
    {
      $set: {
        summary_needed: true,
        summary_in_progress: true,
        updatedAt: new Date(),
      },
      $unset: {
        summary_last_error: "",
      },
    }
  );

  try {
    const { summaryText, modelUsed } = await generateSummary(tx);

    await txCol.updateOne(
      { _id: id },
      {
        $set: {
          summary: summaryText,
          summary_model: modelUsed,
          summary_updatedAt: new Date(),
          summary_needed: false,
          summary_in_progress: false,
          updatedAt: new Date(),
        },
      }
    );

    return json(res, 200, {
      id,
      summary: summaryText,
      summary_model: modelUsed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";

    await txCol.updateOne(
      { _id: id },
      {
        $set: {
          summary_in_progress: false,
          summary_last_error: message,
          updatedAt: new Date(),
        },
        $inc: {
          summary_failures: 1,
        },
      }
    );

    throw error;
  }
}

module.exports = async function handler(req, res) {
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

    if (parts.length === 2 && parts[0] === "model" && parts[1] === "health" && req.method === "GET") {
      return await getModelHealth(res);
    }

    if (parts.length === 2 && parts[0] === "model" && parts[1] === "score" && req.method === "POST") {
      return await scoreModel(req, res);
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
      return await summarizeTransaction(res, parts[1]);
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("Vercel API error:", error);
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
};

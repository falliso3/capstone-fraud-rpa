const { MongoClient } = require("mongodb");
const OpenAI = require("openai");
const Stripe = require("stripe");

const {
  AUTO_GENERATE_SUMMARY_ON_WEBHOOK,
  MONGODB_URI,
  MONGODB_DB,
  OPENAI_API_KEY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
} = process.env;

let mongoClientPromise;
let openaiClient;
let stripeClient;

function json(res, status, body) {
  res.status(status).json(body);
}

function getStripeClient() {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(STRIPE_SECRET_KEY);
  }

  return stripeClient;
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

async function getCollections() {
  if (!MONGODB_URI || !MONGODB_DB) {
    throw new Error("Missing MONGODB_URI or MONGODB_DB");
  }

  if (!mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI);
    mongoClientPromise = client.connect();
  }

  const client = await mongoClientPromise;
  const db = client.db(MONGODB_DB);
  return {
    eventsCol: db.collection("stripe_events"),
    txCol: db.collection("transactions"),
  };
}

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function computeDecision({ status, dispute_details, disputed, review, risk }) {
  const disputeReason = dispute_details?.reason ?? null;

  if (disputeReason === "fraudulent") return "fraud_confirmed";
  if (disputed || dispute_details) return "disputed";

  if (review === "open") return "manual_review";
  if (risk?.level === "high" || risk?.level === "highest") return "high_risk";
  if (typeof risk?.score === "number" && risk.score >= 70) return "high_risk";

  if (status === "succeeded") return "approved";
  if (status === "failed") return "declined";
  return "unknown";
}

function shouldQueueSummaryForEvent(eventType) {
  return (
    eventType.startsWith("charge.") ||
    eventType.startsWith("payment_intent.") ||
    eventType.startsWith("charge.dispute.")
  );
}

function extractPointers(event) {
  const obj = event?.data?.object || {};
  const objectType = obj?.object || null;
  const objectId = obj?.id || null;

  let pi = null;
  let charge = null;

  if (objectType === "payment_intent") {
    pi = objectId || null;
  } else if (objectType === "charge") {
    charge = objectId || null;
    pi = obj?.payment_intent || null;
  } else if (objectType === "dispute" || objectType === "charge.dispute") {
    charge = obj?.charge || null;
    pi = obj?.payment_intent || null;
  } else {
    pi = obj?.payment_intent || pi;
    charge = obj?.charge || charge;
  }

  return { pi, charge, object_type: objectType, object_id: objectId };
}

async function ensureIndexes(eventsCol, txCol) {
  await eventsCol.createIndex({ type: 1, created: -1 });
  await eventsCol.createIndex({ pi: 1, created: -1 });
  await eventsCol.createIndex({ charge: 1, created: -1 });
  await eventsCol.createIndex({ object_id: 1, created: -1 });

  await txCol.createIndex({ created: -1 });
  await txCol.createIndex({ latest_charge: 1 });
  await txCol.createIndex({ charges: 1 });
  await txCol.createIndex({ summary_needed: 1, updatedAt: -1 });
  await txCol.createIndex({ summary_in_progress: 1 });
  await txCol.createIndex({ last_event_id: 1 });
  await txCol.createIndex({ event_ids: 1 });
}

function shouldGenerateSummaryNow() {
  return String(AUTO_GENERATE_SUMMARY_ON_WEBHOOK || "").toLowerCase() === "true";
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

async function maybeGenerateSummary(event, txCol) {
  if (!shouldGenerateSummaryNow()) {
    return;
  }

  if (!shouldQueueSummaryForEvent(event.type)) {
    return;
  }

  let txId = null;

  if (event.type.startsWith("payment_intent.")) {
    txId = event.data.object.id;
  } else if (event.type.startsWith("charge.dispute.")) {
    const chargeId = event.data.object.charge;
    if (chargeId) {
      const existing = await txCol.findOne({
        $or: [{ latest_charge: chargeId }, { charges: chargeId }],
      });
      txId = existing?._id || null;
    }
  } else {
    txId = event.data.object.payment_intent || event.data.object.id;
  }

  if (!txId) {
    return;
  }

  const tx = await txCol.findOne({ _id: txId });
  if (!tx) {
    return;
  }

  await txCol.updateOne(
    { _id: txId },
    {
      $set: {
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
      { _id: txId },
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Summary generation failed";
    await txCol.updateOne(
      { _id: txId },
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
    console.error("Stripe webhook summary generation failed:", error);
  }
}

async function projectEvent(event, txCol) {
  const obj = event.data.object;
  const queueSummary = shouldQueueSummaryForEvent(event.type);

  if (event.type.startsWith("charge.")) {
    const ch = obj;
    const piId = ch.payment_intent;
    const outcome = ch.outcome || {};
    const pmCard = ch.payment_method_details?.card || {};
    const checks = pmCard.checks || {};

    const risk = {
      level: outcome.risk_level ?? ch.risk_level ?? null,
      score: outcome.risk_score ?? ch.risk_score ?? null,
      network_status: outcome.network_status ?? null,
      outcome_type: outcome.type ?? null,
      seller_message: outcome.seller_message ?? null,
      reason: outcome.reason ?? null,
      network_decline_code: outcome.network_decline_code ?? null,
      network_advice_code: outcome.network_advice_code ?? null,
    };

    const txUpdate = {
      payment_intent: piId ?? null,
      latest_charge: ch.id,
      amount: ch.amount,
      currency: ch.currency,
      status: ch.status,
      paid: ch.paid,
      created: ch.created,
      livemode: ch.livemode,
      description: ch.description ?? null,
      billing_country: ch.billing_details?.address?.country ?? null,
      shipping_country: ch.shipping?.address?.country ?? null,
      risk,
      disputed: ch.disputed ?? false,
      dispute_id:
        typeof ch.dispute === "string" ? ch.dispute : ch.dispute?.id ?? null,
      review: ch.review ?? null,
      card: {
        brand: pmCard.brand ?? null,
        last4: pmCard.last4 ?? null,
        country: pmCard.country ?? null,
        funding: pmCard.funding ?? null,
        network: pmCard.network ?? null,
        fingerprint: pmCard.fingerprint ?? null,
      },
      checks: {
        cvc_check: checks.cvc_check ?? null,
        address_line1_check: checks.address_line1_check ?? null,
        address_postal_code_check: checks.address_postal_code_check ?? null,
      },
      last_event_id: event.id,
      last_event_type: event.type,
      updatedAt: new Date(),
    };

    txUpdate.decision = computeDecision(txUpdate);

    await txCol.updateOne(
      { _id: piId || ch.id },
      {
        $set: {
          ...txUpdate,
          ...(queueSummary ? { summary_needed: true } : {}),
        },
        $addToSet: { charges: ch.id, event_ids: event.id },
        $setOnInsert: {
          summary_in_progress: false,
          summary_failures: 0,
        },
      },
      { upsert: true }
    );
  }

  if (event.type.startsWith("payment_intent.")) {
    const pi = obj;

    await txCol.updateOne(
      { _id: pi.id },
      {
        $set: {
          payment_intent: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          created: pi.created,
          livemode: pi.livemode,
          latest_charge: pi.latest_charge ?? null,
          last_event_id: event.id,
          last_event_type: event.type,
          updatedAt: new Date(),
          ...(queueSummary ? { summary_needed: true } : {}),
        },
        $addToSet: { event_ids: event.id },
        $setOnInsert: {
          summary_in_progress: false,
          summary_failures: 0,
        },
      },
      { upsert: true }
    );

    const latest = await txCol.findOne({ _id: pi.id });
    if (latest) {
      await txCol.updateOne(
        { _id: pi.id },
        { $set: { decision: computeDecision(latest) } }
      );
    }
  }

  if (event.type.startsWith("charge.dispute.")) {
    const dp = obj;
    const chargeId = dp.charge;

    if (!chargeId) return;

    const existing = await txCol.findOne({
      $or: [{ latest_charge: chargeId }, { charges: chargeId }],
    });

    if (!existing?._id) return;

    await txCol.updateOne(
      { _id: existing._id },
      {
        $set: {
          disputed: true,
          dispute_id: dp.id,
          dispute_details: {
            id: dp.id,
            status: dp.status ?? null,
            reason: dp.reason ?? null,
            amount: dp.amount ?? null,
            currency: dp.currency ?? null,
            created: dp.created ?? null,
          },
          last_event_id: event.id,
          last_event_type: event.type,
          updatedAt: new Date(),
          ...(queueSummary ? { summary_needed: true } : {}),
        },
        $addToSet: { event_ids: event.id },
        $setOnInsert: {
          summary_in_progress: false,
          summary_failures: 0,
        },
      }
    );

    const latest = await txCol.findOne({ _id: existing._id });
    if (latest) {
      await txCol.updateOne(
        { _id: existing._id },
        { $set: { decision: computeDecision(latest) } }
      );
    }
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    return json(res, 500, { error: "Missing STRIPE_WEBHOOK_SECRET" });
  }

  try {
    const stripe = getStripeClient();
    const payload = await readRawBody(req);
    const signature = req.headers["stripe-signature"];

    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      STRIPE_WEBHOOK_SECRET
    );

    const { eventsCol, txCol } = await getCollections();
    await ensureIndexes(eventsCol, txCol);

    const pointers = extractPointers(event);

    await eventsCol.updateOne(
      { _id: event.id },
      {
        $set: {
          type: event.type,
          created: event.created,
          livemode: event.livemode,
          data: event.data,
          receivedAt: new Date(),
          pi: pointers.pi,
          charge: pointers.charge,
          object_type: pointers.object_type,
          object_id: pointers.object_id,
        },
      },
      { upsert: true }
    );

    try {
      await projectEvent(event, txCol);
    } catch (error) {
      console.error("Stripe webhook projection failed:", error);
    }

    try {
      await maybeGenerateSummary(event, txCol);
    } catch (error) {
      console.error("Stripe webhook post-processing failed:", error);
    }

    return json(res, 200, { received: true, eventType: event.type, id: event.id });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return json(res, 400, {
      error: error instanceof Error ? error.message : "Webhook processing failed",
    });
  }
};

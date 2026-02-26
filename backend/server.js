// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const { MongoClient } = require("mongodb");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 5000;

// --- Stripe setup ---
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ Missing STRIPE_SECRET_KEY in .env");
  process.exit(1);
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.error("❌ Missing STRIPE_WEBHOOK_SECRET in .env");
  process.exit(1);
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// --- OpenAI setup ---
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY in .env");
  process.exit(1);
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Mongo setup ---
if (!process.env.MONGODB_URI) {
  console.error("❌ Missing MONGODB_URI in .env");
  process.exit(1);
}
if (!process.env.MONGODB_DB) {
  console.error("❌ Missing MONGODB_DB in .env");
  process.exit(1);
}

const mongoClient = new MongoClient(process.env.MONGODB_URI);

let eventsCol;
let txCol;

async function initMongo() {
  await mongoClient.connect();
  const db = mongoClient.db(process.env.MONGODB_DB);
  eventsCol = db.collection("stripe_events");
  txCol = db.collection("transactions");

  // Helpful indexes (safe to call repeatedly)
  await eventsCol.createIndex({ type: 1, created: -1 });

  // fast tracing from tx -> events
  await eventsCol.createIndex({ pi: 1, created: -1 });
  await eventsCol.createIndex({ charge: 1, created: -1 });
  await eventsCol.createIndex({ object_id: 1, created: -1 });

  await txCol.createIndex({ created: -1 });
  await txCol.createIndex({ latest_charge: 1 });
  await txCol.createIndex({ charges: 1 }); // multikey for dispute lookup
  await txCol.createIndex({ summary_needed: 1, updatedAt: -1 });
  await txCol.createIndex({ summary_in_progress: 1 });

  // trace tx -> stripe event ids quickly
  await txCol.createIndex({ last_event_id: 1 });
  await txCol.createIndex({ event_ids: 1 }); // multikey

  console.log("✅ MongoDB connected + indexes ensured");
}

/**
 * Decisioning:
 * - Do NOT treat every dispute as fraud. Only treat it as "fraud_confirmed"
 *   when dispute reason is explicitly "fraudulent"
 */
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
  // Queue summaries for events that materially change fraud context
  return (
    eventType.startsWith("charge.") ||
    eventType.startsWith("payment_intent.") ||
    eventType.startsWith("charge.dispute.")
  );
}

/**
 * Extract common trace pointers so you can jump:
 *   - from pi_... -> all stripe_events
 *   - from charge ch_... -> all stripe_events
 */
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

// --- IMPORTANT ---
// Stripe webhook needs RAW body for signature verification.
// Define this route BEFORE express.json().
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const pointers = extractPointers(event);

    // 1) Store raw event (idempotent) + trace pointers
    try {
      await eventsCol.updateOne(
        { _id: event.id },
        {
          $set: {
            type: event.type,
            created: event.created,
            livemode: event.livemode,
            data: event.data,
            receivedAt: new Date(),

            // tracing fields
            pi: pointers.pi,
            charge: pointers.charge,
            object_type: pointers.object_type,
            object_id: pointers.object_id,
          },
        },
        { upsert: true }
      );
    } catch (dbErr) {
      console.error("❌ Mongo upsert failed:", dbErr.message);
      return res.status(500).send("DB Error (stripe_events)");
    }

    // 2) Update curated transactions view
    try {
      const obj = event.data.object;
      const queueSummary = shouldQueueSummaryForEvent(event.type);

      // A) Charge events
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

          // trace last event on the transaction doc
          last_event_id: event.id,
          last_event_type: event.type,

          updatedAt: new Date(),
        };

        txUpdate.decision = computeDecision(txUpdate);

        const txId = piId || ch.id;

        await txCol.updateOne(
          { _id: txId },
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

      // B) PaymentIntent events
      if (event.type.startsWith("payment_intent.")) {
        const pi = obj;
        const txId = pi.id;

        await txCol.updateOne(
          { _id: txId },
          {
            $set: {
              payment_intent: pi.id,
              amount: pi.amount,
              currency: pi.currency,
              status: pi.status,
              created: pi.created,
              livemode: pi.livemode,
              latest_charge: pi.latest_charge ?? null,

              // trace last event on the transaction doc
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

        const latest = await txCol.findOne({ _id: txId });
        if (latest) {
          await txCol.updateOne(
            { _id: txId },
            { $set: { decision: computeDecision(latest) } }
          );
        }
      }

      // C) Dispute events
      if (event.type.startsWith("charge.dispute.")) {
        const dp = obj;
        const chargeId = dp.charge;

        if (chargeId) {
          const existing = await txCol.findOne({
            $or: [{ latest_charge: chargeId }, { charges: chargeId }],
          });

          if (existing?._id) {
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

                  // trace last event
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
      }
    } catch (txErr) {
      // Don't fail the webhook if projection fails
      console.error("⚠️ transactions update failed:", txErr.message);
    }

    console.log("✅ Received event:", event.type, event.id);
    return res.json({ received: true });
  }
);

// Normal JSON routes go AFTER webhook route
app.use(express.json());

// ✅ CORS for your frontend (Vite default is http://localhost:5173)
app.use(cors({ origin: true }));

app.get("/", (req, res) => {
  res.send("Backend is running");
});

// Fetch latest transactions
app.get("/api/transactions", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const docs = await txCol.find({}).sort({ created: -1 }).limit(limit).toArray();
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// ✅ Fetch a single transaction by id
app.get("/api/transactions/:id", async (req, res) => {
  try {
    const doc = await txCol.findOne({ _id: req.params.id });
    if (!doc) return res.status(404).json({ error: "Transaction not found" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch transaction" });
  }
});

// Queue a summary (manual trigger button)
app.post("/api/transactions/:id/queue-summary", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await txCol.updateOne(
      { _id: id },
      {
        $set: {
          summary_needed: true,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          summary_in_progress: false,
          summary_failures: 0,
        },
      },
      { upsert: false }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Transaction not found" });

    res.json({ id, queued: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to queue summary" });
  }
});

// OPTIONAL: keep your old summarize endpoint, but make it "queue-only" to avoid double-billing
app.post("/api/transactions/:id/summarize", async (req, res) => {
  try {
    const id = req.params.id;

    const tx = await txCol.findOne({ _id: id });
    if (!tx) return res.status(404).json({ error: "Transaction not found" });

    await txCol.updateOne(
      { _id: id },
      { $set: { summary_needed: true, updatedAt: new Date() } }
    );

    res.json({ id, queued: true, note: "Worker will generate the summary automatically." });
  } catch (e) {
    console.error("❌ summarize(queue) error:", e);
    res.status(500).json({ error: "Failed to queue transaction summary" });
  }
});

initMongo()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`✅ Server listening on http://localhost:${PORT}`)
    );
  })
  .catch((e) => {
    console.error("❌ Failed to start:", e);
    process.exit(1);
  });

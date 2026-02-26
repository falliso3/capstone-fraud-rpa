// worker.js
require("dotenv").config();

const { MongoClient } = require("mongodb");
const OpenAI = require("openai");

const { MONGODB_URI, MONGODB_DB, OPENAI_API_KEY } = process.env;

// Optional (defaults to local Python scorer)
const MODEL_SCORE_URL = process.env.MODEL_SCORE_URL || "http://localhost:8000/score";

if (!MONGODB_URI) throw new Error("Missing MONGODB_URI in .env");
if (!MONGODB_DB) throw new Error("Missing MONGODB_DB in .env");
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY in .env");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Ensure fetch exists (Node 18+ has it; older Node needs node-fetch)
const fetchFn =
  typeof fetch === "function"
    ? fetch
    : (...args) => import("node-fetch").then(({ default: f }) => f(...args));

// Locking / retry
const LOCK_MS = 10 * 60 * 1000; // 10 minutes
const LOOP_SLEEP_MS = 1200;

// Risk scoring windows (seconds)
const WIN_10M = 10 * 60;
const WIN_30M = 30 * 60;
const WIN_1H = 60 * 60;
const WIN_24H = 24 * 60 * 60;

// Labels
const labelFromScore = (s) => (s >= 70 ? "high" : s >= 30 ? "medium" : "low");
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Score with Python ML service (FastAPI) at MODEL_SCORE_URL.
 * Expects the exact feature fields used by ML/features.py + ML/score_service.py.
 */
async function scoreWithModel(tx) {
  const amount = typeof tx.amount === "number" ? tx.amount : 0;
  const f = tx?.internalRisk?.features || {};

  const payload = {
    log_amount: Math.log1p(amount),
    stripe_risk_score: typeof tx?.risk?.score === "number" ? tx.risk.score : 0,
    internal_score: typeof tx?.internalRisk?.score === "number" ? tx.internalRisk.score : 0,

    cnt10m: f.cnt10m || 0,
    cnt1h: f.cnt1h || 0,
    totalAmount1h: f.totalAmount1h || 0,
    smallCount1h: f.smallCount1h || 0,
    failCount30m: f.failCount30m || 0,

    cvc_fail: tx?.checks?.cvc_check === "fail" ? 1 : 0,
    postal_fail: tx?.checks?.address_postal_code_check === "fail" ? 1 : 0,
    addr_checks_missing:
      tx?.checks?.address_postal_code_check == null &&
      tx?.checks?.address_line1_check == null
        ? 1
        : 0,

    country_mismatch_card_ship:
      tx?.card?.country &&
      tx?.shipping_country &&
      tx.card.country !== tx.shipping_country
        ? 1
        : 0,
    country_mismatch_card_bill:
      tx?.card?.country &&
      tx?.billing_country &&
      tx.card.country !== tx.billing_country
        ? 1
        : 0,

    has_fingerprint: tx?.card?.fingerprint ? 1 : 0,
  };

  const resp = await fetchFn(MODEL_SCORE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Model score failed: ${resp.status} ${txt}`);
  }

  return await resp.json(); // { prob_fraud, model_version }
}

/**
 * Build summary input (keep it tight + explainable)
 */
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
            ? `${String(tx.card.fingerprint).slice(0, 10)}…`
            : null, // partial for display
        }
      : null,

    billing_country: tx.billing_country ?? null,
    shipping_country: tx.shipping_country ?? null,

    disputed: !!tx.disputed,
    dispute_id: tx.dispute_id ?? null,
    dispute_details: tx.dispute_details || null,

    internalRisk: tx.internalRisk || null,
    ml: tx.ml || null, // <-- ML output included for GPT summary

    created: tx.created,
    latest_charge: tx.latest_charge ?? null,
    charges: tx.charges || [],
  };
}

/**
 * Tailored system instructions based on what kind of event/state this tx represents.
 * We summarize ALL 7 event families the user listed (PI created/succeeded/payment_failed/canceled + charge succeeded/failed/refunded)
 * and we also prioritize dispute context if present.
 */
function buildSystemPrompt(tx) {
  const evt = tx.last_event_type || "";
  const disputed = !!tx.disputed || !!tx.dispute_id || !!tx.dispute_details;

  if (disputed) {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write a concise 3–5 sentence summary focused on dispute handling. " +
      "Include: amount/currency, current payment status, dispute status/reason if present, " +
      "Stripe risk level/score if present, internalRisk score/label if present, ML prob_fraud if present, and the next action an analyst should take. " +
      "If key data is missing, say so. Do not include sensitive data beyond brand/last4."
    );
  }

  if (evt === "payment_intent.created") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2–3 sentences. This is a newly created payment intent (early stage). " +
      "Summarize what is known: amount/currency, current status, and whether any early signals suggest risk. " +
      "If there is no charge/card data yet, explicitly note that and recommend what to watch for next. " +
      "Do not invent missing details. No sensitive data beyond brand/last4."
    );
  }

  if (evt === "payment_intent.succeeded") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2–4 sentences. The payment intent succeeded. " +
      "Summarize amount/currency, final status, and highlight Stripe risk level/score if present plus internalRisk if present and ML prob_fraud if present. " +
      "Conclude with whether it appears clean vs needs review, and why. " +
      "Do not invent missing details. No sensitive data beyond brand/last4."
    );
  }

  if (evt === "payment_intent.payment_failed") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2–4 sentences. This payment attempt failed. " +
      "Summarize amount/currency, failure context if present, and highlight any risk/verification signals. " +
      "Recommend next steps: retry guidance vs block/manual review if suspicious patterns exist (velocity/card testing). " +
      "Do not invent missing details. No sensitive data beyond brand/last4."
    );
  }

  if (evt === "payment_intent.canceled") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2–4 sentences. The payment intent was canceled. " +
      "Summarize amount/currency, cancellation status, and any suspicious context (e.g., repeated attempts/velocity) if present. " +
      "Recommend whether to ignore as normal abandonment or review for abuse. " +
      "Do not invent missing details. No sensitive data beyond brand/last4."
    );
  }

  if (evt === "charge.failed") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2–4 sentences. This charge failed. " +
      "Summarize amount/currency, status, and any available risk/verification signals. " +
      "Call out velocity/retry patterns and whether this looks like card testing or normal decline. " +
      "Do not invent missing details. No sensitive data beyond brand/last4."
    );
  }

  if (evt === "charge.refunded") {
    return (
      "You are a fraud-ops assistant for an internal dashboard. " +
      "Write 2–4 sentences. This charge was refunded. " +
      "Summarize amount/currency, whether it was previously successful, and whether there are risk or dispute signals. " +
      "Recommend whether this is normal customer service or potentially suspicious. " +
      "Do not invent missing details. No sensitive data beyond brand/last4."
    );
  }

  // charge.succeeded (default success case)
  return (
    "You are a fraud-ops assistant for an internal dashboard. " +
    "Write 2–4 sentences. This charge succeeded. " +
    "Summarize amount/currency, payment outcome/status, Stripe risk level/score if present, internalRisk score/label if present, " +
    "ML prob_fraud if present, and whether it should be considered clean vs needing review. " +
    "If Stripe and internalRisk disagree, mention that explicitly and cite the top internal reasons. " +
    "Do not invent missing details. No sensitive data beyond brand/last4."
  );
}

/**
 * Compute internal risk using your DB history (velocity + card testing + verification mismatch).
 * Uses best available identifier:
 *   - card.fingerprint if present
 *   - else card.brand + card.last4
 *
 * NOTE: windows are based on tx.created (epoch seconds) for consistency.
 */
async function computeInternalRisk(tx, txCol) {
  const reasons = [];
  const features = {};
  let score = 0;

  const nowSec =
    typeof tx.created === "number" ? tx.created : Math.floor(Date.now() / 1000);

  const add = (code, points, detail) => {
    if (!points || points <= 0) return;
    score += points;
    reasons.push({ code, points, detail });
  };

  const disputeReason = tx?.dispute_details?.reason ?? null;
  if (disputeReason === "fraudulent") {
    return {
      score: 100,
      label: "high",
      reasons: [
        {
          code: "DISPUTE_FRAUDULENT",
          points: 100,
          detail: "Dispute reason is fraudulent",
        },
      ],
      features: { disputeReason },
      flags: { disagree_with_stripe: tx?.risk?.level === "normal" },
      version: "rules_v1",
      computedAt: new Date(),
    };
  }

  if (tx.disputed || tx.dispute_id || tx.dispute_details) {
    add("DISPUTED", 40, "Charge is disputed or dispute_id/details present");
  }

  // Identifier selection
  const fp = tx?.card?.fingerprint || null;
  const brand = tx?.card?.brand || null;
  const last4 = tx?.card?.last4 || null;

  let idQuery = null;
  let idLabel = null;

  if (fp) {
    idQuery = { "card.fingerprint": fp };
    idLabel = `fingerprint ${String(fp).slice(0, 6)}…`;
  } else if (brand && last4) {
    idQuery = { "card.brand": brand, "card.last4": last4 };
    idLabel = `${brand} last4 ${last4}`;
  }

  // Velocity + patterns (only if we have an identifier)
  if (idQuery) {
    const tenMinAgo = nowSec - WIN_10M;
    const thirtyMinAgo = nowSec - WIN_30M;
    const oneHourAgo = nowSec - WIN_1H;
    const oneDayAgo = nowSec - WIN_24H;

    const filter10m = { ...idQuery, created: { $gte: tenMinAgo } };
    const filter30m = { ...idQuery, created: { $gte: thirtyMinAgo } };
    const filter1h = { ...idQuery, created: { $gte: oneHourAgo } };
    const filter1d = { ...idQuery, created: { $gte: oneDayAgo } };

    const [cnt10m, cnt30m, cnt1h, cnt1d] = await Promise.all([
      txCol.countDocuments(filter10m),
      txCol.countDocuments(filter30m),
      txCol.countDocuments(filter1h),
      txCol.countDocuments(filter1d),
    ]);

    features.cnt10m = cnt10m;
    features.cnt30m = cnt30m;
    features.cnt1h = cnt1h;
    features.cnt1d = cnt1d;

    // Velocity scoring (10m)
    if (cnt10m >= 8)
      add("VELOCITY_10M_HIGH", 40, `${cnt10m} tx in 10m for ${idLabel}`);
    else if (cnt10m >= 5)
      add("VELOCITY_10M_MED", 25, `${cnt10m} tx in 10m for ${idLabel}`);
    else if (cnt10m >= 3)
      add("VELOCITY_10M_LOW", 15, `${cnt10m} tx in 10m for ${idLabel}`);

    // Velocity scoring (1h)
    if (cnt1h >= 21)
      add("VELOCITY_1H_HIGH", 40, `${cnt1h} tx in 1h for ${idLabel}`);
    else if (cnt1h >= 11)
      add("VELOCITY_1H_MED", 25, `${cnt1h} tx in 1h for ${idLabel}`);
    else if (cnt1h >= 6)
      add("VELOCITY_1H_LOW", 15, `${cnt1h} tx in 1h for ${idLabel}`);

    // Amount velocity (1h)
    const agg = await txCol
      .aggregate([
        { $match: filter1h },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
            minAmt: { $min: "$amount" },
            maxAmt: { $max: "$amount" },
          },
        },
      ])
      .toArray();

    const total1h = agg?.[0]?.total ?? 0;
    const minAmt = agg?.[0]?.minAmt ?? null;
    const maxAmt = agg?.[0]?.maxAmt ?? null;

    features.totalAmount1h = total1h;
    features.minAmt1h = minAmt;
    features.maxAmt1h = maxAmt;

    // thresholds in cents
    if (total1h >= 100000)
      add(
        "AMOUNT_VELOCITY_1H_1000",
        35,
        `Total $${(total1h / 100).toFixed(2)} in 1h for ${idLabel}`
      );
    else if (total1h >= 50000)
      add(
        "AMOUNT_VELOCITY_1H_500",
        20,
        `Total $${(total1h / 100).toFixed(2)} in 1h for ${idLabel}`
      );
    else if (total1h >= 20000)
      add(
        "AMOUNT_VELOCITY_1H_200",
        10,
        `Total $${(total1h / 100).toFixed(2)} in 1h for ${idLabel}`
      );

    // Card testing: 3+ small (<= $5) + a larger (>= $20) in 1h
    const recentDocs = await txCol
      .find(filter1h, { projection: { amount: 1, status: 1, created: 1 } })
      .sort({ created: -1 })
      .limit(60)
      .toArray();

    const smallCount = recentDocs.filter(
      (d) => typeof d.amount === "number" && d.amount <= 500
    ).length;
    const hasLarge = recentDocs.some(
      (d) => typeof d.amount === "number" && d.amount >= 2000
    );

    features.smallCount1h = smallCount;
    features.hasLarge1h = hasLarge;

    if (smallCount >= 3 && hasLarge) {
      add(
        "CARD_TESTING_PATTERN",
        30,
        `${smallCount} small tx (<= $5) + a larger tx (>= $20) in last hour for ${idLabel}`
      );
    }

    // Retries then success (30m) - will work once you store failed statuses
    const docs30m = await txCol
      .find(filter30m, { projection: { status: 1 } })
      .toArray();

    const failCount = docs30m.filter((d) =>
      ["failed", "requires_payment_method", "canceled"].includes(d.status)
    ).length;

    features.failCount30m = failCount;

    if (failCount >= 3 && tx.status === "succeeded") {
      add(
        "RETRIES_THEN_SUCCESS",
        25,
        `${failCount} failed/retry-like statuses in 30m then succeeded for ${idLabel}`
      );
    }
  } else {
    features.noIdentifier = true;
  }

  // Verification checks
  const cvc = tx?.checks?.cvc_check ?? null;
  const line1 = tx?.checks?.address_line1_check ?? null;
  const postal = tx?.checks?.address_postal_code_check ?? null;

  if (cvc === "fail") add("CVC_FAIL", 30, "CVC check failed");
  else if (cvc === "unchecked") add("CVC_UNCHECKED", 10, "CVC unchecked");
  else if (cvc === null) add("CVC_MISSING", 5, "CVC check missing");

  if (postal === "fail") add("POSTAL_FAIL", 20, "Postal code check failed");
  if (line1 === "fail") add("ADDR_LINE1_FAIL", 10, "Address line1 check failed");
  if (postal === null && line1 === null)
    add("ADDR_CHECKS_MISSING", 3, "Address checks missing");

  // Country mismatch
  const cardCountry = tx?.card?.country ?? null;
  const shipCountry = tx?.shipping_country ?? null;
  const billCountry = tx?.billing_country ?? null;

  if (cardCountry && shipCountry && cardCountry !== shipCountry) {
    add(
      "COUNTRY_MISMATCH_CARD_SHIP",
      15,
      `Card country ${cardCountry} != shipping country ${shipCountry}`
    );
  }
  if (cardCountry && billCountry && cardCountry !== billCountry) {
    add(
      "COUNTRY_MISMATCH_CARD_BILL",
      10,
      `Card country ${cardCountry} != billing country ${billCountry}`
    );
  }

  score = clamp(score, 0, 100);

  const flags = {
    disagree_with_stripe: tx?.risk?.level === "normal" && score >= 70,
  };

  return {
    score,
    label: labelFromScore(score),
    reasons,
    features,
    flags,
    version: "rules_v1",
    computedAt: new Date(),
  };
}

/**
 * Claim one transaction that needs summary.
 * Uses returnDocument + includeResultMetadata to handle driver differences.
 */
async function claimOne(txCol) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_MS);

  const filter = {
    summary_needed: true,
    $or: [
      { summary_in_progress: { $ne: true } },
      { summary_claimedAt: { $lt: staleBefore } },
    ],
  };

  const update = {
    $set: {
      summary_in_progress: true,
      summary_claimedAt: now,
    },
  };

  let res;
  try {
    res = await txCol.findOneAndUpdate(filter, update, {
      sort: { updatedAt: -1 },
      returnDocument: "after",
      includeResultMetadata: true,
    });
  } catch (e) {
    res = await txCol.findOneAndUpdate(filter, update, {
      sort: { updatedAt: -1 },
      returnOriginal: false,
    });
  }

  if (!res) return null;
  if (typeof res === "object" && "value" in res) return res.value;
  if (res && res._id) return res;
  return null;
}

/**
 * Generate summary from OpenAI based on tailored instruction.
 */
async function generateSummary(tx) {
  const summaryInput = buildSummaryInput(tx);
  const systemPrompt = buildSystemPrompt(tx);

  const response = await openai.responses.create({
    model: "gpt-4.1",
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Transaction data:\n${JSON.stringify(summaryInput, null, 2)}`,
      },
    ],
  });

  return {
    summaryText: (response.output_text || "").trim(),
    modelUsed: response.model || "gpt-4.1",
  };
}

async function ensureIndexes(txCol) {
  // Helps velocity lookups
  await txCol.createIndex({ "card.fingerprint": 1, created: -1 });
  await txCol.createIndex({ "card.brand": 1, "card.last4": 1, created: -1 });

  // Worker queue / locking
  await txCol.createIndex({ summary_needed: 1, updatedAt: -1 });
  await txCol.createIndex({ summary_in_progress: 1 });
  await txCol.createIndex({ summary_claimedAt: 1 });
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log("✅ Worker connected to MongoDB");

  const db = client.db(MONGODB_DB);
  const txCol = db.collection("transactions");

  await ensureIndexes(txCol);

  while (true) {
    let tx = null;

    try {
      tx = await claimOne(txCol);
    } catch (e) {
      console.error("❌ claimOne failed:", e?.message || e);
      await sleep(2000);
      continue;
    }

    if (!tx) {
      await sleep(LOOP_SLEEP_MS);
      continue;
    }

    try {
      console.log(
        `🧾 Claimed tx: ${tx._id} (${tx.last_event_type || "unknown_event"})`
      );

      // 1) compute + store internal risk (rules_v1)
      const internalRisk = await computeInternalRisk(tx, txCol);
      await txCol.updateOne(
        { _id: tx._id },
        {
          $set: {
            internalRisk,
            internalRisk_updatedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      // Refresh tx so the summary includes internalRisk + latest fields
      tx = await txCol.findOne({ _id: tx._id });

      // 1b) compute + store ML score (baseline)
      try {
        const ml = await scoreWithModel(tx);
        await txCol.updateOne(
          { _id: tx._id },
          {
            $set: { ml, ml_scoredAt: new Date(), updatedAt: new Date() },
            $unset: { ml_last_error: "" },
          }
        );
        // Refresh again so GPT sees ml
        tx = await txCol.findOne({ _id: tx._id });
      } catch (e) {
        await txCol.updateOne(
          { _id: tx._id },
          { $set: { ml_last_error: e.message, updatedAt: new Date() } }
        );
      }

      // 2) Generate summary with tailored instruction
      const { summaryText, modelUsed } = await generateSummary(tx);

      // 3) Store summary + clear queue flags
      await txCol.updateOne(
        { _id: tx._id },
        {
          $set: {
            summary: summaryText,
            summary_model: modelUsed,
            summary_updatedAt: new Date(),
            summary_needed: false,
            summary_in_progress: false,
            updatedAt: new Date(),
          },
          $unset: { summary_last_error: "" },
        }
      );

      console.log(`✅ Summarized tx: ${tx._id}`);
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`❌ Summary/risk failed for ${tx._id}:`, msg);

      // Always unlock on failure, record why
      await txCol.updateOne(
        { _id: tx._id },
        {
          $set: {
            summary_in_progress: false,
            summary_last_error: msg,
            updatedAt: new Date(),
          },
          $inc: { summary_failures: 1 },
        }
      );

      await sleep(1000);
    }
  }
}

main().catch((e) => {
  console.error("❌ Fatal worker error:", e);
  process.exit(1);
});

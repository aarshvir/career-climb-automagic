// supabase/functions/_shared/core.ts
var ApiError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message), this.status = status, this.code = code;
  }
};
var PASS = {
  product: "jobvance_ten_pack_v1",
  amount: 2900,
  currency: "usd",
  credits: 10,
  days: 30
};
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function objectInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "INVALID_INPUT", "A JSON object is required.");
  return value;
}
function uuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new ApiError(400, "INVALID_INPUT", `${label} must be a UUID.`);
  return value.toLowerCase();
}
var STOP = new Set("the and for are you your with will this that from have has our their they them into who can all about work working role candidate candidates job company team teams opportunity responsibilities required requirements qualification qualifications looking seek seeking experience years year strong excellent ability skills including include must should preferred provide also such each across join position apply career successful success professional professionals".split(" "));
function billingConfiguration(get) {
  if (get("JOBVANCE_BILLING_ENABLED") !== "true") return null;
  const mode = get("JOBVANCE_BILLING_MODE");
  const provider = get("JOBVANCE_PAYMENT_PROVIDER") ?? "paddle";
  if (provider !== "paddle" && provider !== "stripe") return null;
  const secretKey = get(provider === "paddle" ? "PADDLE_API_KEY" : "STRIPE_SECRET_KEY") ?? "";
  const webhookSecret = get(provider === "paddle" ? "PADDLE_WEBHOOK_SECRET" : "STRIPE_WEBHOOK_SECRET") ?? "";
  const priceId = get("PADDLE_PRICE_ID") ?? "";
  const appUrl = get("APP_URL") ?? "";
  if (mode !== "test" && mode !== "live") return null;
  if (provider === "stripe" && (!secretKey.startsWith(mode === "test" ? "sk_test_" : "sk_live_") || !webhookSecret.startsWith("whsec_"))) return null;
  if (provider === "paddle" && (!secretKey.startsWith(mode === "test" ? "pdl_sdbx_apikey_" : "pdl_live_apikey_") || webhookSecret.length < 16 || webhookSecret.length > 512 || !/^pri_[a-z\d]{26}$/.test(priceId))) return null;
  if (mode === "live" && (get("JOBVANCE_LIVE_BILLING_REVIEWED") !== "true" || get("JOBVANCE_COMMERCIAL_TERMS_REVIEWED") !== "true" || get("JOBVANCE_SELLER_ELIGIBILITY_REVIEWED") !== "true" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get("SUPPORT_EMAIL") ?? "") || provider === "paddle" && get("JOBVANCE_PADDLE_MERCHANT_APPROVAL_REVIEWED") !== "true")) return null;
  try {
    const url = new URL(appUrl);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.protocol !== "https:" && !(mode === "test" && url.protocol === "http:" && [
      "localhost",
      "127.0.0.1"
    ].includes(url.hostname))) return null;
    return provider === "paddle" ? {
      provider,
      mode,
      secretKey,
      webhookSecret,
      appUrl: url.origin,
      priceId
    } : {
      provider,
      mode,
      secretKey,
      webhookSecret,
      appUrl: url.origin
    };
  } catch {
    return null;
  }
}
function paymentMetadata(value) {
  const metadata = objectInput(value);
  if (metadata.product !== PASS.product) throw new ApiError(400, "INVALID_PAYMENT", "Unknown payment product.");
  return {
    userId: uuid(metadata.user_id, "Payment user"),
    requestId: uuid(metadata.request_id, "Payment request")
  };
}
function isPassMetadata(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && value.product === PASS.product;
}

// supabase/functions/_shared/paddle.ts
var PADDLE_TRANSACTION_ID = /^txn_[a-z\d]{26}$/;
var PADDLE_EVENT_ID = /^evt_[a-z\d]{26}$/;
var PADDLE_ADJUSTMENT_ID = /^adj_[a-z\d]{26}$/;
function validatePaddlePrice(value, expectedId) {
  const price = objectInput(value);
  const amount = objectInput(price.unit_price);
  if (price.id !== expectedId || price.status !== "active" || price.billing_cycle !== null || price.trial_period !== null || price.tax_mode !== "external" || amount.amount !== String(PASS.amount) || amount.currency_code !== "USD" || Array.isArray(price.unit_price_overrides) && price.unit_price_overrides.length > 0) {
    throw new ApiError(503, "INVALID_PASS_PRICE", "The configured pass must be a one-time USD $29 price before applicable tax.");
  }
  return price;
}
function validatePaddleTransaction(value, priceId, requireCompleted = true) {
  const transaction = objectInput(value);
  if (typeof transaction.id !== "string" || !PADDLE_TRANSACTION_ID.test(transaction.id) || transaction.currency_code !== "USD" || transaction.collection_mode !== "automatic" || transaction.subscription_id !== null || requireCompleted && transaction.status !== "completed" || !Array.isArray(transaction.items) || transaction.items.length !== 1) {
    throw new ApiError(400, "INVALID_PAYMENT", "The transaction does not match this one-time pass.");
  }
  const item = objectInput(transaction.items[0]);
  if (item.quantity !== 1) throw new ApiError(400, "INVALID_PAYMENT", "The transaction quantity does not match this pass.");
  validatePaddlePrice(item.price, priceId);
  const details = objectInput(transaction.details);
  const totals = objectInput(details.totals);
  if (totals.subtotal !== String(PASS.amount) || totals.discount !== "0" || totals.currency_code !== "USD" || !Array.isArray(details.line_items) || details.line_items.length !== 1) throw new ApiError(400, "INVALID_PAYMENT", "The transaction total does not match this pass.");
  const line = objectInput(details.line_items[0]);
  const lineTotals = objectInput(line.totals);
  if (line.price_id !== priceId || line.quantity !== 1 || lineTotals.subtotal !== String(PASS.amount) || lineTotals.discount !== "0") throw new ApiError(400, "INVALID_PAYMENT", "The paid line item does not match this pass.");
  return {
    transactionId: transaction.id,
    ...paymentMetadata(transaction.custom_data)
  };
}
function validateApprovedPaddleRefund(value, transactionId) {
  const adjustment = objectInput(value);
  const totals = objectInput(adjustment.totals);
  if (typeof adjustment.id !== "string" || !PADDLE_ADJUSTMENT_ID.test(adjustment.id) || adjustment.transaction_id !== transactionId || adjustment.action !== "refund" || adjustment.status !== "approved" || adjustment.currency_code !== "USD" || totals.currency_code !== "USD" || typeof totals.subtotal !== "string" || !/^\d+$/.test(totals.subtotal)) throw new ApiError(400, "INVALID_REFUND", "The refund context could not be verified.");
  const amount = Number(totals.subtotal);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > PASS.amount) throw new ApiError(400, "INVALID_REFUND", "The refund does not match this pass.");
  return amount;
}
async function verifyPaddleSignature(raw, header, secret, now = Math.floor(Date.now() / 1e3)) {
  if (!header || raw.length > 262144) throw new ApiError(400, "BAD_SIGNATURE", "Invalid payment signature.");
  const parts = header.split(";").map((part) => part.trim().split("="));
  const times = parts.filter(([name]) => name === "ts");
  const signatures = parts.filter(([name, value]) => name === "h1" && /^[0-9a-f]{64}$/i.test(value ?? "")).map(([, value]) => value.toLowerCase());
  const timestamp = times.length === 1 && /^\d{1,12}$/.test(times[0][1] ?? "") ? Number(times[0][1]) : NaN;
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 5 || signatures.length === 0) throw new ApiError(400, "BAD_SIGNATURE", "Invalid or expired payment signature.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}:${raw}`));
  const expected = [
    ...new Uint8Array(digest)
  ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const valid = signatures.some((signature) => {
    let difference = 0;
    for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    return difference === 0;
  });
  if (!valid) throw new ApiError(400, "BAD_SIGNATURE", "Invalid payment signature.");
}

// supabase/functions/_shared/runtime.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
var env = (name) => Deno.env.get(name);
var getBilling = () => billingConfiguration(env);
function required(name) {
  const value = env(name);
  if (!value) throw new ApiError(503, "NOT_CONFIGURED", "The service is not configured yet.");
  return value;
}
function adminClient() {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
function cors(req) {
  const origin = req.headers.get("Origin");
  const allowed = (env("ALLOWED_ORIGINS") ?? env("APP_URL") ?? "").split(",").map((value) => {
    try {
      return new URL(value.trim()).origin;
    } catch {
      return "";
    }
  }).filter(Boolean);
  return {
    ...origin && allowed.includes(origin) ? {
      "Access-Control-Allow-Origin": origin
    } : {},
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}
function json(req, value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
async function boundedBody(req, max) {
  const declared = Number(req.headers.get("Content-Length") ?? 0);
  if (declared > max) throw new ApiError(413, "INPUT_TOO_LARGE", "Request is too large.");
  if (!req.body) throw new ApiError(400, "INVALID_INPUT", "Request body is missing.");
  const reader = req.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(413, "INPUT_TOO_LARGE", "Request is too large.");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  return new TextDecoder("utf-8", {
    fatal: true
  }).decode(bytes);
}
function databaseError(error) {
  if (!error) return;
  const known = [
    [
      "NO_CREDITS",
      402,
      "You have used your available packs."
    ],
    [
      "REQUEST_CONFLICT",
      409,
      "This request ID was already used for different inputs. Start a new request."
    ],
    [
      "CV_NOT_FOUND",
      404,
      "That CV is unavailable. Upload or select your own CV."
    ],
    [
      "CV_CHANGED",
      409,
      "The CV changed while the pack was being created. Try again."
    ],
    [
      "INVALID_PACK",
      400,
      "The pack request is invalid."
    ],
    [
      "CHECKOUT_LIMIT",
      429,
      "Too many new checkout requests. Try again tomorrow or reuse your existing checkout."
    ]
  ];
  for (const [code, status, message] of known) if (error.message.includes(code)) throw new ApiError(status, code, message);
  throw new ApiError(503, "PERSISTENCE_FAILED", "The request could not be saved. Try again.");
}
function serve(handler) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: cors(req)
    });
    if (req.method !== "POST") return json(req, {
      error: "Use POST.",
      code: "METHOD_NOT_ALLOWED"
    }, 405);
    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof ApiError) return json(req, {
        error: error.message,
        code: error.code
      }, error.status);
      console.error("jobvance_function_failed", {
        type: error instanceof Error ? error.name : "UnknownError"
      });
      return json(req, {
        error: "The service could not complete this request. Try again.",
        code: "SERVICE_ERROR"
      }, 503);
    }
  });
}
async function paddleRequest(config, endpoint, body) {
  const origin = config.mode === "test" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const response = await fetch(`${origin}/${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Paddle-Version": "1",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : void 0,
    signal: AbortSignal.timeout(15e3)
  });
  if (!response.ok) throw new ApiError(503, "PAYMENT_PROVIDER_ERROR", "Checkout is temporarily unavailable. Retry with the same request or contact support if it needs recovery.");
  const result = await response.json();
  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) throw new ApiError(503, "INVALID_PAYMENT_RESPONSE", "The payment response could not be verified.");
  return result.data;
}

// supabase/functions/paddle-webhook/index.ts
serve(async (req) => {
  const billing = getBilling();
  if (!billing || billing.provider !== "paddle") throw new ApiError(503, "BILLING_UNAVAILABLE", "Paddle payment processing is disabled.");
  const raw = await boundedBody(req, 262144);
  await verifyPaddleSignature(raw, req.headers.get("Paddle-Signature"), billing.webhookSecret);
  let event;
  try {
    event = objectInput(JSON.parse(raw));
  } catch {
    throw new ApiError(400, "INVALID_PAYMENT_EVENT", "Invalid payment event.");
  }
  const occurred = typeof event.occurred_at === "string" ? Date.parse(event.occurred_at) : NaN;
  if (typeof event.event_id !== "string" || !PADDLE_EVENT_ID.test(event.event_id) || !Number.isFinite(occurred)) throw new ApiError(400, "INVALID_PAYMENT_EVENT", "Payment event cannot be verified.");
  if (event.event_type !== "transaction.completed" && event.event_type !== "adjustment.created" && event.event_type !== "adjustment.updated") return json(req, {
    received: true,
    ignored: true
  });
  const item = objectInput(event.data);
  const action = event.event_type === "transaction.completed" ? "paid" : "refund";
  let transaction;
  if (action === "paid") {
    if (!isPassMetadata(item.custom_data)) return json(req, {
      received: true,
      ignored: true
    });
    transaction = item;
  } else {
    if (item.action !== "refund" || item.status !== "approved") return json(req, {
      received: true,
      ignored: true
    });
    if (typeof item.transaction_id !== "string" || !PADDLE_TRANSACTION_ID.test(item.transaction_id)) throw new ApiError(400, "INVALID_REFUND", "The refund transaction cannot be verified.");
    transaction = await paddleRequest(billing, `transactions/${item.transaction_id}`);
    if (!isPassMetadata(transaction.custom_data)) return json(req, {
      received: true,
      ignored: true
    });
  }
  const verified = validatePaddleTransaction(transaction, billing.priceId);
  const refundAmount = action === "refund" ? validateApprovedPaddleRefund(item, verified.transactionId) : 0;
  const admin = adminClient();
  const { data: order, error: orderError } = await admin.from("billing_orders").select("id").eq("user_id", verified.userId).eq("request_id", verified.requestId).eq("provider", "paddle").eq("billing_mode", billing.mode).eq("payment_intent", `paddle_${verified.transactionId}`).maybeSingle();
  databaseError(orderError);
  if (!order) throw new ApiError(409, "UNBOUND_PAYMENT", "This transaction is not bound to a verified checkout order.");
  const { data: result, error } = await admin.rpc("jobvance_apply_payment_event", {
    p_event_id: `paddle_${event.event_id}`,
    p_event_type: event.event_type,
    p_event_created: Math.floor(occurred / 1e3),
    p_action: action,
    p_user_id: verified.userId,
    p_request_id: verified.requestId,
    p_payment_intent: `paddle_${verified.transactionId}`,
    p_session_id: action === "paid" ? verified.transactionId : null,
    p_refund_amount: refundAmount,
    p_provider: "paddle",
    p_billing_mode: billing.mode,
    p_refund_id: action === "refund" ? `paddle_${item.id}` : null
  });
  databaseError(error);
  return json(req, {
    received: true,
    duplicate: result?.duplicate ?? false
  });
});

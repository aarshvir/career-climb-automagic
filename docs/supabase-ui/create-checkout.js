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

// supabase/functions/_shared/paddle.ts
var PADDLE_TRANSACTION_ID = /^txn_[a-z\d]{26}$/;
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
async function authenticatedClient(req) {
  const header = req.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(match[1]);
  if (error || !data.user) throw new ApiError(401, "UNAUTHORIZED", "Your session has expired. Sign in again.");
  return {
    admin,
    user: data.user
  };
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
async function readJson(req) {
  if (!req.headers.get("Content-Type")?.toLowerCase().includes("application/json")) throw new ApiError(415, "INVALID_INPUT", "Use application/json.");
  const raw = await boundedBody(req, 18e4);
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "INVALID_INPUT", "Invalid JSON.");
  }
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
async function stripeRequest(config, endpoint, form, idempotencyKey) {
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Stripe-Version": "2024-06-20",
      ...form ? {
        "Content-Type": "application/x-www-form-urlencoded"
      } : {},
      ...idempotencyKey ? {
        "Idempotency-Key": idempotencyKey
      } : {}
    },
    body: form?.toString(),
    signal: AbortSignal.timeout(15e3)
  });
  if (!response.ok) throw new ApiError(503, "PAYMENT_PROVIDER_ERROR", "Payment processing is temporarily unavailable. Retry with the same request.");
  return await response.json();
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

// supabase/functions/create-checkout/index.ts
serve(async (req) => {
  const { admin, user } = await authenticatedClient(req);
  const billing = getBilling();
  if (!billing) throw new ApiError(503, "BILLING_UNAVAILABLE", "Payments are not enabled yet.");
  const requestId = uuid(objectInput(await readJson(req)).requestId, "Request ID");
  if (billing.provider === "paddle") validatePaddlePrice(await paddleRequest(billing, `prices/${billing.priceId}`), billing.priceId);
  const { data: order, error } = await admin.rpc("jobvance_begin_checkout", {
    p_user_id: user.id,
    p_request_id: requestId,
    p_provider: billing.provider,
    p_billing_mode: billing.mode
  });
  databaseError(error);
  if (order.status !== "created") throw new ApiError(409, "CHECKOUT_FINISHED", "This checkout was already completed. Refresh your pack balance.");
  if (billing.provider === "paddle") {
    let transaction;
    if (order.checkout_session_id) transaction = await paddleRequest(billing, `transactions/${order.checkout_session_id}`);
    else {
      if (!order.creationClaimAcquired) throw new ApiError(409, "CHECKOUT_RECOVERY_REQUIRED", "This checkout is still being prepared or needs recovery. Retry shortly; if it remains unavailable, start a new checkout or contact support.");
      transaction = await paddleRequest(billing, "transactions", {
        collection_mode: "automatic",
        currency_code: "USD",
        items: [
          {
            price_id: billing.priceId,
            quantity: 1
          }
        ],
        custom_data: {
          user_id: user.id,
          request_id: requestId,
          product: PASS.product
        }
      });
    }
    const verified = validatePaddleTransaction(transaction, billing.priceId, false);
    if (verified.userId !== user.id || verified.requestId !== requestId) throw new ApiError(409, "REQUEST_CONFLICT", "The checkout identity does not match this request.");
    if (transaction.status !== "draft" && transaction.status !== "ready") throw new ApiError(409, "CHECKOUT_FINISHED", "This checkout is no longer open. Refresh your pack balance or start a new checkout.");
    const { error: savedError2 } = await admin.rpc("jobvance_finish_checkout", {
      p_user_id: user.id,
      p_request_id: requestId,
      p_session_id: verified.transactionId,
      p_url: null,
      p_expires_at: null,
      p_provider: billing.provider,
      p_billing_mode: billing.mode
    });
    databaseError(savedError2);
    return json(req, {
      provider: "paddle",
      transactionId: verified.transactionId,
      billingMode: billing.mode
    });
  }
  if (order.checkout_url) {
    if (Date.parse(order.checkout_expires_at) <= Date.now()) throw new ApiError(409, "CHECKOUT_EXPIRED", "This checkout expired. Start a new checkout.");
    return json(req, {
      provider: "stripe",
      url: order.checkout_url,
      sessionId: order.checkout_session_id,
      billingMode: billing.mode
    });
  }
  const form = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    client_reference_id: user.id,
    success_url: `${billing.appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${billing.appUrl}/dashboard?checkout=cancelled`,
    "line_items[0][price_data][currency]": PASS.currency,
    "line_items[0][price_data][unit_amount]": String(PASS.amount),
    "line_items[0][price_data][product_data][name]": "Jobvance: 10 application packs, valid 30 days",
    "line_items[0][quantity]": "1"
  });
  for (const [name, value] of Object.entries({
    user_id: user.id,
    request_id: requestId,
    product: PASS.product
  })) {
    form.set(`metadata[${name}]`, value);
    form.set(`payment_intent_data[metadata][${name}]`, value);
  }
  const session = await stripeRequest(billing, "checkout/sessions", form, `jobvance:${user.id}:${requestId}`);
  if (typeof session.id !== "string" || typeof session.url !== "string" || typeof session.expires_at !== "number" || session.livemode !== (billing.mode === "live")) throw new ApiError(503, "INVALID_PAYMENT_SESSION", "The checkout session could not be verified.");
  const { error: savedError } = await admin.rpc("jobvance_finish_checkout", {
    p_user_id: user.id,
    p_request_id: requestId,
    p_session_id: session.id,
    p_url: session.url,
    p_expires_at: new Date(session.expires_at * 1e3).toISOString(),
    p_provider: billing.provider,
    p_billing_mode: billing.mode
  });
  databaseError(savedError);
  return json(req, {
    provider: "stripe",
    url: session.url,
    sessionId: session.id,
    billingMode: billing.mode
  });
});

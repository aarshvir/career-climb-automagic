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
async function verifyStripeSignature(raw, header, secret, now = Math.floor(Date.now() / 1e3)) {
  if (!header || raw.length > 262144) throw new ApiError(400, "BAD_SIGNATURE", "Invalid payment signature.");
  const parts = header.split(",").map((part) => part.split("="));
  const timestamps = parts.filter(([name]) => name === "t");
  const signatures = parts.filter(([name, value]) => name === "v1" && /^[0-9a-f]{64}$/i.test(value ?? "")).map(([, value]) => value.toLowerCase());
  const timestamp = timestamps.length === 1 && /^\d{1,12}$/.test(timestamps[0][1] ?? "") ? Number(timestamps[0][1]) : NaN;
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300 || signatures.length === 0) throw new ApiError(400, "BAD_SIGNATURE", "Invalid or expired payment signature.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`));
  const expected = [
    ...new Uint8Array(bytes)
  ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const matches = signatures.some((signature) => {
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    return difference === 0;
  });
  if (!matches) throw new ApiError(400, "BAD_SIGNATURE", "Invalid payment signature.");
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

// supabase/functions/stripe-webhook/index.ts
serve(async (req) => {
  const billing = getBilling();
  if (!billing || billing.provider !== "stripe") throw new ApiError(503, "BILLING_UNAVAILABLE", "Stripe payment processing is disabled.");
  const raw = await boundedBody(req, 262144);
  await verifyStripeSignature(raw, req.headers.get("stripe-signature"), billing.webhookSecret);
  let event;
  try {
    event = objectInput(JSON.parse(raw));
  } catch {
    throw new ApiError(400, "INVALID_PAYMENT_EVENT", "Invalid payment event.");
  }
  if (typeof event.id !== "string" || !/^evt_[A-Za-z0-9]+$/.test(event.id) || !Number.isSafeInteger(event.created) || event.livemode !== (billing.mode === "live")) throw new ApiError(400, "INVALID_PAYMENT_EVENT", "Payment event cannot be verified.");
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded" && event.type !== "charge.refunded") return json(req, {
    received: true,
    ignored: true
  });
  const data = objectInput(event.data);
  const item = objectInput(data.object);
  let metadata;
  let paymentIntent;
  let sessionId = null;
  let refundAmount = 0;
  const action = event.type === "charge.refunded" ? "refund" : "paid";
  if (action === "paid") {
    if (item.payment_status !== "paid") return json(req, {
      received: true,
      ignored: true
    });
    if (!isPassMetadata(item.metadata)) return json(req, {
      received: true,
      ignored: true
    });
    if (item.mode !== "payment" || item.amount_total !== PASS.amount || item.currency !== PASS.currency || typeof item.payment_intent !== "string" || typeof item.id !== "string") throw new ApiError(400, "INVALID_PAYMENT", "Payment does not match this pass.");
    metadata = paymentMetadata(item.metadata);
    paymentIntent = item.payment_intent;
    sessionId = item.id;
  } else {
    if (typeof item.payment_intent !== "string") return json(req, {
      received: true,
      ignored: true
    });
    paymentIntent = item.payment_intent;
    if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntent)) throw new ApiError(400, "INVALID_PAYMENT", "Invalid payment reference.");
    const intent = await stripeRequest(billing, `payment_intents/${paymentIntent}`);
    if (!isPassMetadata(intent.metadata)) return json(req, {
      received: true,
      ignored: true
    });
    metadata = paymentMetadata(intent.metadata);
    if (item.amount !== PASS.amount || item.currency !== PASS.currency || intent.amount !== PASS.amount || intent.currency !== PASS.currency || !Number.isSafeInteger(item.amount_refunded) || Number(item.amount_refunded) < 1 || Number(item.amount_refunded) > PASS.amount) throw new ApiError(400, "INVALID_PAYMENT", "Refund does not match this pass.");
    refundAmount = Number(item.amount_refunded);
  }
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntent) || sessionId && !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new ApiError(400, "INVALID_PAYMENT", "Invalid payment reference.");
  const { data: result, error } = await adminClient().rpc("jobvance_apply_payment_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: event.created,
    p_action: action,
    p_user_id: metadata.userId,
    p_request_id: metadata.requestId,
    p_payment_intent: paymentIntent,
    p_session_id: sessionId,
    p_refund_amount: refundAmount,
    p_provider: billing.provider,
    p_billing_mode: billing.mode
  });
  databaseError(error);
  return json(req, {
    received: true,
    duplicate: result?.duplicate ?? false
  });
});

// supabase/functions/_shared/runtime.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// supabase/functions/_shared/core.ts
var ApiError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message), this.status = status, this.code = code;
  }
};
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

// supabase/functions/_shared/runtime.ts
var env = (name) => Deno.env.get(name);
var getBilling = () => billingConfiguration(env);
var configuredBillingMode = () => env("JOBVANCE_BILLING_MODE") === "live" ? "live" : "test";
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

// supabase/functions/get-entitlement/index.ts
serve(async (req) => {
  const { admin, user } = await authenticatedClient(req);
  const { data, error } = await admin.rpc("jobvance_get_entitlement", {
    p_user_id: user.id,
    p_billing_mode: configuredBillingMode()
  });
  databaseError(error);
  const billing = getBilling();
  return json(req, {
    ...data,
    billingConfigured: !!billing,
    billingMode: billing?.mode ?? null,
    paymentProvider: billing?.provider ?? null
  });
});

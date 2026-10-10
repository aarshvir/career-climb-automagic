// supabase/functions/_shared/core.ts
var ApiError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message), this.status = status, this.code = code;
  }
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
function boundedText(value, label, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max || value.includes("\0")) {
    throw new ApiError(400, "INVALID_INPUT", `${label} must contain ${min}\u2013${max} characters.`);
  }
  return value.trim();
}
function validateTailorInput(value) {
  const body = objectInput(value);
  let jobUrl = null;
  if (body.jobUrl !== null && body.jobUrl !== void 0 && body.jobUrl !== "") {
    if (typeof body.jobUrl !== "string" || body.jobUrl.length > 2e3) throw new ApiError(400, "INVALID_INPUT", "Job URL is invalid.");
    try {
      const parsed = new URL(body.jobUrl);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error();
      jobUrl = parsed.href;
    } catch {
      throw new ApiError(400, "INVALID_INPUT", "Use a valid HTTPS job URL.");
    }
  }
  return {
    resumeId: uuid(body.resumeId, "Resume ID"),
    requestId: uuid(body.requestId, "Request ID"),
    jobTitle: boundedText(body.jobTitle, "Job title", 1, 200),
    company: boundedText(body.company, "Company", 0, 200),
    jobUrl,
    jobDescription: boundedText(body.jobDescription, "Job description", 80, 2e4)
  };
}
var STOP = new Set("the and for are you your with will this that from have has our their they them into who can all about work working role candidate candidates job company team teams opportunity responsibilities required requirements qualification qualifications looking seek seeking experience years year strong excellent ability skills including include must should preferred provide also such each across join position apply career successful success professional professionals".split(" "));
function tokens(text) {
  return (text.toLowerCase().match(/\.net\b|[a-z][a-z0-9]*(?:[+#]{1,2})?(?:[.-][a-z0-9]+)*/g) ?? []).filter((word) => word.length >= 3 && !STOP.has(word));
}
function groundedTailor(original, description) {
  if (typeof original !== "string" || original.trim().length < 80 || original.length > 6e4 || original.includes("\0")) {
    throw new ApiError(422, "CV_NEEDS_REVIEW", "Review the extracted CV text before creating a pack (80\u201360000 characters).");
  }
  const counts = /* @__PURE__ */ new Map();
  for (const word of tokens(description)) counts.set(word, (counts.get(word) ?? 0) + 1);
  const vocabulary = [
    ...counts.keys()
  ].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b)).slice(0, 40);
  const existing = new Set(tokens(original));
  const matchedKeywords = vocabulary.filter((word) => existing.has(word));
  const missingKeywords = vocabulary.filter((word) => !existing.has(word));
  const relevant = new Set(matchedKeywords);
  const lines = original.replace(/\r\n?/g, "\n").split("\n");
  const bullet = /^\s*[-*•▪‣]\s+/;
  for (let start = 0; start < lines.length; start++) {
    if (!bullet.test(lines[start])) continue;
    let end = start + 1;
    while (end < lines.length && bullet.test(lines[end])) end++;
    const next = lines[end];
    if (next && (/^[ \t]+\S/.test(next) || !/^[A-Z][A-Z &/:-]{2,40}$/.test(next.trim()))) {
      start = end - 1;
      continue;
    }
    const ranked = lines.slice(start, end).map((line, index) => ({
      line,
      index,
      rank: [
        ...new Set(tokens(line))
      ].filter((word) => relevant.has(word)).length
    }));
    ranked.sort((a, b) => b.rank - a.rank || a.index - b.index);
    lines.splice(start, end - start, ...ranked.map((item) => item.line));
    start = end - 1;
  }
  return {
    originalText: original,
    tailoredText: lines.join("\n"),
    matchedKeywords,
    missingKeywords
  };
}
async function fingerprint(input, original) {
  const bytes = new TextEncoder().encode(JSON.stringify({
    ...input,
    original
  }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [
    ...new Uint8Array(digest)
  ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// supabase/functions/_shared/runtime.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
var env = (name) => Deno.env.get(name);
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

// supabase/functions/tailor-cv/index.ts
serve(async (req) => {
  const { admin, user } = await authenticatedClient(req);
  const input = validateTailorInput(await readJson(req));
  const { data: existing, error: existingError } = await admin.from("application_packs").select("*").eq("user_id", user.id).eq("request_id", input.requestId).maybeSingle();
  databaseError(existingError);
  if (existing) {
    if (existing.request_fingerprint !== await fingerprint(input, existing.original_text)) throw new ApiError(409, "REQUEST_CONFLICT", "This request ID was already used for different inputs. Start a new request.");
    return json(req, {
      pack: existing
    });
  }
  const { data: document, error } = await admin.from("cv_documents").select("id,text_content").eq("id", input.resumeId).eq("user_id", user.id).maybeSingle();
  databaseError(error);
  if (!document) return json(req, {
    error: "That CV is unavailable. Select your own CV.",
    code: "CV_NOT_FOUND"
  }, 404);
  const result = groundedTailor(document.text_content, input.jobDescription);
  const digest = await fingerprint(input, document.text_content);
  const { data: pack, error: savedError } = await admin.rpc("jobvance_create_pack", {
    p_user_id: user.id,
    p_resume_id: input.resumeId,
    p_request_id: input.requestId,
    p_fingerprint: digest,
    p_job_title: input.jobTitle,
    p_company: input.company,
    p_job_url: input.jobUrl,
    p_job_description: input.jobDescription,
    p_original_text: result.originalText,
    p_tailored_text: result.tailoredText,
    p_matched: result.matchedKeywords,
    p_missing: result.missingKeywords,
    p_billing_mode: configuredBillingMode()
  });
  databaseError(savedError);
  return json(req, {
    pack
  });
});

import { loadEnv } from "vite";
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const url = env.VITE_SUPABASE_URL,
  key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error(
    "Build blocked: configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the frontend build environment.",
  );
if (new URL(url).protocol !== "https:")
  throw new Error("Build blocked: production Supabase URL must use HTTPS.");
if (key.startsWith("sb_secret_"))
  throw new Error(
    "Build blocked: a server secret must never be published in VITE_ settings.",
  );
if (key.split(".").length === 3) {
  try {
    if (
      JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
        .role !== "anon"
    )
      throw new Error("privileged");
  } catch {
    throw new Error(
      "Build blocked: use a public Supabase key, never a privileged key.",
    );
  }
} else if (!key.startsWith("sb_publishable_"))
  throw new Error("Build blocked: the Supabase public key format is invalid.");
console.log("Frontend public configuration validated.");

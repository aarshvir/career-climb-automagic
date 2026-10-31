# Authentication module fixture for CI only

auth-js-2.71.1.mjs is the UNMODIFIED59,678-byte module from
https://esm.sh/@supabase/auth-js@2.71.1/denonext/auth-js.mjs .
Its SHA-256 a92d005e4a8a03063aa2c46d7d69161fa776ce1bacccc43daa70e28fe367068e
is the existing production worker deno.lock entry, not a newly accepted CDN response.

CI41209247747 first attempt and main CI41211152062 received different CDN bytes
(d55f6734...). An unchanged retry passed, but the issue recurred. This fixture
removes that one mutable CDN response from the cloud-auth TEST import graph.
scripts/check-cloud-auth.mjs verifies BOTH the original lock pin and fixture
bytes before starting Deno, then uses a temporary test-only import map. Existing
config imports are retained, Deno --frozen stays on, and the same28actual SDK
boundary tests run. Missing/corrupted fixtures or changed pins fail; no fallback,
cache patch, downloaded-code execution, new expected hash or skipped test.
The tracking suite keeps its existing npm mapping and frozen lock.

The module is self-contained and retains its exact source bytes. The adjacent
MIT license is from the installed matching @supabase/auth-js2.71.1 package.
Future SDK upgrades require deliberate review of the production pin and mirror.
No production function/source/config/lock, site runtime, auth behavior or audit
threshold changes. Full npm audit --audit-level=moderate remains blocking.

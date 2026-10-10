# Independent Jobvance publication

Jobvance is published independently of Lovable at its canonical address:

https://jobvance.io

The independent hosting address also remains available:

https://jobvance-io.clear-moon-9685.chatgpt.site

The complete application source is in this checkout and the existing GitHub repository:

https://github.com/aarshvir/career-climb-automagic

The initial independent publication used merged main commit `94ca69485385ec47c383af1025532e98e0d931aa`. The original Git history is preserved. Lovable's two-way repository synchronization was disconnected; the application has no active Lovable runtime, preview-auth broker or build dependency. Hosting uses a Cloudflare Worker through the Sites publisher. Supabase remains the existing independent authentication, database and private file backend.

## Domain cutover

The authoritative Hostinger DNS cutover was applied on 10 October 2026. Jobvance.io now serves the independently published application, and the new host has issued valid HTTPS certificates for the apex and www hostnames. The Worker redirects `www.jobvance.io` to `https://jobvance.io`, preserving the path and query, so authentication uses the existing approved canonical origin.

Apply these exact records returned for this hosting project; preserve MX, mail-verification TXT and other unrelated records. Keep the current nameservers.

| Type | Hostinger name | Value |
| --- | --- | --- |
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=Cpb5k92d4RSlb9ZvVoAQHCXo6sOOo8AjtMHu6rLpbA8 |
| TXT | _cf-custom-hostname | fae150cc-4f07-42be-995c-56b2ea2b34e8 |
| CNAME | www | custom-domains.chatgpt.site |
| TXT | _openai-site-verification.www | openai-site-verification=bRYzPXqUNQfK2GfS9CTw5rx9IxF3T90fzjpwryE5_Bs |
| TXT | _cf-custom-hostname.www | a74aadf6-e899-4608-861b-68d513bfc96e |

The old website A target `185.158.133.1` was replaced with the two A targets above. The old www A record was replaced with the CNAME above. There was no conflicting apex AAAA record. All pre-existing email, DKIM, SPF, DMARC and Supabase API records were retained, as were both Hostinger nameservers. Before/after DNS backups, screenshots and live verification results are retained privately in the adjacent `jobvance-repair-evidence` directory. The old Lovable project remains a recoverable source snapshot; it no longer receives traffic through these DNS records.

## Backend and verification

The actual published origin has been added to the function CORS allowlist; a live preflight confirms it is allowed. Exact `/auth/callback` and `/auth/reset` redirects are registered. The canonical Supabase Site URL remains `https://jobvance.io`, which was already approved. Old Lovable origins were removed from function CORS. Real-money billing remains explicitly disabled.

155 automated tests, frontend type checks and production build pass in the clean independent checkout. Hosted API verification passed 13 grouped checks using two private synthetic accounts, including upload, free-pack creation, approval/tracking, idempotency and isolation. Those fixtures are retained; no passwords, session tokens or private source backups are committed. See `HOSTED-API-VERIFICATION.md` for the exact scope. Public home/login pages and direct routes have been inspected. This does not claim owner Google sign-in, a complete signed-in browser journey or real payment success.

## Source and future releases

`.openai/hosting.json` retains the exact existing Site identity. Never register a second Site to update this publication. Use the official Sites source helper with a fresh short-lived source credential, passed only through hidden stdin, then save and deploy the matching archive. Credentials must never appear in files, command arguments or output. The complete source is also maintained on GitHub main; preserve Git history and verify the released commit.

The `.sites-runtime` folder is ignored local tooling used to work around Windows npm-launcher quoting. It is not an application dependency. The frontend remains a portable React/Vite application; build it with Node 24 or supported Node 22, `npm ci` and `npm run build`. Server payment/administrator secrets belong in Supabase and are never needed to build the public frontend.

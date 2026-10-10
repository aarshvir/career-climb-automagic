# Independent Jobvance publication

Jobvance is published independently of Lovable at:

https://jobvance-io.clear-moon-9685.chatgpt.site

The complete application source is in this checkout and the existing GitHub repository:

https://github.com/aarshvir/career-climb-automagic

The initial independent publication used merged main commit `94ca69485385ec47c383af1025532e98e0d931aa`. The original Git history is preserved. Lovable's two-way repository synchronization was disconnected; the application has no active Lovable runtime, preview-auth broker or build dependency. Hosting uses a Cloudflare Worker through the Sites publisher. Supabase remains the existing independent authentication, database and private file backend.

## Domain cutover

The domain is registered with the new host, but **Jobvance.io still points at Lovable** until the authoritative Hostinger records are changed and HTTPS verification succeeds. Hostinger sign-in is pending. Do not report the domain as migrated based on publication of the alternative URL.

Apply these exact records returned for this hosting project; preserve MX, mail-verification TXT and other unrelated records. Keep the current nameservers.

| Type | Hostinger name | Value |
| --- | --- | --- |
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=Cpb5k92d4RSlb9ZvVoAQHCXo6sOOo8AjtMHu6rLpbA8 |
| TXT | _cf-custom-hostname | fae150cc-4f07-42be-995c-56b2ea2b34e8 |

Replace the old website A target `185.158.133.1` with the two A targets above. Review any existing apex AAAA record so IPv6 traffic cannot continue reaching the old website. After propagation, refresh custom-domain verification and check Jobvance.io's certificate, home page, assets and direct `/auth`/`dashboard` requests. Unpublish/remove the obsolete Lovable domain binding only after the new domain is working; retain the old project as a recoverable source snapshot.

## Backend and verification

The actual published origin has been added to the function CORS allowlist; a live preflight confirms it is allowed. Exact `/auth/callback` and `/auth/reset` redirects are registered. The canonical Supabase Site URL remains `https://jobvance.io`, which was already approved. Old Lovable origins were removed from function CORS. Real-money billing remains explicitly disabled.

155 automated tests, frontend type checks and production build pass in the clean independent checkout. Hosted API verification passed 13 grouped checks using two private synthetic accounts, including upload, free-pack creation, approval/tracking, idempotency and isolation. Those fixtures are retained; no passwords, session tokens or private source backups are committed. See `HOSTED-API-VERIFICATION.md` for the exact scope. Public home/login pages and direct routes have been inspected. This does not claim owner Google sign-in, a complete signed-in browser journey or real payment success.

## Source and future releases

`.openai/hosting.json` retains the exact existing Site identity. Never register a second Site to update this publication. Use the official Sites source helper with a fresh short-lived source credential, passed only through hidden stdin, then save and deploy the matching archive. Credentials must never appear in files, command arguments or output. The complete source is also maintained on GitHub main; preserve Git history and verify the released commit.

The `.sites-runtime` folder is ignored local tooling used to work around Windows npm-launcher quoting. It is not an application dependency. The frontend remains a portable React/Vite application; build it with Node 24 or supported Node 22, `npm ci` and `npm run build`. Server payment/administrator secrets belong in Supabase and are never needed to build the public frontend.

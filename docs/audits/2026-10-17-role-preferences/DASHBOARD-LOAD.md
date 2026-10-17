# Expanded discovery response blocked the dashboard

The owner reported a recurring service-unavailable screen. The current live dashboard reproduced it. The deployed control20 source contains six default employer feeds and permits up to eight. The browser response schema still limited `snapshot.employerSources` to four, rejecting an otherwise valid successful response. This also affected `get_existing` when an existing record was returned.

The browser accepts the server's bounded list of up to eight. Two regression cases call the actual employer-feed resolver for the default and maximum lists and pass them through the browser API for `get` and `get_existing`. Both failed with the reported fallback before the fix. They now accept default, maximum and empty lists while rejecting a ninth source and malformed source fields. Other snapshot and owner validation remains intact.

The generic fallback now describes a loading failure and offers retry. It no longer claims the product is being configured when a network or response validation failure occurs. The real failure remains visible; no empty success record is substituted.

139 focused API, Job Loop journey and onboarding tests passed, as did application TypeScript. Production build, hosting checks and actual signed-in live readback are recorded in the release receipt. No candidate source, consent, schedule, payment or backend data is edited by this frontend fix.

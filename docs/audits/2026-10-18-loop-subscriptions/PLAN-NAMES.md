# Job Loop plan names

The owner requested proper customer-facing plan names. V48 presents Starter ($29/month, one run per week), Advanced ($59/month, three chosen weekdays per week) and Pro Job Seeker ($99/month, daily). All support the existing up-to-three CV variants and guided creator. Local whole-unit pricing remains the v47 catalogue.

The shared plan definition supplies pricing cards, sign-in and choice actions, purchase consent, current-subscription display and original-checkout recovery. Frequency remains a feature rather than the plan name. Stable internal IDs stay weekly/active/daily; no SQL, entitlement or handler change was needed.

The six current v3 Dodo products were renamed in their native editor and read back with exact IDs in Live and Test. Each changed name is prefixed Job Loop for checkout and invoice context. No monetary field or historical product was edited. No new product, purchase, price revision or subscription was created. Dodo was returned to Live Mode.

Verification: 68 existing UI/billing/localization cases across three files passed after updating their exact displayed-name expectations; TypeScript passed; the complete 38-page production build and 12 hosting groups passed. Five live HTML pages and three current JavaScript assets matched the build, excluding only the observed appended Cloudflare script. Actual live India pricing showed all three names, correct frequencies and INR2999/5999/8999. The earlier full-suite and payment-provider acceptance retain their original scope; no fresh payment/renewal/cancellation is claimed.

Exact runtime, provider IDs, rollback and saved deployment are in [the v48 receipt](../../releases/2026-10-18-plan-names.json). Private screenshot and HTTP receipts are retained outside Git. Other product and marketing requirements remain open; ads stay Off pending the exact revised creative and owner approval.

# v75 auth recovery review and release

Published at 2026-11-02T18:32:59.064600+00:00 (22:32Dubai), public https://jobvance.io. PR52 source f5b3b2c3c40981534fab99f58c646c78d1d594d7 merged a188bb2df6af84d896619f93face3c62c3bb586f. Full candidate/merge tree9770a4e874302a2c2520ab556b7ab218983d3aa1 matches. Native v75 save/deployment succeeded; audience/domain preserved.

## Verified problem and change

Anonymous livev74 at390px reproduced /auth?next=/check or /onboarding -> Forgot your password -> recovery -> Back to sign in returning to bare/auth. The recovery header also defaulted to/loop. v75 carries only the existing allow-listed selector and bounded campaign fields through these links, omitting codes/arbitrary query data/fragments. A deliberate valid reset request reuses the existing30minute same-tab account-return selector. Successful SDK-established update consumes it; failed updates retain it, invalid links keep retry context, expired/missing/unavailable storage safely falls back. Another browser has no same-tab selector and keeps the existing fallback.

Four production files plus one test file changed. SDK reset URLs, password/session validation, enumeration response, embedded CVCheck recovery and protected-route authorization remain unchanged. Seventeen protected objects match base e4271bc, including wholeSupabase25fb0742, AuthContext, MvpApp, optional-phone contact, Pixel/commerce/UKconsent, account-return helper, parser, home copy, CSP, packages/lock and CI. No backend/migration/function, ad/funding, permission, payment/provider, outreach or indexing action.

## Validation

- Full3830tests/217files;56auth-file cases including14new guards; applicationTS0errors;lint0errors/50inheritedwarnings;full moderate audit0;sourcewhitespace pass. Initial11newcases reproduced10failed assertions and1pass, covering variants/guards of lost context, not ten distinct customer defects.
- ExactheadCI41500480014/job125466349808 all steps pass including pinnedSDK/frozenDeno/auth/tracking/full audit. CI logs confirm217files/3830tests.
- Production build38pages/20guides/38JSONLDhashes,12hosting checks/social preview pass. Compressed Worker2203384/3145728bytes.
- Actual local-production390/320 and live390 CVCheck Back/onboarding header return pass,16px inputs/no horizontal overflow. No real email/account/Google/password update/AI/provider/checkout/payment submit or ad-tagged QA. SDK reset/session cases are mocked; not real-device/customer/Meta acceptance.
- Live164HTTP paths200 at18:33:34UTC:118rawexact/46HTML application exact with only recognized appendedCloudflareJSD tail/securityheadersmatch. Not rawHTMLparity. Archive normalization is not a claim of tar-byte identity.

## Acquisition evidence and limits

Fresh18:33:35UTC both2Nov daily windows show0signup/LIVEprovidercheckout/paid/eligiblefirstcycle/exactmatchedPurchaseclaim-sent/commerce totals. Dubai4Meta-tagged sessions,UTC3;strictPurchase0. The four Dubai-day sessions reached/onboarding/auth with0recorded genericclick/email-submit; their median reported visible duration1.6s is not certified bounce or cause. All started beforev75; post-release ad exposure baseline0 at18:36:20UTC. PublicCVCheck entry baseline0 at18:36:21UTC. No causal lift or full-dropoff explanation claimed.

Read-only connector18:13/18:14 returned ads' actual body explicitly invites Start your Job Loop, matching/onboarding. Internal campaign names freeCVCheck do not establish an ad/page promise mismatch. Shared UTM campaign tags do not certify current campaign/adset attribution. No ad changes.

Savedv74 and local rollback tag retained (not claimed pushed). Frontend rollback cannot restore external/customer/financial data/events; applied migrations and durable receipts stay. Root bounded baton FINISHED; Claude resumes ongoing writer. Shared release/baton is coordination, not native chat delivery/ACK. No unrelated native-session content retained.

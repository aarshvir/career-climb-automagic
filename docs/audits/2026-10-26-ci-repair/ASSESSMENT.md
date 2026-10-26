# CI and browser-dependency repair

26October2026. Reviewed integration of Claude PR33 head e51977ca1c1d1fe818f4ba5ee1c465be13985318 onto main681fda2. Candidate validation complete; GitHub checks and production publication are separate pending steps.

## Change

The inherited repository-wide lint failure is addressed through scoped configuration and small fixture const cleanups. Test doubles may use any; product code retains that rule. Control-character patterns intentionally used by validation are allowed. Three existing backend optional-chain assertions are warnings; source code is unchanged. This is a lint configuration change, not removal of runtime validation.

DOMPurify moves3.4.16→3.4.17 in the lockfile and browser Zod3.25.76→4.6.7. Four z.record calls specify string keys explicitly; the interest form separates schema input/defaulted output generics. Existing API object, numeric and source/owner checks remain. The source lock hash is regenerated in all seven bundle proofs; all seven generated backend artifact bytes are identical to681fda2. The earlier backend product-name preparation remains undeployed.

CI async waits are bounded at5seconds and the test timeout at20seconds for slow runners. No assertion was removed or weakened. The v57 first-global-CV-result regression and original SDK owner/dispatch guard declarations are retained exactly, as independently compared.

## Local validation

-3308tests/180files passed with two workers.
-Application TypeScript passed.
-Complete repository lint:0errors/54warnings. Warnings are retained and visible, not called zero.
-28source and28generated Deno boundary cases passed, with the source invocation matching the CI command.
-npm audit:0known vulnerabilities at this run; not a general security certification.
-15existing source/manifest-proof cases passed after source-order preservation.
-Production client build,37-page/20-guide prerender and12hosting groups passed. Worker compressed2,970,975bytes of3,145,728.

The first full build failed at a60-second Vite SSR transport fetch after dependency refresh. The cause is not conclusively established. The unchanged standalone prerender retry generated all37pages with zero external requests, followed by successful packaging/hosting checks. No timeout, source validation, network prohibition or production guard was relaxed to pass. Two optional installer postinstall scripts remained blocked; the build uses the existing OXC path and succeeded without approving them.

## Scope and release

Frontend/CI only. No migration, native function upload, auth configuration, merchant/payment/capacity change, paid call, candidate write, ad/pixel mutation or premium visual redesign is included. PR32 analytics has independent functional blockers and is not included. Current live baseline remainsv57 until a separate exact release receipt confirms publication.

Rollback: pushed tag jobvance-before-ci-repair-2026-10-26 at681fda2, with savedv57 retained. Source/site rollback is separate from database/file/merchant restoration. Preserve the pending backend name release boundary and the active Claude premium writer.

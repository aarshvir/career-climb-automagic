# Local observation harness

These two tests reproduce **bad historical behavior** in version 21. Passing them is evidence that the defects exist, not a release pass. They are archived as text so normal test discovery does not count them as successful regression coverage.

To repeat in the repository checkout with its existing dependencies:

1. Copy `current-defects.test.tsx.txt` to `.tmp/usability-workflow.test.tsx`.
2. Copy `vitest.config.ts.txt` to `.tmp/usability-workflow.config.ts`.
3. Run `npx vitest run --config .tmp/usability-workflow.config.ts --maxWorkers=1`.

Auth and account/network boundaries are local mocks. The component, recovery helper and evidence engine are real. No production account or provider key is needed. The captured run passed both observation assertions; the repair must replace them with assertions that preserve edits and restore the correct owner draft while keeping account isolation.

Version 22 repairs both defects. The preserved observation harness is expected to fail against repaired source; never count its bad-behavior assertions as release regressions. Correct acceptance tests now live in `src/__tests__/cv-check-work-preservation.test.tsx`, `cv-check-review-state.test.tsx` and `cv-check-operation-owner.test.tsx`. See [release evidence](../../../WORK-PRESERVATION-RELEASE-2026-10-14.md).

# Local observation harness

These two tests reproduce **bad current behavior** in version 21. Passing them is evidence that the defects exist, not a release pass. They are archived as text so normal test discovery does not count them as successful regression coverage.

To repeat in the repository checkout with its existing dependencies:

1. Copy `current-defects.test.tsx.txt` to `.tmp/usability-workflow.test.tsx`.
2. Copy `vitest.config.ts.txt` to `.tmp/usability-workflow.config.ts`.
3. Run `npx vitest run --config .tmp/usability-workflow.config.ts --maxWorkers=1`.

Auth and account/network boundaries are local mocks. The component, recovery helper and evidence engine are real. No production account or provider key is needed. The captured run passed both observation assertions; the repair must replace them with assertions that preserve edits and restore the correct owner draft while keeping account isolation.

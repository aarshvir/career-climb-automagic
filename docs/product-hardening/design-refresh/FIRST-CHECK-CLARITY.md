# First CV check clarity

Date: 2026-10-14

## Finding

The opening role screen repeated its instructions, put audience advice above the form, and placed a long privacy and recovery explanation before Continue. This pushed the next action below the desktop opening viewport. The mobile reset control could also overlap the introduction.

## Changes

- Replaced the fragmented introduction with a direct description: check a CV against one vacancy, review the wording, then download.
- Stated that the role title is the only required input on this step and that the CV comes next. Kept company visibly optional, shortened examples, and added `aria-required` to the role input.
- Put Continue immediately after the role and company fields. Kept a concise device privacy explanation beneath it.
- Moved audience advice into a closed, optional native disclosure below the main card. The audience label, full guidance and recovery behavior remain available.
- Moved Clear & start again below Draft recovery. Its confirmation and reset behavior are unchanged.
- Reduced introductory and first-step spacing while keeping 44px controls and keyboard focus outlines.
- Replaced fixed primary blue, ink, paper and neutral colors with shared brand/theme variables.

The step sequence, input validation, review/approval rules, account saving, consent controls and draft recovery logic were not changed.

## Verification

Passed 119 existing tests across:

- `src/__tests__/cv-check-journey.test.tsx`
- `src/__tests__/lib/check-draft.test.ts`
- `src/__tests__/auth/check-auth-handoff.test.tsx`

These cover guest export, validation focus, exact PDF preview approval, source removal and undo, reuse, recovery consent and account handoff. No tests were added for cosmetic copy. Desktop and mobile rendered layout is checked in the parent design refresh review; this subtask did not change the shared browser viewport.

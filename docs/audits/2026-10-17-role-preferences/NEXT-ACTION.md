# Visible setup navigation

The owner reported no Next action on the role-selection screen. Browser inspection found white primary-button text on a transparent background: JobLoop.css defines its colour variables only under `.job-loop-page`, while onboarding uses `.loop-onboarding`. The existing Continue button also followed the optional CV fields below the fold.

Onboarding now supplies those same colour variables, labels the forward action Next, and keeps Back/Next/final Save in a bottom action bar. Page padding and field scroll margins reserve space for the bar, including safe-area padding. Keyboard focus has a visible outline. Existing draft, validation, authority, busy and explicit-save consent logic is unchanged.

Validation: 24 focused onboarding/role tests passed, application TypeScript passed, complete production build passed, and all 12 hosting groups passed. A hosting check attempted before the build finished reported a missing generated worker; it passed after the build completed. No checks or guards were weakened.

Actual browser checks used the existing isolated synthetic auth/persistence preview. At desktop 1280x720, missing roles remained blocked, a pending broad role advanced to locations, and Back preserved the role. At mobile 390x844, the expanded CV section retained a visible blue Next button (48px height, bottom 828px), and Next advanced after typing CV text. No horizontal overflow was observed (document width 375px). Browser screenshots are retained privately as onboarding-next-desktop.png and onboarding-next-mobile.png. This is local UI verification, not a new hosted signup or recurring-worker acceptance claim.

Frontend-only change. No backend, database, billing, campaign or production candidate changes.

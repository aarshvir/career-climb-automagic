# Account-first Job Loop setup

Implemented locally on 17 October 2026. Publication and full integrated acceptance belong to the release coordinator; this note does not claim deployment.

## Customer path

- Primary start links lead to `/onboarding`. Authentication precedes the quiz; `/check` also requires an account.
- The quiz asks for roles, locations, optional compensation, privacy boundaries, then a CV and final review. The CV step supports PDF/DOCX/TXT extraction and the existing exact-answer CV builder, plus explicitly reviewed name, optional contact line and optional experience years.
- A fresh setup is written to the existing owned Job Loop profile after explicit private-storage consent. The quiz does not create a parallel onboarding profile or store an onboarding-complete flag.
- A configured profile is preserved: the quiz offers the existing dashboard without replacing its preferences, facts, drafts or schedule.
- The success screen explains the remaining fact review and schedule selection. The continuation carries owner, lifecycle generation, current authentication authority and an onboarding-saved navigation marker to `/loop`. The actual dashboard waits for its authorized snapshot, validates all three boundaries, opens My CV & experience and consumes the marker. Wrong-owner, older-generation and stale-authority hints are ignored; the marker cannot manufacture a saved profile or completed setup.
- A persistent next-steps panel uses the actual saved profile, confirmed/shareable fact count and schedule status. It opens the existing fact review, saved CV variants and exact-CV schedule controls. It does not claim that an unread variant list is complete. Variant-aware recurring AI controls are in My CV & experience; Today reports schedule and run results.
- Weekly, three-times-weekly and daily schedules remain deliberate dashboard choices. Saving quiz answers never launches a provider call, grants fact confirmation, starts a subscription or enables recurring processing.

## Authority and recovery

Opening uses passive `get_existing`. Only final explicit saving may initialize an absent record. If a profile appeared elsewhere before initialization completed, the quiz refuses to overwrite it. Existing profile writes preserve their original record version; the established server version floor protects changes across lifecycle transitions. The `save_profile` contract is not falsely described as accepting an explicit `expectedGeneration` parameter.

The original owner/session authority, draft epoch and observed lifecycle are checked before and after asynchronous work. An additive optional `stillAuthorized` callback on `callJobLoop` also checks that authority across its internal authentication awaits, preventing an A→B→A session change from dispatching the old quiz intent. Storage permission is synchronously revoked on edit/uncheck/back navigation. Successful receipts must contain the exact submitted profile, matching lifecycle, and a strictly advanced record version.

Ambiguous saves leave answers visible and require fresh saving consent; retries keep the original version. The customer is directed to inspect the dashboard before retrying. Unsaved answers are page-memory only, with an explicit notice that refreshing/leaving clears them. No tokens or CV text enter the auth-return storage. The fixed `/onboarding` and `/check` destinations now survive Google and email-confirmation return.

## Public presentation

Main entry, pricing, Help, walkthrough captions, account footnote, CV Check explainer and metadata now consistently describe an account-based product. Active entry pages no longer advertise guest access or a beta. Historical legal retention language remains truthful. Monthly subscription purchase is still explicitly unavailable because this slice does not implement billing. No customer counts, testimonials, business history or scores were fabricated.

Public `/check` HTML is an account entry rather than an interactive guest checker. `/pilot` redirects to the Job Loop overview in the app; its static rendering uses the same overview. `/onboarding` is excluded from the public sitemap.

## Validation

- Application TypeScript passed.
- 152 focused cases across eight UI/auth/API/help/pricing files passed before two additional contact/builder tests were added; both additional cases subsequently passed with the existing onboarding/API/auth cases.
- New cases: 13 quiz cases, 3 actual router/auth cases, 2 delayed SDK/control authority cases, and 5 actual Job Loop continuation cases (23 total). The final continuation/onboarding/builder group passed all 22 cases.
- Independent discovery-agent source review identified missing reviewed contact and explicit experience-years fields; both were added with a regression. It also identified a stale account-return expectation: `/check` is now intentionally retained. The corrected seven-case return suite passed and still rejects unrelated query data.
- No browser, hosted onboarding, payment, provider or production-candidate write was performed by this subtask.

## Remaining acceptance boundaries

This is the essential supported quiz, not every proposed preference. Seniority may be expressed in role titles and explicit years; separate industry/work-authorization/notice-period filters require a real persisted and enforced contract. The quiz does not promise an automatic first result under two minutes. Facts, CV variants, recurring consent and actual source availability still need review in the dashboard. No NPS or trial-conversion uplift is inferred from test counts.

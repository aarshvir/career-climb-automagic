# Click-label changes (design rounds 3 to 6)

The first-party click tracker labels a click by the control's visible text, so these renames split admin click reports into
an old and a new label. For before/after ad comparisons, add the pairs together.

| Old label | New label | Where |
| --- | --- | --- |
| Start my Automated Job Loop | Start my search | home, /job-loop, /how-it-works, /faq, /about, /guides, /walkthroughs, /pricing, audience pages |
| Sign in for Starter / Advanced / Pro Job Seeker | Choose Starter / Choose Advanced / Choose Pro Job Seeker | /pricing plan cards |
| Check my CV against a job (primary on audience pages) | Start my search (primary); Check my CV against a job is now the secondary text link | /for-students, /for-mba, /for-career-switchers |
| See how the Automated Job Loop works (hero link on audience pages) | same text, now in the section under the hero | audience pages |

## Round 5

| Old label | New label | Where |
| --- | --- | --- |
| Check my CV against a job | Check my CV | /pricing free card (destination /check) |
| Get started | Start my search | mobile menu panel button |
| Header "Start my search" button | removed on entry pages | /onboarding and /auth (the page's own form is the one action) |

## Round 6

| Old label | New label | Where |
| --- | --- | --- |
| Get started | Start my search | the compact header button on phones (the last "Get started" label) |
| Check my CV against a job (secondary text link) | Try the free CV Check | /for-students, /for-mba, /for-career-switchers |
| Optional: one-time CV Check passes (section heading) | Just want the CV Check? See one-time passes (disclosure summary) | /pricing |
| Best for an active search (plan flag) | For an active search | /pricing Advanced card |
| Set up your Automated Job Loop in minutes. (H1) | Set up your Automated Job Loop and let it run. | /onboarding and /auth sign-up |

Destinations are unchanged for every control above. No analytics code was edited.

## Round 8

| Old label | New label | Where |
| --- | --- | --- |
| Explore Automated Job Loop / How your CV is handled (two text links) | Start my search (button) / See how it works (text link) | home, "A tailored CV for each prepared role" block |
| Set up my private Automated Job Loop | Set up my search | /job-loop, "Save your experience" band |
| Start my search (third hero link) | removed from the hero, kept in the closing band | /help (hero), /walkthroughs keeps Start my search and drops Try the free CV Check from the hero |
| Find task help / Follow a walkthrough (links inside the form) | same labels, now in the "Find an answer faster" card | /contact |

### Cutover for ad-versus-organic reports (needs the owner's acceptance)

The first-party click tracker (`src/lib/analytics.ts`) labels a click with the control's `aria-label`, or its visible text when there is none. Tracking code was not edited in this branch, and giving a control an `aria-label` that differs from its visible text would fail WCAG 2.5.3 (Label in Name). So a stable tracking id was not added. Instead: whoever reads click reports must sum the old and new labels in the tables above (the label changes happen on the day this branch is deployed; record that date next to the first report that spans it). Destinations are unchanged for every control above.

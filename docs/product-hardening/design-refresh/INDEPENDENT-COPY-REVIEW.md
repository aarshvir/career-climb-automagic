# Independent customer-language review

Reviewed 14 October 2026, approximately 08:28–08:42 Asia/Dubai, on `http://127.0.0.1:8383`.

This is an independent editorial inspection by one reviewer using three audience perspectives. It is **not a real-user test**, conversion study, accessibility certification or statistical estimate. No earlier audit grades or research were read before forming this review. There was no requested pass mark. The scores below are judgments about the inspected journey, not measured customer outcomes.

## Scope and method

Read the current source for the homepage, `/job-loop`, all three audience pages, `/auth`, `/how-it-works`, `/guides` and `/help`. Inspected the rendered local DOM of those routes and the student-project article. Viewed desktop screenshots at the existing approximately 1265 × 712 viewport; no viewport override was changed. Article samples read in source were:

- Compare your CV with a job description using evidence.
- Show student projects without calling them work experience.
- Build an MBA career-pivot CV with a credible bridge.
- Plan a confidential job search alongside your current job.
- Prepare your first application pack without extra paperwork.
- Reuse your career record for a second application.
- Make a job-search plan that fits a busy week.
- The upload-failure, cancelled-run and recruiter-message articles were also sampled.

The working tree changed during the review. Material initial findings were sent promptly to the implementation owner. `/how-it-works` and the audience questions were then re-read after edits. Scores refer to the later inspected copy, with that distinction recorded below. This review did not change runtime files or make a commit. It did not test authentication, upload, download, cloud execution or external-source accuracy.

## Persona judgments

Scores use a 1–100 scale: clarity means understanding the offer and inputs; naturalness means ordinary, audience-appropriate language; task confidence means knowing what to do next and what to expect. The aesthetic column is separate, subjective desktop taste, not a copy score.

| Perspective | Clarity | Naturalness | Task confidence | Subjective aesthetic |
| --- | ---: | ---: | ---: | ---: |
| Student or recent graduate preparing an internship/first-role application | 89 | 82 | 85 | 88 |
| MBA student/alumnus explaining a move in function or industry | 88 | 83 | 84 | 87 |
| Busy professional with 5–10 years' experience considering another employer or direction | 89 | 83 | 82 | 87 |

The homepage and audience entry pages are stronger than the lowest journey scores suggest. The main drag is the shift into repetitive caution and dense operating instructions in the guide/help layer. For a working professional, the saved-work benefit is clear, but the volume of reading makes the promised reduction in repeat effort feel less certain. For a student, repeated warnings about invented employment can undermine an otherwise welcoming introduction.

## What works

The homepage explains a concrete job: bring a CV and a job description, review relevant experience and download a version. “Free download. No account or card needed” answers the immediate commitment question. “Give your strongest relevant work a better place on the page” is a useful, modest benefit, and the reordered-bullets example demonstrates it.

The audience pages use recognisable starting material: projects and placements for students, prior work plus MBA projects, and an existing CV for employed applicants. They also include a normal move to another employer, so the professional path is not limited to a complete career change. Their primary actions say what will happen.

The sign-in form uses familiar labels, separates sign-in from account creation and includes a route back to the free check. The revised `/how-it-works` now follows the no-account promise before introducing saving and reuse.

The guide topics address useful tasks, and the help center has clear starting cards, search, categories and direct links. The first-pack article is especially practical: it keeps unrequested documents optional. The professional privacy article offers concrete choices rather than promising secrecy.

I did not find a prominent guarantee of interviews, employer acceptance or automatic submission in the inspected pages. Fictional examples are identified, and source matching is not presented as proof of qualification. These are useful limits; the issue is their repetition and placement, not their presence.

## Remaining findings, in order of editorial value

### 1. The guide voice often opens by correcting an imagined mistake

The student article title, “Show student projects without calling them work experience,” is followed by “A student CV does not need invented employment to be useful.” That makes an honest student feel corrected before receiving help. The article then revisits academic versus professional work, simulation versus employment, team versus personal work, forecasts versus results and tool use versus observation in successive sections.

Keep the distinctions where they help the reader make an edit, but lead with the useful action. A stronger title is “How to describe student projects on your CV.” An opening could be: “Projects, internships and activities can show employers how you work. Name the setting, your contribution and what you produced.” One clear employment-context note can then sit beside the worked example. Source: `src/lib/career-guides.ts`, student article around lines 95–121.

This pattern also appears in otherwise useful article descriptions: “without inventing percentages,” “without invented referrals,” “stories you can defend,” and several “does not establish” formulations. Across a library, the cumulative tone becomes suspicious and defensive. A reader needs help presenting real work, not repeated reminders that fraud would be wrong.

### 2. Help is accurate-looking but too dense for an interrupted task

The first-check instructions quote long labels inside long sentences without visually separating the label from the instruction. One step combines the page name, upload option, paste-field label, correction advice, privacy advice and the next button. Later topics combine the successful route with blank-preview recovery, source invalidation, transfer limits and account-change conditions.

Exact control names are valuable in help. Keep them, but put the main route into short steps and move failure cases into distinct “If…” sections. For example, the PDF topic can first say open the current CV, preview every page, approve, then download; blank preview and timeout recovery can follow beneath it. This would materially improve confidence for busy users without weakening any source or privacy control. Source: `src/pages/HelpCenter.tsx`, first-check topic and `job-loop-review` topic.

Some internal language also leaks into the help: “literal passages,” “source validity,” “held packets,” “every lane,” “cleared facts,” and “Use an owned saved CV.” The last phrase is especially unnatural customer language; “Use one of my saved CVs” would be clearer if the matching control is renamed. This is a coordinated label/help issue, not a suggestion to make documentation disagree with the UI.

### 3. Saving and reuse are described more often than they are demonstrated

The homepage has an effective before/after reorder example. The audience pages, however, repeat essentially the same benefit in the intro, three-step section, three feature blocks and final section: review facts, save them, reuse them, keep a separate CV. The guide library then repeats “confirmed facts,” “exact files,” “review and approve” and “your next action” across many articles.

For a time-poor applicant, one worked second-application example would show more than another benefit paragraph: “For analyst roles, reporting goes first; for coordination roles, rollout work goes first. Your dates and history stay the same.” The existing second-application article already contains material of this kind. Bring one compact example nearer the saving proposition. Source: `src/pages/AudienceLanding.tsx` and `src/lib/career-guides.ts`, reuse article.

### 4. Some guide-library wording describes editorial machinery

“20 original guides · Public to read · Examples labelled fictional,” “Common guides appear alongside your audience's guides,” “Preparing your first pack” and “Checking your CV evidence” sound more like a content inventory than a reader's task. “Pack” and “evidence” are not as immediately familiar as CV, cover letter, project or application.

Useful alternatives include “Prepare your first application,” “Compare your CV with a job” and “Choose your stage to find relevant guides.” Fictional labels should remain on examples; the hero does not need to sell their existence. Source: `src/pages/CareerGuides.tsx`.

### 5. The remaining pilot explanation is more technical than the surrounding promise

The expanded `/job-loop` FAQ uses “shared processing allowance,” “rules-based schedules,” “configured external models” and “consent for each run.” Those may be precise descriptions, but a newcomer mainly needs to know whether they can use the pilot, what can be saved, what preparation is available and what happens when access is unavailable. Keep the fuller processing detail in setup/help and say the customer consequence plainly in the FAQ. Source: `src/pages/JobLoopOverview.tsx`, pilot FAQ.

There is also mild ambiguity in “Your first check and download are free”: the homepage presents a free check and downloads generally, while the audience and Job Loop pages stress “first.” If free checks are not limited to one, use the same unrestricted wording everywhere. I have not verified the entitlement implementation, so this is an expectation to confirm, not a claim that the product charges for the second check.

## Findings addressed during this inspection

- `/how-it-works` initially led with profile, priorities, search and connected reply updates before the free check. It now leads with the six CV-check steps and introduces Job Loop afterward. Verified in the later local DOM. The initial issue is not counted as remaining.
- Student illustration initially asked whether an explicitly labelled university project was coursework or paid work. It now asks which parts of the dashboard the applicant built. This is relevant and more supportive.
- MBA illustration initially asked “What did you communicate yourself?” It now asks which findings were presented and who used them.
- Professional illustration initially asked “Which delivery did you own?” It now asks what the applicant coordinated across two teams.
- The MBA guide's “a implemented transformation” typo was corrected to “an implemented transformation.”
- The Job Loop hero's second explanation paragraph was removed after the first desktop pass. That reduces the immediate reading load. The earlier observation that the primary CTA sat below the visible screen is a pre-edit observation, not a verified defect of the later layout.

## Subjective visual observations

The green/cream public pages look calm and credible, with generous spacing, readable large headings and a clear primary action. The CV comparison illustration communicates a real activity, which helps the copy. The article layout has a useful contents list and restrained reading column. These observations support the aesthetic scores only.

The inspected auth screen used a blue/lavender treatment while the public pages used green/cream. That felt like a different product surface. This is a cohesion preference, not a functional failure; CSS was changing during the review. Large hero type on the Job Loop and MBA pages also delayed some supporting detail at this viewport. I did not score mobile layouts.

## AI-style assessment

Actual AI authorship cannot be reliably inferred as a percentage from this copy, and no such percentage is assigned. The guide disclosure explicitly says AI assistance was used; that disclosure does not establish a proportion.

The noticeable generic patterns are editorial: uniform five-section article shapes; repeated action triads; a repeated contrast between a useful action and a hypothetical overclaim; repeated “actual,” “exact,” “confirmed,” “source” and “review”; and endings that restate one next action plus a product CTA. These patterns can make an otherwise specific article feel mechanically generated. Reduce repetition, vary the article shape to suit the task and add more short, usable examples or templates. The homepage is less affected because it includes concrete CV passages and a visible edit.

## Source snapshot

SHA-256 hashes below identify the source content inspected. Paths are relative to the repository. Final capture was approximately 08:40–08:42 Asia/Dubai. Later changes are outside this snapshot.

| File | Later inspected SHA-256 |
| --- | --- |
| `src/pages/ProductPage.tsx` | `DE169D4A11B2EC8DEBF9C0AFEB9705E1250FFCC92D277508520A32457105F497` |
| `src/pages/Index.tsx` | `BEF0AD3FF6F918C2C71619FEE8AF5C994146F127BB3CD088973CC30D594BB22A` |
| `src/pages/JobLoopOverview.tsx` | `E399FABE4E6486FCB90C2821953479A5A5809FD192A67506B491D7DFFFA2C41B` |
| `src/pages/AudienceLanding.tsx` | `8C87D9133DCB6D57A449216D72EF58F3161DBA0E2A5260EE26A47C51F5AEA53D` |
| `src/lib/job-loop-audiences.ts` | `1D6D446446CD62BC492D3A34D3961882662E89D9BBEFF94886D01092E062086F` |
| `src/pages/Auth.tsx` | `B55058CB129E75EF39F9711424146301F7422A4AEE40CB4207940439180C2CDC` |
| `src/pages/HowItWorks.tsx` | `3D857DE92205B3D5FE9FE28CD4031892B64282CFCF03CF73187B8634BAF516F7` |
| `src/pages/HelpCenter.tsx` | `589B48D21ADA86218B7B6011FD191828FCE8C46A4BFF7E23678580078417001A` |
| `src/pages/CareerGuides.tsx` | `C2202E66BADAA655D071DD13E9B1E44ADAEB9FE31AEBD969BBDBD1D01B73177C` |
| `src/lib/career-guides.ts` | `A9731F581D15AED37156555420AB9316F86686DD146BCB4CE141F59A6405B98C` |

Earlier source versions actually read, before the changes described above:

- `ProductPage.tsx`: `38D6862CB07A7DAFB9035BC2A1AC48E4515E1AA9D54ED92BA02E7B3F88F8205A`.
- `JobLoopOverview.tsx`: `9FAC259785F369D50BA4756234A0C2DBADBE341341418BF2B9F998C42C3B290E`.
- `job-loop-audiences.ts`: `D25FBE3EA4021E526CA5DD388322EBD504B200CD2464CD6EB0FF3651CAF4EB73`.
- `career-guides.ts`: `DD6C29A44054E652B1710835EF62551172BBC7F8B575DF4240C4FB4A7A819EAC`.

`src/pages/Index.tsx` is the one-line wrapper rendering `ProductPage` with `kind='home'`. Runtime and styling changes remained owned by the implementation agent.

## Bounded recheck of the frozen revision

Rechecked 14 October 2026, approximately 08:56–08:58 Asia/Dubai, against the frozen source and `http://127.0.0.1:8404`. This addendum preserves the original review, scores and hashes above. It is a focused verification of identified issues, not a second complete journey test. **No new overall scores are assigned**: changing the original numbers after a smaller inspection would imply a like-for-like comparison that was not performed. The original numbers describe the earlier snapshot, not a grade for this later version. No target score or AI-authorship percentage was used.

Read the guide titles, descriptions and summary material across the library, and re-read the student and MBA openings and relevant help/source-control passages. Verified the rendered student article and guide library, and viewed the revised auth screen. The available browser was Chrome for this pass; the previous in-app browser was unavailable. A dedicated temporary tab was used. No viewport setting was changed; the auth screenshot was approximately 1903 × 848, so this is not a controlled visual comparison with the earlier 1265 × 712 pass. No real sign-in, six-step completion, download or cloud run was attempted.

| Earlier issue | Recheck result |
| --- | --- |
| Guides open by correcting imagined dishonesty | **Materially addressed at the entry points.** “How to describe student projects on your CV” now opens with what projects can show and how to choose examples. Its first two sections give positive actions, and the example explains why the entry works. The MBA opening now connects prior work and projects to a target role. Titles such as “What to include in your first job application” and “Turn your CV into clear interview stories” are easier to recognise as useful tasks. Necessary cautions remain in bodies, but they no longer dominate the inspected first impression. |
| Help is dense and uses internal terms | **Partly addressed.** “Each source and task” is clearer than “every lane”; “a document is held for review” is clearer than “held packets”; no-CV guidance now says “plain text CV draft.” Some source/ownership labels and compound steps remain. The first upload/paste step and the PDF topic still combine several actions, controls and failure cases. |
| Saving/reuse is repeated more than demonstrated | **Largely unchanged in public audience sections.** The new guest control “Reuse these edits later (optional)” is a useful improvement: a native details element is closed by default in the inspected source, so advanced source editing need not compete with the immediate review. This checks the label and structure only; it does not verify the control's runtime behaviour. A compact worked second-application example remains the best next editorial improvement. |
| Guide library describes editorial machinery | **Partly addressed.** “Practical help for your next application” and “Preparing your first application” are clearer. “Checking your CV evidence,” “20 original guides · Public to read · Examples labelled fictional,” and “Common guides appear alongside your audience's guides” remain. These are minor wording opportunities, not blockers. |
| Pilot explanation is technical | **Unchanged in the inspected Job Loop source.** “Shared processing allowance,” model/run terminology and the “first check” wording remain as previously noted. No entitlement mismatch was established by this recheck. |
| Auth palette feels separate | **Addressed visually.** The inspected auth screen now uses sage/green, cream and the same green primary action as the public pages. The earlier blue/lavender cohesion criticism does not apply to this screenshot. |
| Workflow order and audience questions | **Still addressed.** `/how-it-works` keeps the six CV steps first. Audience question text remains about the applicant's concrete contribution, rather than the earlier redundant/awkward questions. |

### One concrete remaining correction

In `src/pages/HelpCenter.tsx`, the `job-loop-review` topic around line 136 says: “then rebuild, save and confirm the corrected career fact, and prepare a fresh output.” The next sentence says: “Save and confirm the corrected fact before rebuilding the document.” The first sequence conflicts with the second and repeats the instruction. Use one order, matching the actual UI: “Select Edit career facts, correct the fact, then save and confirm it. Prepare a fresh output and review it.” This was reported to the implementation owner; the frozen files were not edited by this reviewer.

The guest `/check` passages sampled no longer use pack-credit jargon, but that terminology still exists in the public FAQ/legal source. This recheck does not claim it was removed site-wide.

The overall direction is better: the library now leads with a useful outcome and concrete actions, and the account surface feels part of the same product. Remaining work is predominantly shortening repeated instructions, separating the successful path from recovery details and showing reuse with one practical example. No new prominent hiring guarantee or automatic-submission claim was found in the rechecked material.

### Frozen recheck hashes

SHA-256 values captured from the inspected frozen source. Earlier hashes above are intentionally retained.

| File | Recheck SHA-256 |
| --- | --- |
| `src/pages/ProductPage.tsx` | `45667085F31391CFB38CEED94B21B83B1636779BBDF452C594619DA3C05FE0C5` |
| `src/pages/HelpCenter.tsx` | `917DA4E8C0A1466333A440E41C22A94D1D8C68B1A9617D42A40C0201FB6BCA70` |
| `src/pages/CareerGuides.tsx` | `973D15211D2F91047ACFCC8A778D828A2C61EDD3A6B68C86C101B6EF2CABC526` |
| `src/lib/career-guides.ts` | `7907FB393E7D6A3485403222DF96374C7262F886E424A2BF12E10185D668F465` |
| `src/lib/job-loop-audiences.ts` | `1D6D446446CD62BC492D3A34D3961882662E89D9BBEFF94886D01092E062086F` |
| `src/pages/AudienceLanding.tsx` | `1AECD82BDFCB10ED5B9CC1E6DC6E98510A7FED553BDAE7B89842B399139F0675` |
| `src/pages/JobLoopOverview.tsx` | `E399FABE4E6486FCB90C2821953479A5A5809FD192A67506B491D7DFFFA2C41B` |
| `src/pages/HowItWorks.tsx` | `3D857DE92205B3D5FE9FE28CD4031892B64282CFCF03CF73187B8634BAF516F7` |
| `src/pages/Auth.tsx` | `B55058CB129E75EF39F9711424146301F7422A4AEE40CB4207940439180C2CDC` |
| `src/pages/AccountPilot.css` | `104E563DAC416F1421CF34EFC07B6E8A5F1A54B840414D23040A06696FA02D1E` |
| `src/pages/CvCheck.tsx` | `A800550AB33BB7540F334DF621629221F6FCADEEBE35E7526B84A8F725BAEB01` |

### Limited confirmation after the frozen snapshot

At 08:58 Asia/Dubai, re-read two later source-only corrections in `src/pages/HelpCenter.tsx`. The correction step now says: “If a fact is wrong, select Edit career facts, correct it, then save and confirm it. Prepare a fresh output and review the document.” The conflicting order identified above is therefore **resolved in the later source**. Source-removal help also now tells the reader to open “Reuse these edits later (optional)” before its nested line-removal control, matching the new parent disclosure.

The updated help-source SHA-256 is `76AEFA3B37D8E51BE9D89CA3AC495FA4B08F2BC873DD5CCC77BCAB8F6E9ECE93`. These two changes were not part of the frozen `8404` render inspected above; no rendered claim or broader rescore is made for them. The original and frozen-snapshot findings remain preserved as historical records.

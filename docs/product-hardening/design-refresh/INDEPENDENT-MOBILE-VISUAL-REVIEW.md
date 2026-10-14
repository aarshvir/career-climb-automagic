# Independent mobile, visual and accessibility review

Reviewed 14 October 2026 against the frozen production client at `http://127.0.0.1:8403/`. This is an independent review; no previous reports or scores were read. No runtime files were edited.

## Verdict

**Mobile first-use readiness: 83/100. Aesthetic judgment: 86/100.** These are reviewer judgments, not a conversion forecast or an accessibility certification. The interface has a coherent identity, a clear free-check entry, sensible mobile stacking, and usable principal controls. The limiting factor is small text: the miniature product previews and some explanatory labels ask more visual effort than the main headline and form do.

The visual style is calm, professional, and consistent. Cream backgrounds, dark green actions, generous spacing, restrained borders, and the strong headline weight work well together. The headline/body size contrast becomes excessive on the narrow professional page. Improving readable teaching content would matter more than adding visual decoration.

## Scope and method

- Used the browser through CUA only, with explicit 390 × 844 and 320 × 844 CSS-pixel viewport overrides.
- Reviewed `/`, `/check` at its initial role step, `/job-loop`, `/auth`, `/for-students`, `/for-mba`, and `/for-career-switchers` at both widths.
- Inspected screenshots and the rendered accessibility/DOM state. Measured rendered control bounds, font sizes, colors, and document width. Tested mobile navigation by keyboard.
- No account creation, sign-in, private candidate data, uploads, or model calls. This review does not grade the later CV journey or authenticated workspace.
- Reset the viewport override after finishing. No browser viewport changes remain from this review.

## Parameter grades

| Parameter | Grade / 100 | Evidence and limit |
|---|---:|---|
| Primary action discovery | 88 | Main actions remain visible on every initial view; the professional CTA barely exceeds the bottom edge at 320 px. |
| Typography and reading comfort | 75 | Main hero text is readable, but preview metadata reaches 8–10 px, audience tabs are 11 px, and later explanatory copy is often 12–13 px. |
| Responsive layout | 90 | No page-level horizontal overflow observed. Narrow audience navigation breaks a word awkwardly. |
| Touch controls | 88 | Principal actions, menu, form fields, password visibility, and persona controls meet the requested 44 px height. Some secondary inline links and the logo do not. |
| Keyboard navigation sampled | 89 | Menu trigger, link focus, Escape dismissal, and focus return work; this was not a full keyboard audit of every route. |
| Sampled text contrast | 93 | Measured principal text/color pairs exceed 4.5:1. Every state and decorative boundary was not tested. |
| Hierarchy and scanability | 82 | Actions are recognizable; some long hero copy and miniature examples dilute a quick mobile scan. |
| Visual consistency | 90 | Shared navigation, palette, shapes, spacing, and form language feel deliberate across the reviewed pages. |

## Persona grades

These concern the mobile landing experience, not the suitability or accuracy of generated application material.

| Persona | Grade / 100 | Reason |
|---|---:|---|
| Student / graduate | 85 | A concrete starting task, relevant project framing, visible free entry, and a manageable headline. Preview labels still require close reading. |
| MBA applicant | 83 | Prior work plus MBA experience is understandable and the CTA fits. The 320 px hero is longer and its selector is more cramped. |
| Busy professional / career switcher | 78 | Useful reuse proposition, but the longest headline and paragraph impose the most initial reading. At 320 px the main button reaches the viewport edge and the next option is below it. |

## Material findings

### 1. Product teaching content is too small for comfortable mobile reading — medium

On the homepage the example contains 8 px “CV check / Evidence review,” 9 px category labels, 10 px vacancy metadata, and a 9 px review instruction. The example passages themselves are 13 px and the contribution question is 12 px. Persona illustrations repeat 9–11 px labels. The homepage no-account/download hint is 10 px; persona hints are 11 px. These facts are technically present, but their size weakens the part of the page intended to explain and establish trust in the product.

The lower professional page also uses 12–13 px explanatory text beside substantially larger section headings. It is legible in the screenshot, but less comfortable for prolonged reading or weaker eyesight. Small type alone is not being classified here as an automatic accessibility-standard failure.

**Suggested change:** preserve 15–16 px for useful explanation, aim around 12–13 px for genuinely secondary labels, and simplify the illustrated frame rather than shrinking the teaching material. Keep important free/no-account conditions comfortably readable.

### 2. The professional hero nearly runs out of room at 320 px — low to medium

At 320 × 844, its primary button starts at **y = 794.66 px** and ends at **847.45 px**. Its label is visible and actionable, but approximately 3.5 px of the bottom edge exceeds the viewport. The secondary Job Loop link begins at y = 861.45 px and needs scrolling. At 390 px the primary button occupies y = 611.19–663.98 px and fits comfortably.

This is a narrow-width polish issue, not a blocked first action. The six-line professional headline plus the longer paragraph consume the available space.

**Suggested change:** shorten this headline/paragraph or modestly tighten the narrow-screen headline treatment. Preserve the readable body size and full button target.

### 3. Persona navigation splits “professionals” inside the word at 320 px — low

The three equal audience cells are **83 px wide** at the narrow width, with 11 px text. “Busy professionals” renders across three lines as “Busy / profession / als.” The controls remain about 71 px tall, so the touch target is good, but the label looks broken. It reads normally at 390 px.

**Suggested change:** use a shorter visible label, a two-row arrangement, or a layout that gives this label enough width without reducing its font size.

### 4. A few secondary targets fall below the requested 44 px review standard — low

The homepage header/footer logo links measure **147 × 40 px**. Principal homepage links and buttons meet 44 px height. On Job Loop, some text links within explanatory/FAQ content measured **19 px** high, unlike the principal links which have 44 px or larger targets. These are secondary interactions rather than barriers to the main task.

**Suggested change:** make the logo hit area at least 44 px tall and give standalone secondary links adequate padding. Avoid padding that causes overlapping targets in running text.

## Initial-view action checks

All figures are rendered CSS-pixel bounds. “Visible” means the action can be seen in the initial viewport; it does not assume a virtual keyboard is open.

| Route | 390 × 844 | 320 × 844 |
|---|---|---|
| `/` | Free-check action visible, y ≈ 396, height 54 | Visible, y ≈ 413, height 54; walkthrough also visible |
| `/check`, step 1 | Continue visible, y ≈ 672, height 44 | Continue visible, y ≈ 740, height 44 |
| `/job-loop` | Main check action and walkthrough visible | Main check action y ≈ 517, height ≈ 50; walkthrough visible |
| `/auth` | Google and email sign-in visible; Sign in height 48 | Google and email sign-in visible; secondary account action also visible |
| `/for-students` | Main action visible | Main action y ≈ 613, height ≈ 53 |
| `/for-mba` | Main action visible | Main action y ≈ 676, height ≈ 53 |
| `/for-career-switchers` | Main action y ≈ 611, height ≈ 53 | Main action visible at bottom edge, y ≈ 795; bottom ≈ 847 |

## Accessibility observations that worked

- No horizontal page overflow observed on the seven routes at either width. The measured document widths were 375 and 305 px respectively, within their 390/320 px viewports with the browser scrollbar.
- Mobile menu trigger is 44 × 44 px and has descriptive open/close names plus expanded state. Tab from the open trigger reaches “Free CV check.” Its focused link has a visible **3 px green outline**. Escape closes the menu and restores focus to the trigger.
- The check form has explicit Target role and Company labels, 50 px fields, 16 px input text, and a 44 px Continue control.
- Authentication fields are labeled and measure 48 px high with 16 px input text. The password visibility button is 44 × 44 px and has a “Show password” accessible name. Sign in is 48 px high; the recovery and account controls are 44 px high.
- The route exposes a skip-to-content link and clear headings in the accessibility tree. Its activation was not separately tested.

### Sampled actual text contrast

Ratios were computed from rendered foreground and effective ancestor background colors. These are representative text pairs, not an exhaustive audit of gradients, icons, focus states, or disabled controls.

| Rendered pair | Ratio |
|---|---:|
| Muted body `#58635D` on cream `#F7F4EE` | 5.70:1 |
| White text on primary green `#215C43` | 7.85:1 |
| Green `#215C43` on cream `#F7F4EE` | 7.15:1 |
| Illustration label `#52644F` on pale green `#EDF2E7` | 5.60:1 |
| Muted text `#58635D` on pale green `#EDF2E7` | 5.50:1 |
| Contribution question `#775830` on white | 6.52:1 |

The sampled palette is strong enough; increasing type size is the more consequential improvement.

## Evidence

- `.tmp/design-refresh/independent-mobile-home-320.png`
- `.tmp/design-refresh/independent-mobile-professionals-320.png`

Both images are actual CUA browser screenshots of the frozen client, captured without page modification.

## Bounded coordinator-requested recheck — final frozen build

Rechecked 14 October 2026 at `http://127.0.0.1:8404/` after the coordinator reported mobile readability and layout fixes. This addendum records fresh CUA screenshots and rendered DOM measurements of **home, the professional page, and CV-check step 1 only**, at 320 × 844 and 390 × 844. The earlier 8403 observations and all scores above are preserved. This narrower check does not justify a new whole-product or persona score.

**Result:** the professional headline/CTA fit and fragmented audience-label issues are resolved in the checked final build. The revised check progress labels are easier to read while its initial Continue action still fits. Home teaching labels and the caption improved, with some smaller details remaining. No blocking regression or page-level horizontal overflow was observed in these six viewport/route combinations.

| Rechecked item | Fresh observation |
|---|---|
| Professional CTA, 320 px | y = **625.25–678.05 px**, fully visible. Secondary Job Loop link y = **692.05–736.05 px**, also visible. This resolves original finding 2 in the checked viewport. |
| Professional CTA, 390 px | y = **606.88–659.67 px**, fully visible. |
| Professional audience selector | Visible labels are now **Students / MBAs / Professionals**, **12 px**, with **44 px** target height. No fragmented words at either width. At 320 px the professional cell is about 105 px wide. This resolves original finding 3 on the checked page. |
| Professional narrow headline | 35 px at 320 px; the headline remains prominent while leaving room for both actions. |
| CV-check progress | Three columns and two rows at both checked widths. Step names are **12 px**; the numbered badges remain **10 px**. Names wrap within their cells without horizontal overflow. |
| CV-check Continue, 320 px | y = **786.86–830.86 px**, height **44 px**. Fully visible, with about 13 px remaining below its bottom edge. |
| CV-check Continue, 390 px | y = **718.17–762.17 px**, height **44 px**. Fully visible. |
| Homepage CTA, 320 px | y = **434.61–488.61 px**, height **54 px**. Walkthrough link also fits. |
| Homepage CTA, 390 px | y = **398.84–452.84 px**, height **54 px**. Walkthrough link also fits. |
| Homepage teaching text | Fictional-example label, requirement/source headings, and the explanatory caption now measure **12 px** at both widths. The free/no-account hint is **12 px**; the hero description is **15 px**. This improves original finding 1. |
| Homepage residual small text | “CV check / Evidence review” and “04 / 06” are **11 px**; “A fictional vacancy · Students” is **10 px**; “You review the wording before downloading” is **11 px**. Quoted example passages remain **13 px**. The earlier small-type concern is reduced, not fully eliminated. |
| Page width | Document widths stayed **305 px at the 320 px viewport** and **375 px at the 390 px viewport**, consistent with the scrollbar and without horizontal page overflow. |

The shortened audience labels preserve the longer accessible names in the observed accessibility tree. Other accessibility behavior, authentication, Job Loop, the student/MBA routes, later check steps, and the secondary target-size finding were outside this bounded recheck and have not been regraded. Claims about hosted fonts or the broader test suite were not independently verified by this visual recheck.

Additional actual screenshot: `.tmp/design-refresh/final-mobile-check-320.png`. The temporary viewport override was reset after the recheck. No runtime source was edited.

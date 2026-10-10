# Jobvance interface system

The October 2026 redesign keeps the blue Jobvance identity and gives public pages and application work different reading rhythms. Public pages explain the product with original, clearly fictional document examples. Working screens keep real inputs, evidence and approval actions in the foreground.

## Foundation

| Token | Value | Purpose |
|---|---|---|
| Cobalt | `#2850df` | Primary actions, current navigation, focus |
| Ink | `#172338` | Headings and primary reading |
| Paper | `#f7f8fa` | Application background |
| Lavender | `#eef0ff` | Active steps and quiet visual separation |
| Lime | `#e1f69a` | Small emphasis surfaces, always with ink text |
| Secondary text | `#59657a` / `#657084` | Supporting text on light surfaces |

Colour is accompanied by text, numbers or icons for evidence and document states. Source passages are always readable text; illustrations contain no invented customer outcomes or screening scores.

The UI uses the local system sans stack, with a Georgia accent where a document or editorial contrast helps. No remote font or illustration service is required. Forms use 16px input text and a minimum 44px action target. Borders, spacing and shadows create hierarchy without animated background effects.

## Layout and interaction

- Public pages have a 1240px content limit, large responsive headings, alternating document examples and explanatory sections, and a clear free-check action.
- The free check has a six-step desktop rail and a compact phone rail. Earlier steps can be reopened; later steps remain controlled by the existing validation and review actions. A heading receives focus when a step changes.
- The account workspace groups CV files, preparation packs, application records and access settings. Totals come from actual records. Empty, unavailable and loading states stay distinct.
- The phone menu exposes the same destinations as desktop, closes after navigation, and supports Escape with focus returned to its trigger. A skip link targets the route content.
- Download and save remain separate actions. Approval is invalidated by input edits. Optional sign-in and cloud storage retain their consent controls.
- Pilot requests remain unsent drafts. Fictional demonstrations remain labelled; no testimonial, customer logo or synthetic traction is used as proof.

## Accessibility and release checks

Use 4.5:1 text contrast on the rendered surface, 3:1 for large text and essential control boundaries, visible keyboard focus, and at least 44px touch actions. Respect reduced-motion preferences. Check 320px and 390px widths as well as desktop, long document text, validation errors, expanded evidence, approval and download states. Automated journey tests protect functional behavior; browser screenshots provide visual evidence, not proof of exhaustive WCAG conformance.

This is an implemented interface revision, not a claim that conversion or retention improved. Those outcomes require real user sessions and feedback.

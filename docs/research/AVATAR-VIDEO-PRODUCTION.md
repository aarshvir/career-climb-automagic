# Human-avatar walkthrough: vendor evidence and production plan

Checked 13 October 2026 against primary pricing and help/API documentation. No account is assumed, created or signed into. No voice/face was uploaded, paid call made, credits purchased or video published. This document is a production-ready brief; it is not a rendered avatar video. Vendor demonstrations and realism claims do not establish comparative quality on Jobvance's script.

## Recommended production route

Shortlist **HeyGen and Synthesia** for a 15-second human-presenter audition, then use the better actual render for the full walkthrough. HeyGen is the first practical candidate because its official studio help directly documents screen recording as an editable video layer and the free allowance can fit a sub-minute trial. Synthesia provides a documented screen-recording-to-avatar workflow and strong caption controls. Captions/Mirage is a credible photoreal talking-head alternative, especially for expressive delivery, but current free avatar-generation and API-cost evidence is weaker for this small fixed walkthrough.

This is a workflow recommendation, not a claim that any vendor is objectively the highest quality. Judge the same script, framing and English voice from actual exports: natural eye contact, lip alignment, believable breathing/gestures, clear Jobvance/CV/DOCX pronunciation, and readable UI behind the presenter. Avoid ranking stock actors solely from marketing pages.

## Current published plans and API boundaries

| Service | Free route verified from official pages | Relevant paid route | API evidence and limits |
| --- | --- | --- | --- |
| **HeyGen** | Free lists **3 videos/month, up to 1 minute each**, Avatar IV access, 500+ stock video avatars and 30+ languages. Free includes limited trials of premium features. The exact new-account export/watermark entitlement should be checked in studio; the download help article is framed for paid users. [Pricing](https://www.heygen.com/pricing), [export help](https://help.heygen.com/en/articles/9834825-how-to-download-or-export-a-video) | Creator **$29/month** or **$24/month with annual billing**, 600 credits/month, up to 30-minute videos, 1080p export and watermark removal. Pro starts **$49/month**, with larger allocation and 4K. Credit consumption depends on features. [Pricing](https://www.heygen.com/pricing) | Separate pay-as-you-go wallet; **no free API credits since February 2026**. Current help table lists Avatar IV Studio/Digital Twin **$4.83/minute**, Photo **$2.31/minute**; Avatar III Studio **$0.99/minute**. API credits expire after 12 months; current API support states 10 concurrent jobs. A studio subscription does not supply free API usage. [API pricing help](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained) |
| **Synthesia** | Current Basic lists **10 video minutes/month, 500 credits/month and 9 avatars**. Standard video download help says Basic/trial users cannot download. A current **Syren beta exception** allows Basic watermarked download/sharing for its first two weeks; that feature has a 3-minute video limit. Eligibility for a new account was not checked. [Pricing](https://www.synthesia.io/pricing), [download help](https://help.synthesia.io/en/articles/9317524-how-do-i-download-my-synthesia-video), [Syren help](https://help.synthesia.io/en/articles/17441336-how-do-i-create-a-video-with-syren) | Starter **$29/month** or **$18/month billed yearly**; Pro **$89/month** or **$64/month billed yearly**, according to the current comparison. Starter adds roughly 12 minutes/month above the free allowance; Pro roughly 60. The pricing page contains duplicated/partly inconsistent credit copy, so verify the actual plan before buying. [Pricing](https://www.synthesia.io/pricing) | **Video API requires Pro or above**. Test requests are limited to 30/day and require a valid account API key; that limit is not a public free-generation allowance. Pricing page lists up to 360 API video minutes/year deducted from Pro usage. [Video API docs](https://docs.synthesia.io/reference/video-api-introduction), [pricing](https://www.synthesia.io/pricing) |
| **Captions / Mirage** | Current pricing says the Free plan has **no AI usage credits**, with one caption template. It does not establish a free photoreal avatar-render allowance. The public text's feature matrix loses checkmark detail, so exact platform-specific free tools need in-app verification. [Current pricing](https://captions.ai/pricing) | Current iOS plans list **Max $24.99/month, 500 credits**, and **Frontier $69.99/month, 1,400 credits**, with $139.99/$279.99 higher-volume tiers. These displayed prices explicitly cover iOS, so Windows/web rates are not assumed. [Pricing](https://captions.ai/pricing) | Current official Mirage API documentation describes script/image/actor input, generated talking-head video and credits-based billing. It does **not** publish a verified rate/free-credit allowance in the reviewed current page. Older Captions API search snippets claimed 360 introductory credits and $0.05/credit, but the original URL now redirects to a different current Mirage page; those old rates are not used. [Current API](https://captions.ai/help/api-reference/api) |

Prices are USD as displayed, exclude unverified taxes/country offers, and are not approved purchases. The chosen stock avatar, export entitlement, remaining credits, commercial-use conditions and exact render charge need verification in an authorized account. None of those are inferred from the user's computer, subscriptions or connected plugins.

Current Synthesia Syren help also mentions 2,000 launch credits granted on 9 October, expiring 9 November 2026 at 23:59 BST. Do not promise those credits to a new account or treat them as a durable free tier. The usual Starter/Pro export boundary remains the clearer production assumption.

## Screen recording, human placement, voice and captions

HeyGen's studio recorder can capture a tab/window/screen, trim or split the recording and add it as a video layer. This supports a real product walkthrough beneath a separately placed presenter. [Official screen recorder guide](https://help.heygen.com/en/articles/14251628-how-to-use-screen-recorder-in-ai-studio)

Synthesia can upload an existing MP4 screen recording (up to 500 MB and 30 minutes), transcribe its narration into the script an avatar speaks and edit the scenes. Its browser recorder requires an extension and broad site permissions; an already-recorded MP4 avoids needing that extension for this production. [Official screen recorder guide](https://help.synthesia.io/en/articles/9565193-how-do-i-use-the-ai-screen-recorder)

HeyGen export help documents separate audio and SRT downloads. Synthesia documents closed, dynamic and burned-in captions, plus SRT/VTT downloads. Use those supported caption routes; do not assume the chosen free tier allows every export. Captions supports editable captions and voice tools in its current product/help, but exact free matrix permissions remain unverified. [HeyGen export](https://help.heygen.com/en/articles/9834825-how-to-download-or-export-a-video), [Synthesia captions](https://help.synthesia.io/en/articles/6341718-how-do-captions-work-in-synthesia), [Captions help index](https://captions.ai/help/llms.txt)

Production specification:

- Real Jobvance screen recording at 1920×1080, 16:9. Use fictional, visibly labelled career material and a local/demo session with no personal CV, inbox, account identifier or private employer data.
- A photoreal stock human presenter in the bottom-right, approximately 20–24% of frame width, with enough margin for player controls. A neat rectangular or rounded presenter tile is acceptable. Do not promise a transparent alpha export without verifying the selected engine/plan.
- Keep the presenter off active buttons and key evidence. Reframe/crop the recording or move the presenter briefly if necessary. Screen text must remain readable when the video is shown in the intended page layout.
- Use one calm conversational English stock voice; audition pronunciation and pacing. Do not clone a person or invent a named human employee. Any custom person's face/voice requires their consent and the vendor's verification process. HeyGen explicitly requires a consent video for a video-based Digital Twin. [Consent guide](https://help.heygen.com/en/articles/12092609-recording-your-consent-video)
- Aim for 50–58 seconds at a natural pace. Add captions with high contrast and no more than two short lines. Supply an editable SRT/VTT and an accurate text transcript. Add a small “AI presenter · fictional demonstration” disclosure.
- No autoplay sound. The website keeps text instructions and a usable first action. If a render is unavailable, show the real text/demo route; do not label a still image or robotic narrator as a completed human-avatar video.

## Screen and narration brief

Record only verified behavior in the finished build. The second-vacancy scene is conditional on that action actually existing and having passed verification. Omit it from a recording of the baseline build.

| Time | Real screen action | Narration purpose |
| --- | --- | --- |
| 0–7 s | Homepage: highlight the first application action | Explain inputs and first outcome, without an interview/time-saving claim. |
| 7–17 s | Add fictional CV/career text; review what was read | Show that own contribution, academic context and numbers stay accurate. |
| 17–27 s | Paste one fictional vacancy | Explain that requirements belong to a specific role. |
| 27–39 s | Show one supporting source passage and one review question | Teach how to interpret findings, including what they cannot verify. |
| 39–49 s | Review wording; approve; demonstrate an actual download | Show the user's decision before the document leaves the workflow. |
| 49–58 s | Use the source for a second vacancy, if implemented | Make reuse concrete; end with the guest-start action. |

Draft narration, approximately 120 words:

> Start with your experience and one vacancy. Jobvance helps you see what your CV already shows, what needs explaining, and what to review before you apply. Add your CV or paste your career details. Check the text and remove anything you do not want to share. Then add the job description. Here, the requirement sits beside the source passage. A related phrase is a prompt to review, not proof that you meet the requirement. Keep your own contribution accurate, including coursework and team projects. Edit the wording, review the document, and approve your download. For the next vacancy, reuse your reviewed source and make a fresh application. You decide what to save, and you send the application yourself.

This narration assumes the reused-source action has been implemented. If it is not present, replace the second-last sentence with: “You can save the approved check privately if you choose.” Rehearse against the final buttons and screens; do not generate speculative UI or a fictional success state.

## Quality and delivery checks

1. Render the same 15-second excerpt on both shortlisted services only after an account/render is authorized. Compare the human appearance, synchronization and speech at the final bottom-right size; choose based on that footage.
2. Confirm no unsupported feature, fabricated outcome, account identifier or confidential text appears. The screen sequence must come from the actual reviewed build.
3. Verify the presenter does not hide the task, captions match the spoken content, and pronunciation is understandable. Check at desktop width and the embedded mobile player size.
4. Deliver the playable MP4, poster image, transcript and caption file, plus provider/engine/voice and date for later updates. Verify the exported video plays locally before placing it in the product.
5. Keep the video optional and accessible. If export, account access or paid generation is unavailable, report the exact missing prerequisite and preserve the finished script/screen brief. No rendered avatar artifact was produced in this research task.

Manual work estimate: 2–4 hours for the final screen capture, narration alignment, caption correction and review after the presenter/account decision, plus render waiting and any retakes. This is a production estimate, not vendor turnaround evidence. A studio trial may fit the short audition, but a polished downloadable master can still require paid export. One-off manual composition is preferable to API integration until the walkthrough has demonstrated usefulness.

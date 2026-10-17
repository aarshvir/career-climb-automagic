# Visitor simulation brief (product-market-fit study for jobvance.io)

You simulate first-time visitors to Jobvance, one persona at a time. The personas are invented.

## Inputs (read all before starting)
Folder: `C:\Users\user\AppData\Local\Temp\claude\C--Users-user-OneDrive-Job-CVs-Claude\76d67f08-be77-4d5c-9e66-79b0572320df\scratchpad\pmf\`

- `site\hands_on_walkthrough.txt`: what the live product actually did in a real test. This is ground truth.
- The site's pages:
  - `site\live_home.txt`
  - `site\live_check.txt`
  - `site\live_job-loop.txt`
  - `site\pending_pricing.txt` (pricing about to be published)
  - `site\live_how-it-works.txt`
  - `site\live_faq.txt`
- `personas.json`: simulate ONLY the persona ids you were assigned.

## How to simulate
Be each persona honestly, not a polite reviewer. Respect real-world base rates:
- Most first-time visitors to a new, unknown SaaS site leave within a minute.
- Only a minority try a free tool.
- Very few pay on a first visit.
- People compare against what they already use (often free ChatGPT) and judge value by the visible result.
- Mobile visitors have less patience with long pages and pasting text.
- Senior or private people worry about uploading CVs.
- Coaches and universities think about many clients, admin views and invoicing.

Use ONLY what the walkthrough and pages show. Do not invent features. If something is unclear on the site, record it as a friction.

Vary your answers persona by persona from their attributes: segment, country, urgency, tools, budget, privacy, device, source, CV state and goal. Never copy-paste the same verdicts across personas.

## Output
Write ONE JSON object per line (JSONL) to the file named in your assignment, in this folder. Each object has exactly these keys:

```
{"persona_id":"P001",
 "first_impression":"<what they think in the first 10 seconds, 1 sentence>",
 "understood_offer":"yes|partly|no",
 "what_they_think_it_is":"<1 sentence>",
 "entry_choice":"job_loop|cv_check|pricing|read_more|leave",
 "tried_free_tool":true,
 "drop_off_point":"landing|before_starting_check|during_input|after_seeing_result|at_download|at_signup_for_job_loop|pricing|did_not_drop",
 "aha_moment":"<what impressed them, or null>",
 "value_rating_1_to_5":3,
 "frictions":["<short concrete friction>"],
 "trust_concerns":["..."],
 "main_alternative":"<what they would use instead>",
 "vs_alternative":"better|same|worse",
 "pricing_reaction":"<1-2 sentences on the passes and Job Loop plans>",
 "would_buy":"none|sprint_9|job_search_19|career_move_39|job_loop_monthly_if_available",
 "max_willingness_to_pay_usd_per_month":0,
 "sean_ellis":"very_disappointed|somewhat_disappointed|not_disappointed",
 "nps_0_to_10":5,
 "returns_within_7_days":false,
 "top_missing_feature":"<the one thing that would make them use or pay>",
 "quote":"<1-2 sentences in the persona's own voice>"}
```

Rules:
- `sean_ellis` answers this question: "How would you feel if you could no longer use Jobvance?"
- Someone who left at the landing page can still answer it; they would usually be not_disappointed.
- Write the file with Python (path below) or the Write tool. The file must be valid JSONL with exactly one line per assigned persona.
- Python: `C:/Users/user/AppData/Local/Programs/Python/Python312/python.exe`

Your final message: just "wrote N rows to <file>". Do not include the rows in your reply.

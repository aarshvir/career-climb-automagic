# Jobvance: independent 20-role review brief

Audit date: 14 October 2026. Review the actual existing product and give deep, actionable suggestions. This is an analysis round, not authorization to change runtime, buy services, activate integrations, send messages, schedule announcements or deploy anything.

## Fixed snapshot and scope

Repository: C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent
Git documentation HEAD: e661c6493c30c88f2487800ff38aa10c46c9aae6
Published runtime: 57713fb1cb15b29be8d6dc745e3c87bcb718c4af (public version19)
Public site: https://jobvance.io
The root coordinator owns publication, browser viewport changes and consolidation. No runtime edits during this round. Write only your own report files. Use temporary analysis outputs only under .tmp/20-role-review/<your-role-id>.

Three target audiences: university students/new graduates, MBA applicants and busy professionals with5–10years of experience, including lateral moves. Current primary task: supply an existing CV and one actual vacancy; compare source wording; edit and approve an exact document; download; optionally save/reuse facts and track progress privately. The public first check does not require signup. A private cloud Job Loop adds reusable facts, selected employer-source vacancies, prepared documents, dated actions and separately consented configured model calls. Check actual code before making availability claims.

Current bounds: free ten-user pilot, shared US$50 per UTC-month AI/search ceiling. Real-money checkout is disabled. Proposed Focus$15 and Job Loop$29 prices are future hypotheses. No ads/outreach/emails/employer submissions, no new paid model/search/media calls or purchases in this audit. Do not retrieve, print or use secret keys. Public product/test fixtures only; do not expose any private candidate/account data. No fake testimonials, user counts, results, expert quotes, AI-authorship percentages, guaranteed scores or search rankings.

## Independence and depth

Start from your role's fresh examination of source/product/primary sources, not earlier audit grades or another agent's conclusions. Do not read other reports in this directory before locking your own findings. Existing implementation documents may explain contracts, but distinguish their claims from your observed verification. Do not invent runtime failures from code suspicion. Label observed, source-confirmed, inferred and unavailable evidence explicitly. Do not classify a deliberate deferred integration as a broken current promise unless the interface actually promises it.

Your task is a candid review of your named professional role. Use3–7 substantive findings or explain clean areas; quality matters more than a quota. For each recommendation give exact affected route/component or operation, the user/business consequence, what to change, how to verify success, dependencies and a rough implementation effort range in engineering days. Estimates are planning assumptions, not quotes or guaranteed results. Prefer shared workflow improvements over separate products for all personas. Identify what should not be built now.

Use current official primary sources for current vendor/pricing/platform-policy recommendations; browse when needed, link directly and date observations. Do not rely on unverified traffic, conversion, competitor outcome or compliance assertions. Code reviews do not require web search when local source fully establishes the issue. Do not install new services or make production changes. Avoid running the complete suite repeatedly; QA may run a bounded meaningful subset, with maxWorkers4, and report exact commands/results.

## Required outputs

Own two files named <NN>-<role-id>.md and <NN>-<role-id>.json in this directory. Markdown: roughly600–1000 useful words, concrete evidence and a short ordered plan. JSON must have this shape:

{
  "role_id":"...", "role_title":"...", "phase":"build|growth|operations",
  "snapshot":{"source_head":"e661c6493c30c88f2487800ff38aa10c46c9aae6","runtime_commit":"57713fb1cb15b29be8d6dc745e3c87bcb718c4af","live_checked":false},
  "methods":["..."],"not_tested":["..."],
  "criteria":[{"name":"...","score":0,"weight":20,"evidence":"..."}],
  "role_score":0,"score_confidence":"high|medium|low",
  "strengths":["..."],
  "findings":[{"id":"ROLE-01","priority":"P0|P1|P2|P3","category":"...","problem":"...","evidence":[{"type":"observed|source-confirmed|inferred|unavailable","path":"repo-relative path if relevant","line":1,"url":"direct primary URL if relevant","detail":"..."}],"impacted_personas":["student","mba","professional"],"recommendation":"...","acceptance_criteria":["..."],"dependencies":["..."],"effort_engineer_days":{"low":0.5,"high":2},"cost_effect":"...","pilot_required":true,"confidence":"high|medium|low"}],
  "open_questions":["..."],"do_not_build_now":["..."]
}

Use five role-specific readiness criteria, each weighted20, to calculate your role_score out of100. This is an expert opinion on that role's scope, not a forced95+ score, a whole-product certification or measured customer success. Criteria scores should cite evidence; uncertain areas reduce confidence or remain untested, not become made-up facts. Root will show role scores with their scopes and will not pretend unlike scores are interchangeable.

P0: evidenced urgent security/data-loss/core outage; P1: highest-value work before widening the pilot; P2: pilot learning/iteration; P3: later. No severity inflation to force attention. Mark recommendations requiring research as hypotheses. Do not automatically promote an issue just because several roles repeat it; root verifies severity on impact.

Finish by reporting your score, output filenames and three highest-value findings in a concise message. Do not commit, push or publish. Do not message other chats or contact anyone. Other team agents share the worktree; leave their files alone.

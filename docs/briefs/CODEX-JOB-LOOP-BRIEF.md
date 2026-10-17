# Brief for Codex: make Job Loop a best-in-class paid product

You are taking Jobvance (jobvance.io, repo `aarshvir/career-climb-automagic`) from a beta to a polished, account-based, paid product. Read this whole brief before changing anything.

## 0. Start from Claude's work
- **Merge `claude/dodo-payments` into main now.** It already contains all of main. It adds:
  - Dodo Payments billing (test mode first) and one-time CV passes ($9 / $19 / $39);
  - the combined pricing page;
  - removal of a buyer's email from the payment return URL.

  Do not apply its migrations or deploy its edge functions. Right after you publish, Claude will apply the two pending Dodo migrations and deploy `create-checkout`, `get-entitlement`, `dodo-webhook` and `tailor-for-job`.
- **Merge `claude/deep-tailor` when Claude confirms it is finished.** It adds "Deep tailor".
  - What it does: the AI uses answers the candidate has confirmed as true to write stronger bullets, new bullets and a cited profile summary.
  - How it stays honest: every change is validated against the CV line and the cited answers, so nothing is invented.
  - Where it lives: the backend is in `supabase/functions/_shared/cv-tailor.ts` and `tailor-for-job`. Claude is finishing its /check screens and the requirement-coverage view.
  - **Use this engine for every CV that Job Loop prepares.** Leave the tailoring and review internals of `src/pages/CvCheck.tsx` to Claude's branch, to avoid conflicts.
- **Read `docs/audits/2026-10-17-pmf-simulation/PMF-SIMULATION.html`.**
  - What it found: 100 simulated visitors; 0% "very disappointed"; NPS −88; 11% would pay.
  - Why: thin CV changes; no proof of fit; a homepage promise the product can't yet keep (account wall, 10 places, few sources); painful input on a phone; an unknown brand; a plain PDF.

## 1. The product: Job Loop
One promise, delivered for real: **"Tell us what you want once. Every day, Job Loop finds new roles that fit you and prepares a tailored CV for each one."**

- **An account is required for everything.**
  - Remove every "no account needed" or guest wording, including on /check.
  - The CV check becomes a feature inside the account.
- **Onboarding quiz**, about 90 seconds, one question per screen, with a progress bar, designed for a phone first. Questions:
  1. target roles;
  2. seniority;
  3. cities or countries, and remote or hybrid;
  4. minimum salary and currency;
  5. industries to include or exclude;
  6. right to work or visa;
  7. notice period;
  8. how often to search (daily, 3 times a week, weekly);
  9. discretion: hide my current employer and its group;
  10. CV: upload a CV, upload a LinkedIn PDF, or build a CV from answers.
- **First run straight after the quiz.** Time to first value must be under 2 minutes. Show real matching openings, each with a plain "why this fits you" and "what's missing".
- **Daily runs** at the time the user chooses, plus a morning digest email:
  - new matches only, de-duplicated across sources;
  - expired posts removed;
  - every link checked live.
- **One click per match** gives:
  - a Deep-tailored CV (PDF and Word);
  - requirement coverage: covered, partly covered or missing, with the CV line as proof — never a fake ATS percentage;
  - a cover letter;
  - a short recruiter-message draft.

  All of it is built only from the user's confirmed facts.
- **Tracker:**
  - stages: saved → applied → interview → offer;
  - follow-up reminders;
  - a weekly progress summary.
- **Coverage that justifies "every day".**
  - Expand sources through lawful feeds:
    - employer ATS job APIs: Greenhouse, Lever, SmartRecruiters, Workday, Oracle Recruiting, SuccessFactors;
    - licensed aggregator partner APIs where available, such as Jooble and Adzuna;
    - jobs the user pastes in.
  - Priority markets: UAE and GCC, India, UK, US.
  - Do not scrape sites whose terms forbid it, including LinkedIn.
  - Remove the 10-account cap only once processing capacity and the AI budget scale with paying users.
- **Design:** best in class, calm, confident and designed for a phone first. Add 3 ATS-safe CV templates.

## 2. Copy and trust
- **Remove the beta language:** "beta", "pilot", "proposed", "free while in beta", "ten places" and similar labels. Write as an established product: confident and specific.
- **Every claim must be true on the day it ships.** State exactly which countries and how many sources are searched.
- **Earn trust with real things:**
  - the named AI provider and its data-retention terms, on /check and the privacy page;
  - a sample dashboard and a sample tailored CV built from a fictional profile and clearly labelled "Example";
  - a clear refund and cancellation policy;
  - company and support contact details.
- **Do not invent social proof or history.** That means no made-up:
  - testimonials or review scores;
  - user counts or company logos;
  - "since 20XX" claims or live counters.

  Add real testimonials and real numbers as they come in. This is required by consumer-protection law and by Dodo's merchant acceptance policy, under which Dodo can suspend payouts.

## 3. Pricing and the paid funnel
Target: at least 40% of people who start a trial become paying customers.

- **Funnel:**
  1. quiz;
  2. a personalised preview: the number of real matches found for their preferences this week, plus 3 real examples;
  3. create an account and choose a plan;
  4. a **14-day free trial that requires a card**;
  5. daily value;
  6. reminders;
  7. the first charge.
- **Plans, through Dodo subscriptions.** Extend the Dodo integration on `claude/dodo-payments` to subscriptions: active, renewed, cancelled and payment-failed webhooks, with entitlements by plan. Build and deploy this in Dodo test mode.

  | Plan | Price | Runs |
  |---|---|---|
  | Weekly | $29/month | 1 run a week |
  | Active (most popular) | $59/month | 3 runs a week |
  | Daily | $99/month | 1 run a day |

  Keep the one-time CV passes ($9 / $19 / $39) as add-ons.
- **Card-network and consumer rules.** These are also what keep the 40% safe from chargebacks.
  - Before the card is entered, show the price, the trial end date and the date of the first charge.
  - Email the terms at sign-up.
  - Send a reminder at least 7 days before the first charge (on day 7), and again 2 days before.
  - Let users cancel in two clicks from Settings.
  - Offer 7-day money-back after the first charge.
  - No pre-ticked add-ons, fake countdowns or fake scarcity.
- **Benchmark.** Card-required trials convert at about 25–35% (median) and about 50% in the top quarter. Reaching 40% means top-quarter execution, which only comes from daily value the user can see.

## 4. Prove it with the same 100-persona simulation
Targets: **NPS ≥ 60** and **≥ 40% of trial starters paying**.

- **Fixed inputs.** Use `docs/audits/2026-10-17-pmf-simulation/`. Keep `personas.json` and the realism rules in `AGENT_BRIEF.md` exactly as they are.
- **New ground truth.**
  - Run the real journey on production with a test account: quiz → first run → 7 days of runs → prepared CVs. Write it up as the new walkthrough.
  - Take a fresh snapshot of the public pages.
- **Each persona goes through these steps:**
  1. visits;
  2. takes the quiz or doesn't;
  3. starts the account and trial or doesn't;
  4. receives 14 days of results at the quality you actually observed;
  5. keeps paying or cancels;
  6. gives an NPS score and answers "very disappointed?" on day 14.
- **Report these:**

  | Metric | Target |
  |---|---|
  | visitor → quiz | report only |
  | quiz → trial | report only |
  | trial → paid | ≥ 40% |
  | NPS among trial users | ≥ 60 |
  | "very disappointed" | ≥ 40% |

- **Iterate on the product, never on the personas or the rules,** until the targets are met. Report the raw results.

## 5. Engineering standards
- **Quality gates:**
  - Keep every existing test passing.
  - Add tests for the quiz, runs, billing and entitlements.
  - Typecheck, lint and build must be clean, and mobile layouts checked.
- **Billing** stays in Dodo test mode until the owner switches it to live.
- **Publishing.** Publish when the gates pass. Then tell the owner which backend steps remain.

import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Plus } from 'lucide-react';
import './ProductPage.css';
import './JobLoop.css';
import './CvCheckLanding.css';
import { FREE_TAILORED_CVS_PER_MONTH, cvCheckCostText } from '@/lib/cv-check-faqs';
import { staticPageMeta, SITE_ORIGIN } from '@/lib/public-site-meta';
import { AI_SENT_TEXT, TAILORING_FACTS_CHECKED, checkedExamples, exampleResult, slipThroughExamples, tailoringFaqs, truthfulTailoringStructuredNodes, type TailoringExample } from '@/lib/truthful-tailoring';

const allowed = [
  'Reword a bullet or a plain text line. The AI is asked to use only that line’s own facts. It is also asked to make each line stronger and to use the job’s own words where the line supports them. That request is where overstatement can come from, and the checks below catch some of it.',
  'Reorder the bullets under one role, with those closest to the job first. The same bullets must come back, none added and none dropped.',
  'Write a short profile of up to 420 characters, built from CV lines it cites and any answers you confirmed. If your CV has a recognised Profile, Summary or Objective heading (optionally with a Professional or Career prefix), the new profile replaces the text under it and your original is shown with the change. Otherwise a PROFILE section is added after your name and contact lines when Jobvance recognises them, and old text stays. If it does not recognise them, the profile is left out and counted in the note of suggestions left out.',
  'Ask up to five plain questions about requirements your CV does not show. A question is checked only for form: one line under 300 characters that ends in a question mark, with no link or markup, and repeats are removed. What it means is not checked, so read each one and answer only what is true.',
  'Add a new bullet only from an answer you wrote, confirmed and tied to a CV line, up to five in all.',
];

const checks: [string, string][] = [
  ['Numbers', 'A number written in digits that is not in that line, compared as written together with any % or unit letter that follows it. So “12 months” and “12 million” count as the same number, “18%” and “18 percent” do not, and two figures can be swapped between claims. Numbers written as words, such as “forty”, are not checked.'],
  ['Names and tools', 'A capitalised word that is not in that line and is not on a built-in list of ordinary capitalised words, which includes Senior, Executive, Manager and Strategy. Names written in lower case are not checked.'],
  ['Qualifications', 'Listed words such as certified, licensed, chartered, degree, MBA or PMP that are not in that line. Other wording, such as “qualified accountant”, is not checked.'],
  ['Ownership', 'Each listed ownership verb in the suggestion (led, managed, owned, built, launched, delivered and others) must also appear in the text it is checked against. Forms of one verb count together, so “leading” is supported by “led”, but “ran” is not supported by “led”. Fixed phrases where the word is a noun, such as “run rate” or “headcount”, do not count. A title that holds a listed word, such as “Head of Finance”, still supports “headed”. Unlisted verbs such as “developed” or “implemented” are not checked.'],
  ['Cautious wording', 'If any text it is checked against contains a word from a fixed list (for example projected, estimated, planned, expected, not, never, would, might or the month May), the suggestion must match one of those source passages after normalisation. Other hedges, such as “aimed to”, “approximately” or “pilot”, are not on the list.'],
  ['Length and shape', 'One line only. The length is capped at the larger of 260 characters or about 1.8 times the text it is checked against: your original line and any answer used for a rewrite, the answers alone for a new bullet.'],
  ['Reordering', 'Only the same bullets under the same role, in a new order. A list that adds, drops or mixes bullets is left out and counted.'],
  ['New lines', 'A new bullet is checked against the answers you confirmed, not against your CV lines. An answer is tied to the CV line you chose: a reworded line or a new bullet can use it only there. A profile can use it whenever the profile cites that line, next to lines from other roles.'],
  ['Profile', 'Up to 420 characters, and the length rule above also applies. It is checked against all the lines it cites taken together, including name, contact and role lines, so a number or verb from one role can sit beside a claim from another. The AI chooses which lines to cite, so a verb from one role can support a claim beside another role. Each ownership verb in the profile must appear in one of the cited lines or confirmed answers. A cautious-wording word in any cited line means the suggested profile must match one cited CV line or a confirmed answer tied to it after normalisation; otherwise it is rejected.'],
];

const seen = [
  'A list called “What changed for this job”. A reworded line shows the new wording (Now) and your original wording (Your original), with a button to keep your original. A replaced profile works the same way.',
  'A reorder is described in one sentence, without a before and after, and has no button of its own.',
  'A new line, or a new profile with nothing to replace, has no original. Its button reads “Remove this line” or “Remove this summary”.',
  'A note, when it applies, saying how many AI suggestions were left out. It counts suggestions that fail a check, reorders that do not match, suggestions it could not read or place, and any beyond the number it reads. A suggestion that changes nothing is not counted.',
  'An undo button after you improve the CV with your answers, or when you had edited your CV before tailoring. It lasts while the page stays open.',
  'Downloads as PDF, Word or text once you confirm your CV is accurate. A PDF also needs a preview that fits the page length you chose.',
];

const limits = [
  'They cannot tell whether the claims already in your CV are true.',
  'They do not decide whether you qualify for a job or predict what an employer will decide.',
  'They miss claims written in words they do not look for: numbers written as words, lower-case names, unlisted verbs, qualifications and hedges, and new outcomes in ordinary words.',
  'They compare numbers as written, so two figures can be swapped between claims, and a profile is checked against all the lines it cites together.',
  'Their word lists are English. For a CV in another language the AI is asked to write in that language and the checks catch far less; the CV Check says its wording check is for English text.',
  'Common title words are not treated as new names, so a title can rise unnoticed, for example “Analyst” to “Senior Analyst”.',
];

const keepReading: [string, string][] = [
  ['/cv-check', 'The free CV Check, requirement by requirement'],
  ['/guides/cv-check-without-ai', 'What a CV check without AI shows and misses'],
  ['/guides/resume-privacy-before-upload', 'What to check before you upload a CV anywhere'],
  ['/guides/achievements-without-numbers', 'Describe achievements when you have no numbers'],
  ['/guides/cv-job-description-evidence', 'How to compare a CV with a job description using evidence'],
  ['/guides/cv-check-no-fit-percentage', 'Why a match percentage is not a verdict'],
];

const resultLabel = { kept: 'Kept', 'left-out': 'Left out' } as const;
const slipLabel = 'Passes the checks';

function ExampleTable({ caption, label, examples, slip }: { caption: string; label: string; examples: TailoringExample[]; slip?: boolean }) {
  return <div className="cvl-table-wrap" role="region" aria-label={label} tabIndex={0}>
    <table className="cvl-table">
      <caption>{caption}</caption>
      <thead><tr><th scope="col">Your line</th><th scope="col">AI suggestion</th><th scope="col">Result</th><th scope="col">Why</th></tr></thead>
      <tbody>{examples.map(example => {
        const result = exampleResult(example);
        return <tr key={example.suggestion}><td>{example.source}</td><td>{example.suggestion}</td><td><span className={`cvl-badge cvl-badge--${slip ? 'partial' : result === 'kept' ? 'direct' : 'missing'}`}>{slip ? slipLabel : resultLabel[result]}</span></td><td>{example.why}</td></tr>;
      })}</tbody>
    </table>
  </div>;
}

/** Public, indexable page explaining the checks on AI CV tailoring. Every result in its tables is computed by the product's own validator. */
export default function TruthfulTailoring() {
  const meta = staticPageMeta('/truthful-cv-tailoring');
  const faqSchema = { '@context': 'https://schema.org', ...truthfulTailoringStructuredNodes()[0], '@id': `${SITE_ORIGIN}/truthful-cv-tailoring#faq`, isPartOf: { '@id': `${SITE_ORIGIN}/truthful-cv-tailoring#page` } };
  return <main className="product-page product-page--cvcheck jv-rails">
    <Helmet><title>{meta?.title}</title><meta name="description" content={meta?.description} />{meta && <link rel="canonical" href={SITE_ORIGIN + meta.path} />}<meta property="og:title" content={meta?.title} /><meta property="og:description" content={meta?.description} />{meta && <meta property="og:url" content={SITE_ORIGIN + meta.path} />}<meta property="og:type" content="website" /><script type="application/ld+json">{JSON.stringify(faqSchema).replace(/</g, '\\u003c')}</script></Helmet>
    <div className="jv-page product-inner">
      <header className="jv-page-head product-page-heading">
        <p className="jv-caption">AI CV tailoring</p>
        <h1 className="jv-page-title jv-enter-h1">AI CV tailoring: how the AI’s suggestions are checked</h1>
        <p className="jv-lead product-page-intro">Jobvance’s AI is asked to use only what is already in your CV. Its suggestions then pass word-rule checks, which leave out some added numbers, names, qualification words and ownership verbs. The checks have limits, so you read the changes before you download.</p>
        <div className="jv-page-actions">
          <Link to="/check" className="jv-btn jv-btn--primary jv-btn--lg">Start the free CV check<ArrowRight aria-hidden="true" /></Link>
          <Link to="/privacy" className="jv-link"><span>How your CV is handled</span><ArrowRight aria-hidden="true" /></Link>
        </div>
        <p className="cvl-note">Free account. AI tailoring is optional, and {FREE_TAILORED_CVS_PER_MONTH} AI-tailored CVs a month are free when AI tailoring is available. Comparing without AI has no limit.</p>
      </header>

      <div className="product-main-content cvl">
        <section className="jv-section product-section" aria-labelledby="tt-glance-title">
          <h2 id="tt-glance-title" className="jv-section-title">The checks at a glance</h2>
          <dl className="cvl-glance">
            <div><dt>What the AI may do</dt><dd>Reword a line, reorder bullets under one role, write a short profile and ask up to five questions about gaps. It is asked to use only what is in your CV.</dd></div>
            <div><dt>What the checks look for</dt><dd>Some added numbers in digits, capitalised names, listed qualification words and listed ownership verbs.</dd></div>
            <div><dt>What you control</dt><dd>You review the listed changes and the available keep/remove controls, then download only after you confirm the CV is accurate.</dd></div>
            <div><dt>What the checks are</dt><dd>Rules about wording, a first filter and not a fact-check. They do not verify your CV, read meaning or check lower-case names.</dd></div>
            <div><dt>Facts checked</dt><dd>{TAILORING_FACTS_CHECKED}</dd></div>
          </dl>
        </section>

        <section className="jv-section product-section" aria-labelledby="tt-allowed-title">
          <h2 id="tt-allowed-title" className="jv-section-title">What the AI is allowed to do</h2>
          <p>The AI does not write your CV from scratch. It proposes edits to your own lines, and Jobvance builds the tailored version from your original lines plus the edits that pass the checks. Jobvance recognises your name, contact lines, headings and role lines by their layout and copies them as they are. A line it does not recognise, such as the contact lines under an all-capitals name, an unusual mixed-case heading, or a job title on its own line above a line of dates, counts as plain text and can be reworded.</p>
          <ul className="cvl-outcomes">{allowed.map(item => <li key={item}>{item}</li>)}</ul>
        </section>

        <section className="jv-section product-section" aria-labelledby="tt-checks-title">
          <h2 id="tt-checks-title" className="jv-section-title">The checks on the AI’s suggestions</h2>
          <p>Each rewrite is compared with its own line, plus any answer you confirmed for that line. A new bullet is compared with the answers only, and a profile with all the lines it cites taken together. A suggestion that fails a check is left out and your original line stays. The check tells you how many were left out, not what they said.</p>
          <div className="cvl-table-wrap" role="region" aria-label="The checks and what each leaves out" tabIndex={0}>
            <table className="cvl-table cvl-table--compact">
              <caption>What is left out, and what is not checked</caption>
              <thead><tr><th scope="col">Check</th><th scope="col">What is left out</th></tr></thead>
              <tbody>{checks.map(([name, rule]) => <tr key={name}><th scope="row">{name}</th><td>{rule}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="jv-section product-section" aria-labelledby="tt-example-title">
          <h2 id="tt-example-title" className="jv-section-title">Six suggestions, checked</h2>
          <p>These lines are invented. The result beside each one comes from the same check the product runs.</p>
          <ExampleTable caption="Invented example for illustration. Not a customer result." label="Six invented suggestions and their results" examples={checkedExamples} />
        </section>

        <section className="jv-section product-section" aria-labelledby="tt-seen-title">
          <h2 id="tt-seen-title" className="jv-section-title">What you see in the check</h2>
          <ul className="cvl-outcomes">{seen.map(item => <li key={item}>{item}</li>)}</ul>
        </section>

        <section className="jv-section product-section" aria-labelledby="tt-limits-title">
          <h2 id="tt-limits-title" className="jv-section-title">What these checks do not do</h2>
          <p>The checks compare words. They do not read meaning, they do not verify your CV and their word lists are finite. These three invented suggestions pass every check above and are still wrong, which is why you read each change and keep your original when you are unsure.</p>
          <ExampleTable caption="Invented example for illustration. Not a customer result. All three pass every check." label="Three invented suggestions that pass every check" examples={slipThroughExamples} slip />
          <ul className="cvl-outcomes">{limits.map(item => <li key={item}>{item}</li>)}</ul>
        </section>

        <section className="jv-section product-section" aria-labelledby="tt-questions-title">
          <h2 id="tt-questions-title" className="jv-section-title">When the AI asks you questions</h2>
          <p>After tailoring, the AI may ask up to five plain questions about requirements your CV does not show, such as whether you ran a workshop or supported someone who did. Answer only what is true. For each answer you confirm that it is accurate and safe to share with the AI provider, and choose the CV line it belongs to.</p>
          <p>“Improve my CV with these answers” then prepares another version from your original CV, using your confirmed answers, each one tied to the line you chose. It uses one AI-tailored CV from your allowance. Your current version is kept, so you can undo.</p>
        </section>

        <section className="jv-section product-section" aria-labelledby="tt-device-title">
          <h2 id="tt-device-title" className="jv-section-title">Where the AI runs and what is sent</h2>
          <p>{AI_SENT_TEXT} The AI sees only the first 12,000 characters of a job description. Read <Link to="/privacy">how your information is handled</Link>, or <Link to="/guides/cv-check-without-ai">what a CV check without AI shows</Link>.</p>
        </section>

        <section className="jv-section product-section" aria-labelledby="tt-cost-title">
          <h2 id="tt-cost-title" className="jv-section-title">What AI tailoring costs</h2>
          <p>{cvCheckCostText} See <Link to="/pricing">pricing</Link>.</p>
        </section>

        <section className="jv-section product-section" aria-labelledby="tt-faq-title">
          <h2 id="tt-faq-title" className="jv-section-title">Questions about AI CV tailoring</h2>
          <div className="jv-faq jv-faq--wide product-faqs">{tailoringFaqs.map(([question, answer]) => <details key={question}><summary><span>{question}</span><span className="jv-faq-toggle" aria-hidden="true"><Plus /></span></summary><p>{answer}</p></details>)}</div>
        </section>

        <section className="jv-section product-section" aria-labelledby="tt-read-title">
          <h2 id="tt-read-title" className="jv-section-title">Keep reading</h2>
          <ul className="cvl-read">{keepReading.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}</ul>
          <div className="jv-page-actions"><Link to="/check" className="jv-btn jv-btn--primary jv-btn--lg">Start the free CV check<ArrowRight aria-hidden="true" /></Link></div>
        </section>
      </div>
    </div>
  </main>;
}

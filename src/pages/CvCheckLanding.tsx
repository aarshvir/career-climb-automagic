import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Plus } from 'lucide-react';
import './ProductPage.css';
import './JobLoop.css';
import './CvCheckLanding.css';
import { analyzeCvEvidence } from '@/lib/cv-evidence';
import { evidenceStatusLabels } from '@/lib/evidence-labels';
import { cheapestPassPrice, cvCheckCostText, cvCheckFaqs, FACTS_CHECKED, FREE_TAILORED_CVS_PER_MONTH } from '@/lib/cv-check-faqs';
import { staticPageMeta, SITE_ORIGIN } from '@/lib/public-site-meta';
import { EXAMPLE_AD, EXAMPLE_CV } from '@/lib/cv-check-example';

const outcomeMeaning: Record<keyof typeof evidenceStatusLabels, string> = {
  direct: 'The ad’s wording appears in your CV, with the closest line shown beside it.',
  partial: 'A related line exists, but it may do different work (for example “supported” where the ad says “lead”). You decide.',
  missing: 'No line in your CV shows it. You may have a true example to add, or the experience may be absent.',
  review: 'A condition such as work rights or a licence. Only you can say, so it is flagged rather than scored.',
};

const steps = ['Add your CV and the job', 'Read what the job asks for', 'Read the outcomes and the closest CV lines, or review AI changes', 'Download after you confirm your CV is accurate'];
const keepReading: [string, string][] = [
  ['/guides/cv-job-description-evidence', 'How to compare a CV with a job description using evidence'],
  ['/guides/cv-check-no-fit-percentage', 'Why a match percentage is not a verdict'],
  ['/guides/resume-privacy-before-upload', 'What to check before you upload a CV anywhere'],
  ['/guides/achievements-without-numbers', 'Describe achievements when you have no numbers'],
  ['/guides/cv-upload-failure-checklist', 'Fix a CV that will not upload'],
  ['/guides/cv-pdf-or-docx', 'PDF or DOCX: which file to send'],
];

/** Public, indexable page for the free CV Check. The check itself lives at /check behind a free account and stays out of search. */
export default function CvCheckLanding() {
  const meta = staticPageMeta('/cv-check');
  const report = analyzeCvEvidence(EXAMPLE_CV, EXAMPLE_AD);
  const cvLines = EXAMPLE_CV.split('\n');
  return <main className="product-page product-page--cvcheck jv-rails">
    <Helmet><title>{meta?.title}</title><meta name="description" content={meta?.description} />{meta && <link rel="canonical" href={SITE_ORIGIN + meta.path} />}<meta property="og:title" content={meta?.title} /><meta property="og:description" content={meta?.description} />{meta && <meta property="og:url" content={SITE_ORIGIN + meta.path} />}<meta property="og:type" content="website" /></Helmet>
    <div className="jv-page product-inner">
      <header className="jv-page-head product-page-heading">
        <p className="jv-caption">Free CV Check</p>
        <h1 className="jv-page-title jv-enter-h1">Check your CV against a job ad, requirement by requirement</h1>
        <p className="jv-lead product-page-intro">Add your CV and one job ad. Jobvance compares up to the first 40 parsed requirements in English and marks them {evidenceStatusLabels.direct}, {evidenceStatusLabels.partial}, {evidenceStatusLabels.missing} or {evidenceStatusLabels.review}, with the closest line from your CV beside each outcome. There is no fit percentage. You need a free Jobvance account to open the check.</p>
        <div className="jv-page-actions">
          <Link to="/check" className="jv-btn jv-btn--primary jv-btn--lg">Start the free CV check<ArrowRight aria-hidden="true" /></Link>
          <Link to="/privacy" className="jv-link"><span>How your CV is handled</span><ArrowRight aria-hidden="true" /></Link>
        </div>
        <p className="cvl-note">Free account. Comparing without AI has no limit and runs on your device. AI tailoring is optional, and {FREE_TAILORED_CVS_PER_MONTH} AI-tailored CVs a month are free.</p>
      </header>

      <div className="product-main-content cvl">
        <section className="jv-section product-section" aria-labelledby="cvl-glance-title">
          <h2 id="cvl-glance-title" className="jv-section-title">The free CV check at a glance</h2>
          <dl className="cvl-glance">
            <div><dt>What it does</dt><dd>Compares one CV with one job ad and shows which requirements your CV covers.</dd></div>
            <div><dt>What you need</dt><dd>A free Jobvance account, and a text-based PDF, DOCX or TXT CV up to 5 MB, or pasted CV text.</dd></div>
            <div><dt>What it costs</dt><dd>Free to start. Unlimited comparisons without AI. {FREE_TAILORED_CVS_PER_MONTH} AI-tailored CVs a month. Optional one-time passes from ${cheapestPassPrice}.</dd></div>
            <div><dt>What it does not do</dt><dd>Give a fit percentage or ATS score, or predict a hiring decision.</dd></div>
            <div><dt>Facts checked</dt><dd>{FACTS_CHECKED}</dd></div>
          </dl>
        </section>

        <section className="jv-section product-section" aria-labelledby="cvl-see-title">
          <h2 id="cvl-see-title" className="jv-section-title">What you see</h2>
          <p>Each of the parsed requirements, up to 40, gets one of four outcomes. Additional and omitted passages remain available for review in the check.</p>
          <ul className="cvl-outcomes">
            {(Object.keys(outcomeMeaning) as (keyof typeof outcomeMeaning)[]).map(status => <li key={status}><strong>{evidenceStatusLabels[status]}.</strong> {outcomeMeaning[status]}</li>)}
          </ul>
          <div className="cvl-table-wrap">
            <table className="cvl-table">
              <caption>Invented example for illustration. Not a customer result.</caption>
              <thead><tr><th scope="col">Requirement in the ad</th><th scope="col">Outcome</th><th scope="col">Closest line in the CV</th></tr></thead>
              <tbody>{report.requirements.map(item => {
                const passage = item.evidence[0];
                return <tr key={item.id}><td>{item.vacancyQuote}</td><td><span className={`cvl-badge cvl-badge--${item.status}`}>{evidenceStatusLabels[item.status]}</span></td><td>{passage ? <><span className="cvl-line">Line {passage.line}</span> {cvLines[passage.line - 1]}</> : <span className="cvl-none">None shown</span>}</td></tr>;
              })}</tbody>
            </table>
          </div>
        </section>

        <section className="jv-section product-section" aria-labelledby="cvl-percent-title">
          <h2 id="cvl-percent-title" className="jv-section-title">Why there is no percentage</h2>
          <p>A percentage hides which requirement is missing and depends on how one tool counts words. Jobvance shows the requirement and the closest line from your CV, so you decide what to add, change or leave out. Matching words are a starting point, not a verdict. Read more in <Link to="/guides/cv-check-no-fit-percentage">What is a good CV match score?</Link></p>
        </section>

        <section className="jv-section product-section" aria-labelledby="cvl-device-title">
          <h2 id="cvl-device-title" className="jv-section-title">Your CV and your device</h2>
          <p>Your file stays on your device, and comparing without AI runs entirely on your device. If you choose AI tailoring, the CV text and job description are sent to our AI provider to prepare one version. Saving a check to your Jobvance account is optional. See <Link to="/privacy">how your information is handled</Link>.</p>
        </section>

        <section className="jv-section product-section" aria-labelledby="cvl-ai-title">
          <h2 id="cvl-ai-title" className="jv-section-title">If you want tailoring</h2>
          <p>AI tailoring rewords and reorders what is already in your CV and lists each change beside your original wording. A change is rejected if it adds a number, a capitalised name or tool, a qualification word, or a stronger ownership verb than your CV uses (for example “led” where you wrote “supported”). This is a rule check on wording, not a fact-check of your CV, so read every change before you download.</p>
          <p>{cvCheckCostText} See <Link to="/pricing">pricing</Link>.</p>
        </section>

        <section className="jv-section product-section" aria-labelledby="cvl-limits-title">
          <h2 id="cvl-limits-title" className="jv-section-title">What this check cannot do</h2>
          <p>This is an English wording check covering up to the first 40 parsed requirements, with additional and omitted passages retained for your review. It does not verify claims in your CV, decide whether you qualify, or predict what an employer will decide. It reads text-based PDF, DOCX and TXT files up to 5 MB; scanned PDFs and old .doc files need converting first.</p>
        </section>

        <section className="jv-section product-section" aria-labelledby="cvl-steps-title">
          <h2 id="cvl-steps-title" className="jv-section-title">Four steps</h2>
          <ol className="cvl-steps">{steps.map(step => <li key={step}>{step}</li>)}</ol>
        </section>

        <section className="jv-section product-section" aria-labelledby="cvl-who-title">
          <h2 id="cvl-who-title" className="jv-section-title">Who it is for</h2>
          <ul className="cvl-who">
            <li><Link to="/for-students">Students and graduates</Link> comparing coursework, projects and internships with a first job ad.</li>
            <li><Link to="/for-mba">MBA candidates</Link> connecting earlier work to a new role.</li>
            <li><Link to="/for-career-switchers">Career switchers</Link> checking how existing experience reads against a different job.</li>
          </ul>
        </section>

        <section className="jv-section product-section" aria-labelledby="cvl-faq-title">
          <h2 id="cvl-faq-title" className="jv-section-title">Questions about the free CV check</h2>
          <div className="jv-faq jv-faq--wide product-faqs">{cvCheckFaqs.map(([question, answer]) => <details key={question}><summary><span>{question}</span><span className="jv-faq-toggle" aria-hidden="true"><Plus /></span></summary><p>{answer}</p></details>)}</div>
        </section>

        <section className="jv-section product-section" aria-labelledby="cvl-read-title">
          <h2 id="cvl-read-title" className="jv-section-title">Keep reading</h2>
          <ul className="cvl-read">{keepReading.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}</ul>
          <div className="jv-page-actions"><Link to="/check" className="jv-btn jv-btn--primary jv-btn--lg">Start the free CV check<ArrowRight aria-hidden="true" /></Link></div>
        </section>
      </div>
    </div>
  </main>;
}

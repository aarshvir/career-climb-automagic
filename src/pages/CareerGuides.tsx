import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Search } from "lucide-react";
import { careerGuides, editorialPolicy, getCareerGuide, type CareerGuide, type GuideAudience, type GuideCategory } from "@/lib/career-guides";
import "./CareerGuides.css";

const SITE = "https://jobvance.io";
const audiences: GuideAudience[] = ["Students", "MBA candidates", "Working professionals", "All applicants"];
const categories: GuideCategory[] = ["CV evidence", "Career direction", "Application workflow", "UAE job search", "Privacy & troubleshooting"];
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

function GuideCard({ guide }: { guide: CareerGuide }) {
  return <article className="cg-card">
    <div className="cg-card-meta"><span>{guide.category}</span><span>{guide.readingMinutes} min read</span></div>
    <h3><Link to={`/guides/${guide.slug}`}>{guide.title}<ArrowRight size={18} aria-hidden="true" /></Link></h3>
    <p>{guide.description}</p>
    <span className="cg-card-audience">For {guide.audience.toLowerCase()}</span>
  </article>;
}

function GuideActions() {
  return <aside className="cg-actions" aria-labelledby="cg-actions-title">
    <div><p className="cg-eyebrow">PUT IT INTO PRACTICE</p><h2 id="cg-actions-title">Start with one real vacancy.</h2><p>Bring your CV and one job description. Review the evidence, approve your wording and download your CV. The free check does not require an account.</p></div>
    <div className="cg-action-links"><Link className="cg-primary" to="/check">Check my CV for free <ArrowRight size={18} aria-hidden="true" /></Link><Link className="cg-secondary" to="/loop">Explore saving and reuse</Link><Link className="cg-help-link" to="/contact">Get help with the workflow</Link><p>Private saving and the cloud Job Loop require sign-in. You send messages and submit applications yourself.</p></div>
  </aside>;
}

function EditorialNote() {
  return <details className="cg-editorial"><summary>About these guides and their sources</summary><div><p><strong>{editorialPolicy.publisher}</strong> · Source checks dated <time dateTime={editorialPolicy.researchedAt}>{dateLabel(editorialPolicy.researchedAt)}</time></p><p>{editorialPolicy.disclosure}</p><p>{editorialPolicy.approach}</p><p>Official requirements and product capabilities can change. Check the linked source and the employer's current instructions before acting. You can <Link to="/contact">report an unclear passage or source</Link>.</p></div></details>;
}

export default function CareerGuides() {
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState("all");
  const [category, setCategory] = useState("all");
  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return careerGuides.filter(guide => {
      const haystack = [guide.title, guide.description, guide.summary, guide.audience, guide.category, ...guide.takeaways].join(" ").toLowerCase();
      return words.every(word => haystack.includes(word)) && (audience === "all" || guide.audience === audience || guide.audience === "All applicants") && (category === "all" || guide.category === category);
    });
  }, [query, audience, category]);
  const hasFilters = query.trim() || audience !== "all" || category !== "all";
  function reset() { setQuery(""); setAudience("all"); setCategory("all"); }
  return <main className="career-guides">
    <Helmet><title>Practical CV and application guides | Jobvance</title><meta name="description" content="Original guides for students, MBA candidates and busy professionals. Review CV evidence, prepare applications, verify UAE job sources and troubleshoot." /><link rel="canonical" href={`${SITE}/guides`} /><meta property="og:title" content="Practical CV and application guides | Jobvance" /><meta property="og:description" content="Useful next steps for your CV, career direction and application workflow. Public guides with fictional examples and source links." /><meta property="og:url" content={`${SITE}/guides`} /><meta property="og:type" content="website" /></Helmet>
    <header className="cg-hero"><p className="cg-eyebrow"><BookOpen size={16} aria-hidden="true" /> JOBVANCE GUIDES</p><h1>A clearer next step<br /><span>for your application.</span></h1><p>Practical reading for students, MBA candidates and professionals fitting a move around work. Choose the task in front of you and leave with something you can use.</p><div className="cg-hero-links"><Link to="/guides/first-application-pack">Preparing your first pack <ArrowRight size={16} aria-hidden="true" /></Link><Link to="/guides/cv-job-description-evidence">Checking your CV evidence <ArrowRight size={16} aria-hidden="true" /></Link></div><p className="cg-public-note">20 original guides · Public to read · Examples labelled fictional</p></header>
    <section className="cg-library" aria-labelledby="cg-library-title">
      <div className="cg-library-heading"><div><p className="cg-eyebrow">FIND YOUR TASK</p><h2 id="cg-library-title">The guide library</h2></div><p>Common guides appear alongside your audience's guides.</p></div>
      <div className="cg-filters"><div className="cg-field cg-search"><label htmlFor="cg-search">Search the guides</label><div><Search size={17} aria-hidden="true" /><input id="cg-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try projects, PDF or follow-up" /></div></div><div className="cg-field"><label htmlFor="cg-audience">Your stage</label><select id="cg-audience" value={audience} onChange={event => setAudience(event.target.value)}><option value="all">All stages</option>{audiences.map(item => <option key={item} value={item}>{item}</option>)}</select></div><div className="cg-field"><label htmlFor="cg-category">Your task</label><select id="cg-category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All tasks</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></div></div>
      <div className="cg-results-bar"><p role="status" aria-live="polite">{filtered.length} {filtered.length === 1 ? "guide" : "guides"}{hasFilters ? " match your choices" : " to explore"}</p>{hasFilters && <button type="button" onClick={reset}>Clear search and filters</button>}</div>
      {filtered.length ? <div className="cg-grid">{filtered.map(guide => <GuideCard key={guide.slug} guide={guide} />)}</div> : <div className="cg-empty"><h3>No guide matches these choices yet.</h3><p>Try a shorter phrase such as “CV”, “projects” or “privacy”, or clear the filters to browse all 20 guides.</p><button className="cg-primary" type="button" onClick={reset}>Show all guides</button><p>You can start with <Link to="/guides/first-application-pack">preparing a first application pack</Link> or <Link to="/contact">ask for workflow help</Link>.</p></div>}
    </section>
    <EditorialNote /><GuideActions />
  </main>;
}

export function CareerGuideArticle() {
  const { slug } = useParams<{ slug: string }>();
  const guide = getCareerGuide(slug);
  if (!guide) return <main className="career-guides cg-missing"><Helmet><title>Guide not found | Jobvance</title><meta name="robots" content="noindex,follow" /></Helmet><p className="cg-eyebrow">GUIDE NOT FOUND</p><h1>We could not find that guide.</h1><p>Browse the library for CV evidence, application preparation and UAE source checks.</p><Link className="cg-primary" to="/guides">Browse the guide library <ArrowRight size={18} aria-hidden="true" /></Link><Link className="cg-help-link" to="/contact">Get help</Link></main>;
  const canonical = `${SITE}/guides/${guide.slug}`;
  const related = guide.relatedSlugs.map(getCareerGuide).filter((item): item is CareerGuide => Boolean(item));
  const articleSchema = {
    "@context": "https://schema.org", "@type": "BlogPosting", headline: guide.title, description: guide.description,
    datePublished: guide.publishedAt, dateModified: guide.updatedAt, mainEntityOfPage: canonical,
    author: { "@type": "Organization", name: editorialPolicy.publisher },
    publisher: { "@type": "Organization", name: "Jobvance", url: SITE },
  };
  return <main className="career-guides cg-article-page">
    <Helmet><title>{guide.title} | Jobvance</title><meta name="description" content={guide.description} /><link rel="canonical" href={canonical} /><meta property="og:title" content={guide.title} /><meta property="og:description" content={guide.description} /><meta property="og:url" content={canonical} /><meta property="og:type" content="article" /><meta property="article:published_time" content={guide.publishedAt} /><meta property="article:modified_time" content={guide.updatedAt} /><script type="application/ld+json">{JSON.stringify(articleSchema)}</script></Helmet>
    <nav className="cg-breadcrumb" aria-label="Breadcrumb"><Link to="/guides"><ArrowLeft size={16} aria-hidden="true" /> All guides</Link><span aria-hidden="true">/</span><span>{guide.category}</span></nav>
    <article>
      <header className="cg-article-header"><p className="cg-eyebrow">{guide.category} · {guide.audience}</p><h1>{guide.title}</h1><p className="cg-summary">{guide.summary}</p><p className="cg-byline">By <span>{editorialPolicy.publisher}</span> · {guide.readingMinutes} min read<br /><span>Published <time dateTime={guide.publishedAt}>{dateLabel(guide.publishedAt)}</time> · Updated <time dateTime={guide.updatedAt}>{dateLabel(guide.updatedAt)}</time></span></p></header>
      <div className="cg-reading-layout"><aside className="cg-contents"><nav aria-label="On this page"><h2>On this page</h2><ol>{guide.sections.map((section, index) => <li key={section.heading}><a href={`#guide-section-${index + 1}`}>{section.heading}</a></li>)}<li><a href="#guide-sources">Sources and further reading</a></li></ol></nav></aside><div className="cg-prose"><section className="cg-takeaways" aria-labelledby="cg-takeaways-title"><h2 id="cg-takeaways-title">What to take with you</h2><ul>{guide.takeaways.map(takeaway => <li key={takeaway}>{takeaway}</li>)}</ul></section>
        {guide.sections.map((section, index) => <section id={`guide-section-${index + 1}`} className="cg-section" key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}{section.sourceIds?.map(id => { const source = guide.sources.find(item => item.id === id); return source ? <p className="cg-source-note" key={id}>Source for the published guidance: <a href={source.url}>{source.title}</a>.</p> : null; })}{section.bullets && <ul>{section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>}{section.example && <figure className="cg-example"><figcaption>{section.example.label}</figcaption><p>{section.example.text}</p></figure>}</section>)}
        <section id="guide-sources" className="cg-sources"><h2>Sources and further reading</h2><p>The links support the specific guidance cited above. Our checklists and fictional examples are original editorial suggestions. Read current official requirements before acting.</p><ul>{guide.sources.map(source => <li key={source.id}><a href={source.url}>{source.title}</a></li>)}</ul></section>
      </div></div>
    </article>
    <EditorialNote />
    <section className="cg-related" aria-labelledby="cg-related-title"><p className="cg-eyebrow">KEEP GOING</p><h2 id="cg-related-title">Related guides</h2><div className="cg-grid">{related.map(item => <GuideCard key={item.slug} guide={item} />)}</div></section>
    <GuideActions />
  </main>;
}

import './LoopJourney.css';

const stages = [
  { title: 'Add your experience', caption: 'Add', example: 'CV · PDF, DOCX or TXT', text: 'Upload a CV, reuse a saved check, or build your first CV from guided questions. Review the experience you want to use.', short: 'Upload a CV, reuse a saved check, or build your first CV from guided questions.' },
  { title: 'Choose your search', caption: 'Choose', example: 'Product Analyst · Remote (US)', text: 'Tell the Automated Job Loop the roles and locations you want. Choose an available frequency and turn on recurring preparation when you are ready.', short: 'Tell the Automated Job Loop the roles and locations you want, then choose how often it runs.' },
  { title: 'Review your dashboard', caption: 'Review', example: '3 jobs · 3 tailored CVs (example)', text: 'Come back to matched jobs and a tailored CV for each prepared role. Download PDF, DOCX or TXT and open each vacancy from your dashboard.', short: 'Come back to matched jobs and a tailored CV for each. Download PDF, DOCX or TXT.' },
];

/** The three-step journey. `ring` is the editorial version used beside the orbit on dark bands; the default is the same
 * numbered hairline list on light surfaces (no icon-in-circle cards). Headings are h3: place an h2 before the list. */
export default function LoopJourney({ variant = 'cards' }: { variant?: 'cards' | 'ring' }) {
  if (variant === 'ring') return <ol className="loop-journey-ring" aria-label="Your Automated Job Loop journey">{stages.map((stage, index) => <li key={stage.title} data-reveal style={{ ['--i' as string]: index + 1 }}>
    <p className="jv-caption">{String(index + 1).padStart(2, '0')} / {stage.caption}</p>
    <h3>{stage.title}</h3>
    <p>{stage.short}</p>
  </li>)}</ol>;
  return <ol className="loop-journey jv-steps" aria-label="Your Automated Job Loop journey">{stages.map((stage, index) => <li key={stage.title} data-reveal style={{ ['--i' as string]: index + 1 }}>
    <p className="jv-caption"><span className="jv-sr-only">Step </span>{String(index + 1).padStart(2, '0')} / {stage.caption}</p>
    <h3>{stage.title}</h3>
    <p>{stage.text}</p>
    <span className="jv-steps-example" aria-hidden="true">{stage.example}</span>
  </li>)}</ol>;
}

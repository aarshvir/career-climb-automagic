import { FileText, MapPin, LayoutDashboard } from 'lucide-react';
import './LoopJourney.css';

const stages = [
  { title: 'Add your experience', caption: 'Add', icon: FileText, text: 'Upload a CV, reuse a saved check, or build your first CV from guided questions. Review the experience you want to use.', short: 'Upload a CV, reuse a saved check, or build your first CV from guided questions.' },
  { title: 'Choose your search', caption: 'Choose', icon: MapPin, text: 'Tell the Automated Job Loop the roles and locations you want. Choose an available frequency and turn on recurring preparation when you are ready.', short: 'Tell the Automated Job Loop the roles and locations you want, then choose how often it runs.' },
  { title: 'Review your dashboard', caption: 'Review', icon: LayoutDashboard, text: 'Come back to matched jobs and a separate CV for each prepared role. Check the wording, approve your documents, then download and apply.', short: 'Come back to matched jobs and a CV for each. Check the wording, approve your documents, then apply.' },
];

/** The three-step journey. `ring` is the editorial version used beside the orbit on dark bands. */
export default function LoopJourney({ variant = 'cards' }: { variant?: 'cards' | 'ring' }) {
  if (variant === 'ring') return <ol className="loop-journey-ring" aria-label="Your Automated Job Loop journey">{stages.map((stage, index) => <li key={stage.title} data-reveal style={{ ['--i' as string]: index + 1 }}>
    <p className="jv-caption">{String(index + 1).padStart(2, '0')} / {stage.caption}</p>
    <h3>{stage.title}</h3>
    <p>{stage.short}</p>
  </li>)}</ol>;
  return <ol className="loop-journey" aria-label="Your Automated Job Loop journey">{stages.map((stage, index) => {
    const Icon = stage.icon;
    return <li key={stage.title}><div className="loop-journey-top"><span aria-label={`Step ${index + 1}`}>{index + 1}</span><Icon size={25} aria-hidden="true" /></div><h3>{stage.title}</h3><p>{stage.text}</p></li>;
  })}</ol>;
}

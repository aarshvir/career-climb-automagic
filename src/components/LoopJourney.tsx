import { FileText, MapPin, LayoutDashboard } from 'lucide-react';
import './LoopJourney.css';

const stages = [
  { title: 'Add your experience', icon: FileText, text: 'Upload a CV, reuse a saved check, or build your first CV from guided questions. Review the experience you want to use.' },
  { title: 'Choose your search', icon: MapPin, text: 'Tell Job Loop the roles and locations you want. Choose an available frequency and turn on recurring preparation when you are ready.' },
  { title: 'Review your dashboard', icon: LayoutDashboard, text: 'Come back to matched jobs and a separate CV for each prepared role. Check the wording, approve your documents, then download and apply.' },
];

export default function LoopJourney() {
  return <ol className="loop-journey" aria-label="Your Job Loop journey">{stages.map((stage, index) => {
    const Icon = stage.icon;
    return <li key={stage.title}><div className="loop-journey-top"><span aria-label={`Step ${index + 1}`}>{index + 1}</span><Icon size={25} aria-hidden="true" /></div><h3>{stage.title}</h3><p>{stage.text}</p></li>;
  })}</ol>;
}

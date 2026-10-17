import { useId, useRef, useState } from 'react';
import { buildLoopCvText, type LoopCvAnswers } from '@/lib/loop-cv-builder';

const prompts: { key: keyof LoopCvAnswers; label: string; help: string; max: number }[] = [
  { key: 'name', label: 'What name should appear on your CV?', help: 'Use the name you want employers to see.', max: 200 },
  { key: 'contact', label: 'How can an employer contact you? (optional)', help: 'Include only the contact details you want on your CV.', max: 600 },
  { key: 'summary', label: 'How would you introduce your experience? (optional)', help: 'A few factual sentences in your own words. You can leave this blank.', max: 4000 },
  { key: 'experience', label: 'What work, projects or volunteering have you done?', help: 'For each role or project: organisation, role, dates, your contribution and any result you can support. Coursework and unpaid work count. Keep estimated results labelled as estimates.', max: 30000 },
  { key: 'education', label: 'What have you studied or trained in?', help: 'Qualification, institution and dates. State clearly if a course is still in progress.', max: 15000 },
  { key: 'skills', label: 'Which skills and languages can you use? (optional)', help: 'Include only skills you could discuss or demonstrate.', max: 10000 },
];

/** Local guided answers become a reviewable draft, never a save or approval. */
export default function LoopCvBuilder({ answers, onChange, source, onUse, disabled }: {
  answers: LoopCvAnswers; onChange: (answers: LoopCvAnswers) => void;
  source: string; onUse: (text: string) => boolean; disabled: boolean;
}) {
  const id = useId();
  const revision = useRef(0);
  const [preview, setPreview] = useState<{ text: string; revision: number; source: string; answersKey: string } | null>(null);
  const [replace, setReplace] = useState(false), [message, setMessage] = useState('');
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);
  const current = !!preview && preview.revision === revision.current && preview.source === source && preview.answersKey === JSON.stringify(answers);
  function change(key: keyof LoopCvAnswers, value: string) {
    revision.current++; setPreview(null); setReplace(false); setMessage('');
    onChange({ ...answers, [key]: value });
  }
  function prepare() {
    if (disabled) return;
    try { setPreview({ text: buildLoopCvText(answers), revision: revision.current, source, answersKey: JSON.stringify(answers) }); setReplace(false); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Check your answers before creating a draft.'); }
  }
  return <details className="jl-panel jl-cv-builder"><summary>No CV yet? Build one with guided questions</summary>
    <p>Answer in your own words. We arrange your answers into a CV draft without adding facts. Your answers stay in this tab until you choose to save your reviewed career record.</p>
    <div className="jl-profile-form">{prompts.map(prompt => <div className="jl-field" key={prompt.key}>
      <label htmlFor={`${id}-${prompt.key}`}>{prompt.label}</label>
      {prompt.key === 'name' || prompt.key === 'contact'
        ? <input id={`${id}-${prompt.key}`} value={answers[prompt.key]} maxLength={prompt.max} disabled={disabled} onChange={event => change(prompt.key, event.target.value)} aria-describedby={`${id}-${prompt.key}-help`} />
        : <textarea id={`${id}-${prompt.key}`} value={answers[prompt.key]} maxLength={prompt.max} disabled={disabled} onChange={event => change(prompt.key, event.target.value)} aria-describedby={`${id}-${prompt.key}-help`} />}
      <p id={`${id}-${prompt.key}-help`}>{prompt.help}</p>
    </div>)}</div>
    <button className="jl-button" type="button" disabled={disabled} onClick={prepare}>Preview my CV draft</button>
    {message && <p role="status">{message}</p>}
    {preview && <section aria-label="CV builder preview"><h3>Review your draft</h3><pre>{preview.text}</pre>
      {!current && <p role="alert">Your answers or current CV changed. Preview again before using this draft.</p>}
      {source.trim() && <label className="jl-consent"><input type="checkbox" checked={replace && current} disabled={disabled || !current} onChange={event => setReplace(event.target.checked)} /><span>Replace my current source CV draft with these answers. My saved record changes only when I save it.</span></label>}
      <button className="jl-button jl-button--primary" type="button" disabled={disabled || !current || (!!source.trim() && !replace)} onClick={() => {
        if (disabled || !current || preview.revision !== revision.current || (source.trim() && !replace)) return;
        if (onUse(preview.text)) { setUndo({ before: source, after: preview.text }); setPreview(null); setReplace(false); setMessage('Draft copied below. Continue with this text, check your details, then choose whether to save.'); }
      }}>Use this CV draft</button>
    </section>}
    {undo && source === undo.after && <button className="jl-button" type="button" disabled={disabled} onClick={() => {
      if (!disabled && source === undo.after && onUse(undo.before)) { setUndo(null); setPreview(null); setReplace(false); setMessage('Previous source draft restored. Review it before saving.'); }
    }}>Undo CV builder replacement</button>}
  </details>;
}

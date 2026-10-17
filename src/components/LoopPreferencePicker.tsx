import { useState } from 'react';
import { cleanPreferences } from '@/lib/loop-role-suggestions';

interface Props {
  id: string; label: string; searchLabel: string; values: string[]; query: string;
  choices: string[]; onQuery: (value: string) => void; onChange: (values: string[]) => void;
  description: string;
}

/** Native searchable choices support keyboard/mobile use and unrestricted custom text. */
export default function LoopPreferencePicker({ id, label, searchLabel, values, query, choices, onQuery, onChange, description }: Props) {
  const [issue, setIssue] = useState('');
  const selected = cleanPreferences(values);
  function add() {
    if (!query.trim()) return;
    const next = cleanPreferences([...values, query]);
    if (query.trim().length > 150 || next.length > 10) { setIssue('Choose up to ten entries, each under 150 characters.'); return; }
    onChange(next); onQuery(''); setIssue('');
  }
  return <div className="jl-field oq-picker">
    <label htmlFor={`${id}-search`}>{searchLabel}</label>
    <div className="oq-picker-input"><input id={`${id}-search`} list={`${id}-options`} value={query} maxLength={150} aria-describedby={`${id}-help`} onChange={event => { onQuery(event.target.value); setIssue(''); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} placeholder="Search suggestions or type your own" /><button type="button" className="jl-button" onClick={add} disabled={!query.trim()}>Add</button></div>
    <datalist id={`${id}-options`}>{choices.filter(choice => !selected.some(value => value.toLowerCase() === choice.toLowerCase())).map(choice => <option key={choice} value={choice} />)}</datalist>
    <p id={`${id}-help`}>{description} You can type your own. Next also includes anything left in the search box.</p>
    {issue && <p role="alert">{issue}</p>}
    {selected.length > 0 && <ul className="oq-choice-list" aria-label={`Selected ${label.toLowerCase()}`}>{selected.map(value => <li key={value.toLowerCase()}><span>{value}</span><button type="button" aria-label={`Remove ${value}`} onClick={() => { onChange(values.filter(item => item.trim().toLowerCase() !== value.toLowerCase())); setIssue(''); }}>×</button></li>)}</ul>}
    <details><summary>Edit the selected list</summary><label htmlFor={id}>{label}</label><textarea id={id} rows={3} maxLength={1500} value={values.join('\n')} onChange={event => onChange(event.target.value.split('\n'))} /><p>One entry per line. Up to ten entries.</p></details>
  </div>;
}

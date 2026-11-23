import { useEffect, useRef, useState } from 'react';
import { cleanPreferences } from '@/lib/loop-role-suggestions';

interface Props {
  id: string; label: string; searchLabel: string; values: string[]; query: string;
  choices: string[]; onQuery: (value: string) => void; onChange: (values: string[]) => void;
  description: string;
}

/** At most this many entries can be chosen, and at most this many one-tap suggestions are shown at once. */
const MAX_ENTRIES = 10;
const MAX_QUICK_PICKS = 6;

/** Native searchable choices support keyboard/mobile use and unrestricted custom text.
 * Enter adds the typed entry, except while an input method is still composing it
 * (isComposing, or legacy keyCode 229 on mobile keyboards), so a partial word is never saved.
 * The first few choices that are not selected yet are also shown as one-tap buttons (a datalist is easy to miss on a phone):
 * they come from the same local list as the datalist, add exactly what the button says and never touch the text in the search box. */
export default function LoopPreferencePicker({ id, label, searchLabel, values, query, choices, onQuery, onChange, description }: Props) {
  const [issue, setIssue] = useState('');
  const quickPicks = useRef<HTMLDivElement>(null), selectedList = useRef<HTMLUListElement>(null), searchBox = useRef<HTMLInputElement>(null), refocus = useRef(false);
  const selected = cleanPreferences(values);
  const open = choices.filter(choice => !selected.some(value => value.toLowerCase() === choice.toLowerCase()));
  const suggestions = selected.length >= MAX_ENTRIES ? [] : open.slice(0, MAX_QUICK_PICKS);
  // A tapped button leaves the list, so a keyboard or screen-reader user would lose their place: focus moves on to the next one. When none is left (the tenth entry was just chosen, which
  // removes the whole group) it goes to the list of selected entries, which is always there then: it names what was chosen, and unlike the search box it does not open a phone keyboard.
  useEffect(() => { if (!refocus.current) return; refocus.current = false; (quickPicks.current?.querySelector('button') ?? selectedList.current ?? searchBox.current)?.focus(); });
  function include(entry: string): boolean {
    const next = cleanPreferences([...values, entry]);
    if (entry.trim().length > 150 || next.length > MAX_ENTRIES) { setIssue('Choose up to ten entries, each under 150 characters.'); return false; }
    onChange(next); setIssue(''); return true;
  }
  function add() {
    if (!query.trim()) return;
    if (include(query)) onQuery('');
  }
  return <div className="jl-field oq-picker">
    <label htmlFor={`${id}-search`}>{searchLabel}</label>
    <div className="oq-picker-input"><input id={`${id}-search`} ref={searchBox} list={`${id}-options`} value={query} maxLength={150} aria-describedby={`${id}-help`} onChange={event => { onQuery(event.target.value); setIssue(''); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); add(); } }} placeholder="Search suggestions or type your own" /><button type="button" className="jl-button" onClick={add} disabled={!query.trim()}>Add</button></div>
    <datalist id={`${id}-options`}>{open.map(choice => <option key={choice} value={choice} />)}</datalist>
    {suggestions.length > 0 && <div className="oq-quick-picks" role="group" aria-labelledby={`${id}-quick`} ref={quickPicks}><span id={`${id}-quick`} className="oq-quick-label">Quick picks</span>{suggestions.map(choice => <button key={choice} type="button" className="oq-quick-pick" onClick={() => { refocus.current = true; include(choice); }}>{`Add ${choice}`}</button>)}</div>}
    <p id={`${id}-help`}>{description} You can type your own. Next also includes anything left in the search box.</p>
    {issue && <p role="alert">{issue}</p>}
    {selected.length > 0 && <ul className="oq-choice-list" aria-label={`Selected ${label.toLowerCase()}`} tabIndex={-1} ref={selectedList}>{selected.map(value => <li key={value.toLowerCase()}><span>{value}</span><button type="button" aria-label={`Remove ${value}`} onClick={() => { onChange(values.filter(item => item.trim().toLowerCase() !== value.toLowerCase())); setIssue(''); }}>×</button></li>)}</ul>}
    <details><summary>Edit the selected list</summary><label htmlFor={id}>{label}</label><textarea id={id} rows={3} maxLength={1500} value={values.join('\n')} onChange={event => onChange(event.target.value.split('\n'))} /><p>One entry per line. Up to ten entries.</p></details>
  </div>;
}

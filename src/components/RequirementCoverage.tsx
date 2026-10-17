import type { EvidenceReport, EvidenceStatus } from '@/lib/cv-evidence';

const ROWS: [EvidenceStatus, string][] = [
  ['direct', 'Covered'],
  ['partial', 'Partly covered'],
  ['missing', 'Not shown in your CV'],
  ['review', 'Needs your judgment'],
];
const LABEL = Object.fromEntries(ROWS) as Record<EvidenceStatus, string>;

/** How the CV covers each requirement in the ad: counts, never a percentage or a pass/fail verdict. */
export default function RequirementCoverage({ before, after, changed }: { before: EvidenceReport | null; after: EvidenceReport; changed: boolean }) {
  const open = after.requirements.filter(item => item.status === 'partial' || item.status === 'missing').slice(0, 5);
  const showBefore = changed && before !== null;
  return <section className="check-coverage rounded-xl border p-5" aria-label="How your CV covers this job">
    <h3 className="text-lg font-semibold">How your CV covers this job</h3>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">Each requirement in the ad, checked against the words in your CV{showBefore ? ', before tailoring → now' : ''}. It is a guide to what to strengthen, not a score or a hiring prediction.</p>
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ROWS.map(([status, label]) => <div key={status} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold">{showBefore ? `${before!.summary[status]} → ${after.summary[status]}` : after.summary[status]}</dd></div>)}
    </dl>
    {open.length > 0 && <div className="mt-4"><h4 className="text-sm font-medium">Still to strengthen</h4><ul className="mt-2 space-y-2 text-sm">
      {open.map(item => <li key={item.id} className="rounded-lg bg-muted/40 p-3"><p><span className="font-medium">{LABEL[item.status]}:</span> {item.vacancyQuote}</p>{item.evidence[0] && <p className="mt-1 text-xs text-muted-foreground">Closest line in your CV (line {item.evidence[0].line}): {item.evidence[0].cvQuote}</p>}</li>)}
    </ul><p className="mt-2 text-xs text-muted-foreground">If one of these is true for you, answer the quick questions or add your own example.</p></div>}
  </section>;
}

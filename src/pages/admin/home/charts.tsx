import { useId, useState } from 'react';

/** Hand-drawn SVG charts: no chart library, so the site bundle stays small. */
export interface Point { label: string; value: number }

export function Delta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return <span className="vh-delta vh-delta--none">—</span>;
  if (previous === 0) return <span className="vh-delta vh-delta--none" title="No earlier figure to compare">{current === 0 ? '0%' : 'new'}</span>;
  const change = Math.round((current - previous) / previous * 100);
  return <span className={`vh-delta ${change >= 0 ? 'vh-delta--up' : 'vh-delta--down'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}%</span>;
}

export function Sparkline({ points, tone = 'amber' }: { points: number[]; tone?: 'amber' | 'success' }) {
  if (points.length < 2 || points.every(value => value === 0)) return null;
  const top = Math.max(...points, 1), width = 120, height = 34;
  const xy = points.map((value, index) => [index / (points.length - 1) * width, height - 3 - value / top * (height - 6)]);
  const last = xy[xy.length - 1];
  return <svg className={`vh-spark vh-spark--${tone}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
    <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    <circle cx={last[0]} cy={last[1]} r="2" />
  </svg>;
}

export function LineChart({ points, format = String, tone = 'amber', label }: { points: Point[]; format?: (value: number) => string; tone?: 'amber' | 'success'; label: string }) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length || points.every(point => point.value === 0)) return <p className="vh-empty">Nothing recorded in this range yet.</p>;
  const width = 760, height = 220, pad = 18;
  const top = Math.max(...points.map(point => point.value), 1);
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const xy = points.map((point, index) => [pad + index * step, height - 26 - point.value / top * (height - 52)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${pad},${height - 26} ${line} ${xy[xy.length - 1][0].toFixed(1)},${height - 26}`;
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const active = hover === null ? null : points[hover];
  return <div className={`vh-chart vh-chart--${tone}`}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${points.map(point => `${point.label} ${format(point.value)}`).join(', ')}`} onMouseLeave={() => setHover(null)}>
      <defs><linearGradient id={`fill-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" className="vh-chart-stop" stopOpacity=".28" /><stop offset="100%" className="vh-chart-stop" stopOpacity="0" /></linearGradient></defs>
      <polygon points={area} fill={`url(#fill-${id})`} />
      <polyline points={line} className="vh-chart-line" fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {hover !== null && <line x1={xy[hover][0]} x2={xy[hover][0]} y1={8} y2={height - 26} className="vh-chart-cross" />}
      {hover !== null && <circle cx={xy[hover][0]} cy={xy[hover][1]} r="4" className="vh-chart-dot" />}
      {ticks.map(index => <text key={index} x={xy[index][0]} y={height - 6} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="vh-chart-tick">{points[index].label}</text>)}
      {xy.map(([x], index) => <rect key={index} x={x - step / 2} y={0} width={Math.max(step, 8)} height={height - 26} fill="transparent" onMouseEnter={() => setHover(index)} />)}
    </svg>
    {active && <div className="vh-chart-tip" style={{ left: `${xy[hover!][0] / width * 100}%` }}><span>{active.label}</span><strong>{format(active.value)}</strong></div>}
  </div>;
}

export function Bars({ rows, format = String, empty = 'Nothing recorded yet.' }: { rows: { label: string; value: number; note?: string }[]; format?: (value: number) => string; empty?: string }) {
  const visible = rows.filter(row => row.value > 0);
  if (!visible.length) return <p className="vh-empty">{empty}</p>;
  const top = Math.max(...visible.map(row => row.value)), total = visible.reduce((sum, row) => sum + row.value, 0);
  return <ul className="vh-bars">{visible.map(row => <li key={row.label}>
    <div><span>{row.label}</span><span className="vh-num">{format(row.value)} <small>· {Math.round(row.value / total * 100)}%</small></span></div>
    <div className="vh-bar-track"><div className="vh-bar-fill" style={{ width: `${Math.max(2, row.value / top * 100)}%` }} /></div>
    {row.note && <small className="vh-muted">{row.note}</small>}
  </li>)}</ul>;
}

/** Each step shows its share of the first stage and of the stage before it; the weakest step is marked. */
export function Funnel({ stages }: { stages: { label: string; count: number; hint: string }[] }) {
  const first = stages[0]?.count ?? 0;
  const steps = stages.map((stage, index) => index === 0 || !stages[index - 1].count ? null : stage.count / stages[index - 1].count);
  const measured = steps.filter((step): step is number => step !== null);
  const worst = measured.length > 1 ? steps.indexOf(Math.min(...measured)) : -1;
  if (!first) return <p className="vh-empty">No new accounts in this range yet.</p>;
  return <ol className="vh-funnel">{stages.map((stage, index) => <li key={stage.label} className={index === worst ? 'is-worst' : undefined}>
    <div><strong>{stage.label}</strong><span className="vh-num">{stage.count.toLocaleString()} <small>· {Math.round(stage.count / first * 100)}% of top{steps[index] !== null && ` · ${Math.round(steps[index]! * 100)}% step`}</small>{index === worst && <em> ⚠ biggest drop</em>}</span></div>
    <div className="vh-bar-track"><div className="vh-bar-fill" style={{ width: `${stage.count ? Math.max(2, stage.count / first * 100) : 0}%` }} /></div>
    <small className="vh-muted">{stage.hint}</small>
  </li>)}</ol>;
}

export function CohortGrid({ cohorts }: { cohorts: { week: string; size: number; weeks: (number | null)[] }[] }) {
  if (!cohorts.some(cohort => cohort.size > 0)) return <p className="vh-empty">No weekly sign-up groups yet.</p>;
  const shade = (value: number) => value >= 60 ? 'vh-heat-4' : value >= 30 ? 'vh-heat-3' : value >= 10 ? 'vh-heat-2' : value > 0 ? 'vh-heat-1' : 'vh-heat-0';
  const span = Math.max(...cohorts.map(cohort => cohort.weeks.length), 1);
  return <div className="vh-table-wrap"><table className="vh-table vh-cohorts">
    <thead><tr><th>Week joined</th><th className="vh-r">People</th>{Array.from({ length: span }, (_, week) => <th key={week} className="vh-c">Wk {week}</th>)}</tr></thead>
    <tbody>{cohorts.map(cohort => <tr key={cohort.week}><td>{cohort.week}</td><td className="vh-r vh-num">{cohort.size}</td>{Array.from({ length: span }, (_, week) => {
      const value = cohort.weeks[week];
      return <td key={week} className="vh-c">{value === undefined || value === null || !cohort.size ? '' : <span className={`vh-heat ${shade(value)}`}>{value}%</span>}</td>;
    })}</tr>)}</tbody>
  </table></div>;
}

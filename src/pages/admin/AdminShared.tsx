import type { ReactNode } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import type { AdminMetric, AdminSnapshot } from '@/lib/admin-types';
import { utc } from './admin-format';
export function Panel({ id, title, subtitle, children, aside, className = '' }: { id?: string; title: string; subtitle?: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return <section id={id} className={`admin-panel ${className}`} aria-labelledby={id ? `${id}-title` : undefined}>
    <div className="admin-panel-head"><div><h2 id={id ? `${id}-title` : undefined}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{aside}</div>{children}
  </section>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="admin-empty"><Info size={22} aria-hidden="true" /><strong>{title}</strong><p>{children}</p></div>; }
export function Notice({ children, tone = 'info', alert = false }: { children: ReactNode; tone?: 'info' | 'warning' | 'error'; alert?: boolean }) {
  return <div className={`admin-notice admin-notice--${tone}`} role={alert ? 'alert' : 'status'}><AlertCircle size={17} aria-hidden="true" /><div>{children}</div></div>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warning' | 'bad' }) { return <span className={`admin-badge admin-badge--${tone}`}>{children}</span>; }
export function WindowNote({ snapshot, source, children }: { snapshot: AdminSnapshot; source: string; children?: ReactNode }) {
  return <p className="admin-source">Source: {source}. Window: {utc(snapshot.window.start)} to {utc(snapshot.window.end)}. {children}</p>;
}
export function MetricCard({ metric, snapshot }: { metric: AdminMetric; snapshot: AdminSnapshot }) {
  const measured = metric.availability === 'measured' && metric.count !== null;
  const validRate = measured && metric.denominator !== null && metric.denominator > 0 && metric.percent !== null;
  return <article className="admin-metric">
    <div className="admin-metric-label">{metric.label}</div>
    <strong className="admin-metric-value">{measured ? metric.count.toLocaleString() : metric.availability === 'untracked' ? 'Untracked' : metric.availability === 'disabled' ? 'Disabled' : 'Unavailable'}</strong>
    <div className="admin-metric-basis">{validRate ? `${metric.percent.toFixed(1)}% · ${metric.count} of ${metric.denominator}` : metric.denominator !== null ? `${metric.count ?? 'Unknown'} of ${metric.denominator} · rate unavailable` : 'No complete denominator'}</div>
    {metric.smallSample && measured && <Badge tone="warning">Small sample</Badge>}
    <p>{metric.definition}</p>
    <WindowNote snapshot={snapshot} source={metric.source} />
  </article>;
}
export function Metrics({ metrics, snapshot }: { metrics: AdminMetric[]; snapshot: AdminSnapshot }) {
  return metrics.length ? <div className="admin-metrics">{metrics.map(metric => <MetricCard key={metric.key} metric={metric} snapshot={snapshot} />)}</div> : <Empty title="No measurements returned">No complete evidence is available for this window. Try refreshing or selecting a longer window.</Empty>;
}

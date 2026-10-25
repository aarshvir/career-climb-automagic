import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AdminDashboard } from '@/lib/admin-dashboard';
import { Bars, CohortGrid, Delta, Funnel, LineChart, Sparkline } from './charts';
import { ago, day, minor, statusPill, usd } from './format';

type Data = { data: AdminDashboard };
const format = (value: number, kind: 'count' | 'usd' | 'percent') => kind === 'usd' ? usd(value) : kind === 'percent' ? `${value.toFixed(1)}%` : value.toLocaleString();

export function Kpi({ label, value, help, foot, spark, tone, danger }: { label: string; value: string; help?: string; foot?: ReactNode; spark?: number[]; tone?: 'good' | 'bad'; danger?: boolean }) {
  return <article className={`vh-card${danger ? ' vh-card--danger' : ''}`}>
    <div className="vh-label">{label}</div>
    <div className={`vh-value${tone ? ` vh-value--${tone}` : ''}`}>{value}</div>
    {spark && <div className="vh-kpi-spark"><Sparkline points={spark} /></div>}
    {foot && <div className="vh-foot">{foot}</div>}
    {help && <p className="vh-help">{help}</p>}
  </article>;
}

export function OverviewSection({ data }: Data) {
  const series: Record<string, number[]> = {
    signups: data.daily.map(row => row.signups), cv_checks: data.daily.map(row => row.cvChecks),
    runs: data.daily.map(row => row.runs), revenue: data.daily.map(row => row.revenueUsd), paid_orders: data.daily.map(row => row.paidOrders),
  };
  return <>
    <div className="vh-grid">{data.kpis.map(kpi => <Kpi key={kpi.key} label={kpi.label} value={format(kpi.current, kpi.kind)} spark={series[kpi.key]} help={kpi.help}
      foot={kpi.previous === null ? undefined : <><Delta current={kpi.current} previous={kpi.previous} /> vs previous {data.window.days} days ({format(kpi.previous, kpi.kind)})</>} />)}</div>
    <div className="vh-grid vh-grid--2">
      <section className="vh-card"><h2>Revenue per day</h2><p className="vh-sub">Paid orders, in US dollars.</p><LineChart label="Revenue per day" points={data.daily.map(row => ({ label: day(row.day), value: row.revenueUsd }))} format={usd} /></section>
      <section className="vh-card"><h2>New accounts per day</h2><p className="vh-sub">Real sign-ups only.</p><LineChart label="New accounts per day" tone="success" points={data.daily.map(row => ({ label: day(row.day), value: row.signups }))} /></section>
      <section className="vh-card"><h2>CV tailorings per day</h2><p className="vh-sub">AI-tailored CVs, including visitors without an account.</p><LineChart label="CV tailorings per day" points={data.daily.map(row => ({ label: day(row.day), value: row.cvChecks }))} /></section>
      <section className="vh-card"><h2>Job Loop runs per day</h2><p className="vh-sub">Runs that finished, including partial ones.</p><LineChart label="Job Loop runs per day" tone="success" points={data.daily.map(row => ({ label: day(row.day), value: row.runs }))} /></section>
    </div>
    <p className="vh-help">{data.coverage.realUsers.toLocaleString()} real accounts in total · {usd(data.revenue.allTimeUsd)} revenue all time · <Link className="vh-link" to="/admin/revenue">revenue detail →</Link> · <Link className="vh-link" to="/admin/growth">sign-up funnel →</Link></p>
  </>;
}

export function TodaySection({ data }: Data) {
  return <div className="vh-grid">{data.today.map(item => <Kpi key={item.key} label={item.label} value={format(item.today, item.kind)}
    foot={<><Delta current={item.today} previous={item.yesterday} /> vs {format(item.yesterday, item.kind)} by this time yesterday</>} />)}</div>;
}

export function RevenueSection({ data }: Data) {
  const { revenue } = data;
  const attention = revenue.attention.filter(item => item.count > 0);
  return <>
    {attention.length > 0 && <div className="vh-callout vh-callout--bad" role="alert"><strong>Needs a look:</strong> {attention.map(item => `${item.count} ${item.label.toLowerCase()}`).join(' · ')}. Details are on <Link className="vh-link" to="/admin/operations">Ops</Link>.</div>}
    <div className="vh-grid">
      <Kpi label="Revenue (all time)" value={usd(revenue.allTimeUsd)} help={`${revenue.allTimeOrders} paid order${revenue.allTimeOrders === 1 ? '' : 's'}`} />
      <Kpi label="Paying customers" value={revenue.payingCustomers.toLocaleString()} help="People with at least one paid order" />
      <Kpi label="Active subscriptions" value={revenue.subscriptions.active.toLocaleString()} help={`${revenue.subscriptions.cancelling} cancelling · ${revenue.subscriptions.pastDue} payment overdue · ${revenue.subscriptions.ended} ended`} />
      <Kpi label="Paid Job Loop places" value={`${revenue.places.paidUsed}`} foot={<>of {revenue.places.paidCapacity} paid places taken</>} />
      <Kpi label="Free Job Loop places" value={`${revenue.places.pilotUsed}`} tone={revenue.places.pilotUsed >= revenue.places.pilotCapacity ? 'bad' : undefined} foot={<>of {revenue.places.pilotCapacity} free places taken</>} />
      <Kpi label="Avg order" value={revenue.allTimeOrders ? usd(revenue.allTimeUsd / revenue.allTimeOrders) : '—'} />
    </div>
    <div className="vh-grid vh-grid--2">
      <section className="vh-card"><h2>Revenue by plan</h2><p className="vh-sub">All time, in US dollars.</p><Bars rows={revenue.byPlan.map(row => ({ label: row.label, value: row.usd, note: `${row.orders} order${row.orders === 1 ? '' : 's'}` }))} format={usd} empty="No paid orders yet." /></section>
      <section className="vh-card"><h2>By currency</h2><p className="vh-sub">Exactly what customers paid, before conversion.</p>
        {revenue.byCurrency.length ? <div className="vh-table-wrap"><table className="vh-table"><thead><tr><th>Currency</th><th className="vh-r">Paid</th><th className="vh-r">Orders</th></tr></thead>
          <tbody>{revenue.byCurrency.map(row => <tr key={row.currency}><td>{row.currency}</td><td className="vh-r">{minor(row.amountMinor, row.currency)}</td><td className="vh-r">{row.orders}</td></tr>)}</tbody></table></div> : <p className="vh-empty">No paid orders yet.</p>}
      </section>
    </div>
    <section className="vh-section"><h2 className="vh-label" style={{ margin: '8px 0 10px' }}>Latest payments</h2>
      <div className="vh-table-wrap"><table className="vh-table"><thead><tr><th>When</th><th>Who</th><th>Plan</th><th className="vh-r">Amount</th><th className="vh-r">USD</th><th>Status</th></tr></thead>
        <tbody>{revenue.recent.length ? revenue.recent.map((row, index) => <tr key={index}>
          <td className="vh-nowrap">{ago(row.at)}</td>
          <td>{row.userId ? <Link className="vh-link" to={`/admin/users?focus=${row.userId}`}>{row.emailDisplay}</Link> : row.emailDisplay}</td>
          <td>{row.plan}</td>
          <td className="vh-r">{minor(row.amountMinor, row.currency)}</td>
          <td className="vh-r">{row.usd === null ? '—' : usd(row.usd)}</td>
          <td>{statusPill(/paid|succeeded|active|completed/i.test(row.status) ? 'good' : /refund|fail|dispute|cancel/i.test(row.status) ? 'bad' : 'warn', row.status.replace(/_/g, ' '))}</td>
        </tr>) : <tr><td colSpan={6} className="vh-table-empty">No payments yet.</td></tr>}</tbody></table></div>
    </section>
  </>;
}

export function GrowthSection({ data }: Data) {
  return <>
    <section className="vh-card vh-section"><h2>Sign-up funnel</h2><p className="vh-sub">People who created an account in the last {data.window.days} days, and how far they got. Each step counts only people who also did the step before.</p><Funnel stages={data.funnel} /></section>
    <section className="vh-card vh-section"><h2>Who comes back</h2><p className="vh-sub">Share of each week's new accounts that used Jobvance again in each later week (a CV check, a Job Loop action or a run). Blank cells are weeks that haven't happened yet.</p><CohortGrid cohorts={data.cohorts} /></section>
  </>;
}

type SortKey = 'joinedAt' | 'lastActiveAt' | 'paidUsd' | 'cvChecks' | 'runs';
export function UsersSection({ data }: Data) {
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const [query, setQuery] = useState('');
  const [paidOnly, setPaidOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: 'joinedAt', down: true });
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const value = (row: AdminDashboard['users'][number]) => { const raw = row[sort.key]; return typeof raw === 'number' ? raw : raw ? new Date(raw).getTime() : 0; };
    return data.users.filter(row => (!paidOnly || row.paidUsd > 0 || !!row.plan) && (!needle || row.emailDisplay.toLowerCase().includes(needle) || row.id.startsWith(needle)))
      .sort((a, b) => (value(a) - value(b)) * (sort.down ? -1 : 1));
  }, [data.users, query, paidOnly, sort]);
  const head = (key: SortKey, label: string, right = true) => <th className={right ? 'vh-r' : undefined} aria-sort={sort.key === key ? (sort.down ? 'descending' : 'ascending') : undefined}>
    <button type="button" onClick={() => setSort(current => ({ key, down: current.key === key ? !current.down : true }))}>{label}{sort.key === key ? (sort.down ? ' ▼' : ' ▲') : ''}</button></th>;
  return <>
    <div className="vh-toolbar">
      <input className="vh-search" type="search" placeholder="Search by email" aria-label="Search users by email" value={query} onChange={event => setQuery(event.target.value)} />
      <label><input type="checkbox" checked={paidOnly} onChange={event => setPaidOnly(event.target.checked)} /> Paying customers only</label>
      <span>{rows.length} of {data.users.length} shown{data.users.length < data.coverage.realUsers ? ` (newest ${data.users.length} of ${data.coverage.realUsers})` : ''}</span>
    </div>
    <div className="vh-table-wrap"><table className="vh-table">
      <thead><tr><th>Email</th>{head('joinedAt', 'Joined', false)}{head('lastActiveAt', 'Last active', false)}<th>Plan</th>{head('paidUsd', 'Paid')}{head('cvChecks', 'CV checks')}{head('runs', 'Runs')}<th>Set-up</th></tr></thead>
      <tbody>{rows.length ? rows.map(row => <tr key={row.id} style={row.id === focus ? { background: 'rgba(212,168,83,.1)' } : undefined}>
        <td><span className="vh-strong">{row.emailDisplay}</span><small title={row.id}>{row.id.slice(0, 8)}</small></td>
        <td className="vh-nowrap">{new Date(row.joinedAt).toISOString().slice(0, 10)}</td>
        <td className="vh-nowrap">{ago(row.lastActiveAt ?? row.lastSignInAt)}</td>
        <td>{row.plan ? statusPill('good', row.plan) : row.pilot ? statusPill('warn', 'free place') : <span className="vh-muted">free</span>}</td>
        <td className="vh-r">{row.paidUsd ? usd(row.paidUsd) : '—'}</td>
        <td className="vh-r">{row.cvChecks}</td>
        <td className="vh-r">{row.runs}{row.failedRuns > 0 && <small style={{ color: 'var(--vh-caution)' }}>{row.failedRuns} failed</small>}</td>
        <td>{row.hasProfile ? statusPill('good', 'profile saved') : <span className="vh-muted">not started</span>}</td>
      </tr>) : <tr><td colSpan={8} className="vh-table-empty">No users match.</td></tr>}</tbody>
    </table></div>
  </>;
}

export function OperationsSection({ data }: Data) {
  const { ops } = data;
  const allClear = ops.checks.every(check => !check.danger || check.count === 0);
  const budgetUsed = ops.budget.capUsd ? ops.budget.committedUsd / ops.budget.capUsd * 100 : 0;
  return <>
    {allClear && <p className="vh-ok">✓ All clear: nothing failed, stuck or waiting.</p>}
    <div className="vh-grid">{ops.checks.map(check => <Kpi key={check.key} label={check.label} value={check.count.toLocaleString()} help={check.help}
      tone={check.count === 0 ? 'good' : check.danger ? 'bad' : undefined} danger={check.danger && check.count > 0} />)}
      <Kpi label={`AI budget ${ops.budget.month}`} value={`${Math.round(budgetUsed)}%`} tone={budgetUsed >= 80 ? 'bad' : undefined} danger={budgetUsed >= 90}
        help={`${usd(ops.budget.committedUsd)} of ${usd(ops.budget.capUsd)} committed · ${usd(ops.budget.actualUsd)} actually spent. When it's used up, AI work stops until next month.`} />
      <Kpi label="Job Loop scheduler" value={ops.schedulerEnabled ? 'On' : 'Off'} tone={ops.schedulerEnabled ? 'good' : 'bad'} help={`Last automatic run started ${ago(ops.lastDispatchAt)}`} />
    </div>
    <div className="vh-table-wrap"><table className="vh-table">
      <thead><tr><th>Problem</th><th>When</th><th>User</th><th>Detail</th></tr></thead>
      <tbody>{ops.problems.length ? ops.problems.map((row, index) => <tr key={index}>
        <td>{statusPill('bad', row.kind)}</td><td className="vh-nowrap">{ago(row.at)}</td>
        <td>{row.userId ? <Link className="vh-link" to={`/admin/users?focus=${row.userId}`}>{row.emailDisplay}</Link> : row.emailDisplay}</td>
        <td>{row.detail}</td>
      </tr>) : <tr><td colSpan={4} className="vh-table-empty">No recent problems.</td></tr>}</tbody>
    </table></div>
  </>;
}

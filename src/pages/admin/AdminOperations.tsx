import { useEffect, useRef, useState } from 'react';
import type { AdminAction, AdminResponse, AdminSnapshot, AdminSupport, AdminSupportStatus } from '@/lib/admin-types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge, Empty, Panel, WindowNote } from './AdminShared';
import { readable, shortId, utc } from './admin-format';

type RunAction = (action: AdminAction) => Promise<AdminResponse | void>;
function SupportRow({ receipt, busy, onAction }: { receipt: AdminSupport; busy: boolean; onAction: RunAction }) {
  const [status, setStatus] = useState<AdminSupportStatus>(receipt.status);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageState, setMessageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const messageRequest = useRef(0);
  useEffect(() => () => { messageRequest.current += 1; }, []);
  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) { messageRequest.current += 1; setMessage(null); setMessageState('loading'); }
  }
  async function readMessage() {
    const revision = ++messageRequest.current;
    setMessage(null); setMessageState('loading');
    const result = await onAction({ action: 'support_detail', id: receipt.id });
    if (messageRequest.current !== revision) return;
    if (result && result.supportDetail?.id === receipt.id) { setMessage(result.supportDetail.message); setMessageState('ready'); }
    else setMessageState('error');
  }
  return <tr><td><strong>{receipt.category}</strong><span className="admin-cell-note">{shortId(receipt.id)} · {receipt.emailDisplay}</span>
    <Dialog open={open} onOpenChange={changeOpen}><DialogTrigger asChild><button type="button" className="admin-button admin-button--small admin-message-trigger" disabled={busy || !receipt.messageAvailable} onClick={() => void readMessage()}>View saved message</button></DialogTrigger><DialogContent className="admin-message-dialog"><DialogHeader><DialogTitle>Saved support message</DialogTitle><DialogDescription>This selected receipt may contain private candidate details. It is displayed for manual review only and is never sent to a model from this workspace.</DialogDescription></DialogHeader><p className="admin-message-meta">{receipt.category} · {receipt.emailDisplay} · {utc(receipt.createdAt)}</p>{messageState === 'loading' ? <p role="status">Verifying access to the selected message…</p> : messageState === 'error' ? <p role="alert">This message could not be opened. Close this view and refresh before trying again.</p> : <div className="admin-saved-message">{message || 'The saved receipt has no message text.'}</div>}<p className="admin-message-meta">Source: job_loop_support_requests · receipt {shortId(receipt.id)}. This read is audited; closing the view clears the displayed message.</p><DialogFooter><button type="button" className="admin-button" onClick={() => changeOpen(false)}>Close message</button></DialogFooter></DialogContent></Dialog>
  </td>
    <td>{utc(receipt.createdAt)}<span className="admin-cell-note">{receipt.messageAvailable ? 'Message retained privately' : 'No message available'}</span></td>
    <td><Badge tone={receipt.status === 'resolved' ? 'good' : receipt.status === 'in_review' ? 'warning' : 'neutral'}>{readable(receipt.status)}</Badge></td>
    <td><div className="admin-inline-controls"><select aria-label={`Status for support ${receipt.id}`} value={status} disabled={busy} onChange={event => setStatus(event.target.value as AdminSupportStatus)}>
      <option value="received">Received</option><option value="in_review">In review</option><option value="resolved">Resolved</option>
    </select><button type="button" className="admin-button admin-button--small" disabled={busy || status === receipt.status} onClick={() => void onAction({ action: 'update_support', id: receipt.id, expectedVersion: receipt.version, status })}>Save status</button></div><span className="admin-cell-note">Version {receipt.version} · audit recorded on save</span></td></tr>;
}

export default function AdminOperations({ snapshot, busy, onAction }: { snapshot: AdminSnapshot; busy: boolean; onAction: RunAction }) {
  const { users, support, recentRuns, scheduler, pilot } = snapshot.operations;
  const received = support.filter(row => row.status === 'received').length;
  const inReview = support.filter(row => row.status === 'in_review').length;
  const resolved = support.filter(row => row.status === 'resolved').length;
  return <>
    <div className="admin-overview-strip">
      <div><span>Support requiring review</span><strong>{received + inReview}</strong><p>{received} received · {inReview} in review in the retained queue</p></div>
      <div><span>Scheduler</span><strong className="admin-status-value">{scheduler.enabled ? scheduler.ready ? 'Enabled' : 'Not ready' : 'Paused'}</strong><p>{scheduler.dueSchedules} due · {scheduler.staleLeases} stale leases</p></div>
      <div><span>Pilot occupancy</span><strong>{pilot.activeUsers}<small> / {pilot.capacity}</small></strong><p>Current enrolled accounts · {pilot.qaOccupancy} QA seats included</p></div>
    </div>
    <p className="admin-source">Overview sources: retained support receipts; job_loop_schedules and scheduler dispatch; current job_loop_pilot_users. State at {utc(snapshot.generatedAt)}. Each queue is bounded; a queue count is not an all-time total.</p>
    <div className="admin-two-columns">
      <Panel id="schedules" title="Scheduler health" subtitle="Recurring preparation runs only with the candidate’s existing consent.">
        <dl className="admin-definition-grid"><div><dt>Active schedules</dt><dd>{scheduler.activeSchedules}</dd></div><div><dt>Due now</dt><dd>{scheduler.dueSchedules}</dd></div><div><dt>Stale leases</dt><dd>{scheduler.staleLeases}</dd></div><div><dt>Last dispatch</dt><dd className="admin-date-value">{utc(scheduler.lastDispatchAt)}</dd></div></dl>
        <p className="admin-body-note">{scheduler.message}</p><p className="admin-source">Source: job_loop_schedules / scheduler dispatch. Current state as of {utc(snapshot.generatedAt)}. Active means an enabled, non-cancelled candidate schedule. Includes QA schedules. Readiness checks configuration only; future dispatch is unverified.</p>
      </Panel>
      <Panel id="pilot" title="Pilot capacity" subtitle="Capacity is fixed at ten. QA activity is excluded from customer analytics.">
        <div className="admin-capacity"><strong>{pilot.activeUsers}<span> / {pilot.capacity} seats</span></strong><Badge tone={pilot.activeUsers >= pilot.capacity ? 'warning' : 'good'}>{pilot.activeUsers >= pilot.capacity ? 'At capacity' : `${Math.max(0, pilot.capacity - pilot.activeUsers)} available`}</Badge></div>
        <meter className="admin-meter" min={0} max={pilot.capacity} value={pilot.activeUsers} aria-label={`${pilot.activeUsers} of ${pilot.capacity} pilot seats occupied`} />
        <p className="admin-body-note">{pilot.qaOccupancy} QA accounts occupy seats. Enrolment is managed through the existing candidate journey.</p><p className="admin-source">Source: job_loop_pilot_users. Current occupancy at {utc(snapshot.generatedAt)}; denominator {pilot.capacity} seats.</p>
      </Panel>
    </div>
    <Panel id="support" title="Support receipts" subtitle="Open a selected private message for manual review, then record a status decision. Message reads and status saves are audited." aside={<Badge>{received} received · {inReview} in review · {resolved} resolved</Badge>}>
      {support.length ? <div className="admin-table-scroll"><table><caption className="sr-only">Support receipt queue</caption><thead><tr><th scope="col">Receipt</th><th scope="col">Received</th><th scope="col">Current status</th><th scope="col">Manual review</th></tr></thead><tbody>{support.map(receipt => <SupportRow key={`${receipt.id}-${receipt.version}`} receipt={receipt} busy={busy} onAction={onAction} />)}</tbody></table></div> : <Empty title="No support receipts recorded">New candidate requests will appear here with their receipt status.</Empty>}
      <p className="admin-source">Source: job_loop_support_requests. All retained receipts as of {utc(snapshot.generatedAt)}. {support.length} returned receipts; maximum 100. This bounded list is not a complete support history.</p>
    </Panel>
    <Panel id="runs" title="Recent preparation runs" subtitle="Runs started in the selected window. A completed run does not confirm an application or a browser download.">
      {recentRuns.length ? <div className="admin-table-scroll"><table><caption className="sr-only">Recent run status and errors</caption><thead><tr><th scope="col">Run / account</th><th scope="col">State</th><th scope="col">Processing route</th><th scope="col">Started / finished</th></tr></thead><tbody>{recentRuns.map(run => <tr key={run.id}><td><strong>{shortId(run.id)}</strong><span className="admin-cell-note">Account {shortId(run.userId)}</span></td><td><Badge tone={run.status === 'failed' || run.status === 'blocked' ? 'bad' : run.status === 'completed' ? 'good' : 'neutral'}>{readable(run.status)}</Badge><span className="admin-cell-note">Phase {run.phase}</span></td><td>{run.provider}<span className="admin-cell-note">{run.model || 'Model not recorded'}</span></td><td>{utc(run.createdAt)}<span className="admin-cell-note">{utc(run.finishedAt)}</span></td></tr>)}</tbody></table></div> : <Empty title="No preparation runs in this window">Run health becomes available after candidates start preparation. No success or failure rate can be inferred from an empty queue.</Empty>}
      <WindowNote snapshot={snapshot} source="job_loop_runs" >{recentRuns.length} recent rows returned; candidate source text and run snapshots are omitted.</WindowNote>
    </Panel>
    <Panel id="users" title="Candidate records" subtitle="Masked contacts; lifetime retained run counts and current career state. CVs and source documents are omitted." aside={<Badge>{snapshot.coverage.usersListed} of {snapshot.coverage.usersTotal} listed</Badge>}>
      {users.length ? <div className="admin-table-scroll"><table><caption className="sr-only">Minimal candidate records</caption><thead><tr><th scope="col">Account</th><th scope="col">Joined</th><th scope="col">Career record</th><th scope="col">Runs</th><th scope="col">Pilot</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><strong>{user.emailDisplay}</strong><span className="admin-cell-note">{shortId(user.id)}</span></td><td>{utc(user.joinedAt)}</td><td>{user.hasProfile ? 'Profile saved' : 'No profile'}<span className="admin-cell-note">{user.shareableClaims} shareable / {user.claims} claims</span></td><td>{user.completedRuns} completed<span className="admin-cell-note">{user.failedRuns} failed</span></td><td><Badge tone={user.pilotActive ? 'good' : 'neutral'}>{user.pilotActive ? 'Enrolled' : 'Not enrolled'}</Badge></td></tr>)}</tbody></table></div> : <Empty title="No candidate records returned">Customer records appear after account creation. Synthetic QA accounts are excluded.</Empty>}
      <p className="admin-source">Source: Auth accounts + job_loop_records + job_loop_runs + job_loop_pilot_users. Current career state and lifetime retained run counts at {utc(snapshot.generatedAt)}; maximum {snapshot.coverage.listLimit} users listed. {snapshot.coverage.excludedQaUsers} QA accounts excluded.</p>
    </Panel>
    <Panel id="audit" title="Administrative audit" subtitle="Append-only records of verified reads, connection checks and manual administration changes.">
      {snapshot.audit.length ? <ol className="admin-audit-list">{snapshot.audit.map(entry => <li key={entry.id}><span className="admin-audit-dot" aria-hidden="true" /><div><strong>{readable(entry.action)}</strong><p>Actor {shortId(entry.actorId)}{entry.targetId ? ` · Record ${shortId(entry.targetId)}` : ''}</p><time dateTime={entry.at}>{utc(entry.at)}</time></div></li>)}</ol> : <Empty title="No administrative changes recorded">Explicit configuration saves and support status decisions will add an audit record.</Empty>}
      <p className="admin-source">Source: jobvance_admin_audit. Latest {snapshot.audit.length} events as of {utc(snapshot.generatedAt)}, maximum 30; not filtered by the selected measurement window. Read-only view.</p>
    </Panel>
  </>;
}

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { getLoopPreview } from '@/lib/job-loop-api';
import type { LoopPacket } from '../../supabase/functions/_shared/job-loop-types';

/** Preview uses the same saved PDF artifact as download, bound to the current source hash. */
export default function LoopPacketPreview({ ownerId, packet, current, busy }: { ownerId: string; packet: LoopPacket; current: boolean; busy: boolean }) {
  const headingId = useId();
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const alive = useRef(true), objectUrl = useRef(''), serial = useRef(0), currentRef = useRef(current), transfer = useRef<AbortController | null>(null);
  currentRef.current = current;
  const cleanup = useCallback(() => { alive.current = false; serial.current++; transfer.current?.abort(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  useEffect(() => { alive.current = true; return cleanup; }, [cleanup]);
  useEffect(() => { serial.current++; transfer.current?.abort(); setLoading(false); setError(''); if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = ''; setUrl(''); } }, [current, ownerId, packet.id, packet.inputHash]);
  async function preview() {
    if (!current || loading || busy) return; const ticket = ++serial.current; transfer.current?.abort(); const controller=new AbortController(); transfer.current=controller; setLoading(true); setError('');
    try { const result = await getLoopPreview(ownerId, packet.id, packet.inputHash, controller.signal); if (!alive.current || ticket !== serial.current || !currentRef.current || controller.signal.aborted) return; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = URL.createObjectURL(new Blob([result.blob], { type: 'application/pdf' })); setUrl(objectUrl.current); }
    catch (failure) { if (!controller.signal.aborted && alive.current && ticket === serial.current && currentRef.current) setError(failure instanceof Error ? failure.message : 'The exact PDF preview could not be loaded.'); }
    finally { if (alive.current && ticket === serial.current) setLoading(false); }
  }
  const hasPdf = !!packet.artifacts.pdf;
  return <section className="jl-pdf-preview" aria-labelledby={headingId}><div className="jl-row-heading"><div><h3 id={headingId}>Exact document preview</h3><p>View the saved PDF before approving. This is the same artifact used for a PDF download.</p></div><button className="jl-button" type="button" disabled={busy || loading || !current || !hasPdf || packet.holdReasons.length > 0} onClick={() => void preview()}>{loading ? <Loader2 size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}{url ? 'Reload exact PDF preview' : 'Open exact PDF preview'}</button></div>{!hasPdf && <p className="jl-help">No PDF artifact was produced. Review the literal text and ready-format warnings below; a supported Word or text format can still be available.</p>}{error && <p className="jl-warning" role="alert">{error}</p>}{url && current && <><p className="jl-help">If the embedded viewer is blank or difficult to read, <a className="jl-text-link" href={url} target="_blank" rel="noopener noreferrer">open this exact PDF in a new tab</a> before approving. It uses the same verified preview bytes.</p><iframe src={url} title="Exact saved CV PDF preview" className="jl-pdf-frame" /></>}<p className="jl-help">Factual corrections belong in your career record, followed by a rebuild. Old previews are cleared when their source version changes.</p></section>;
}

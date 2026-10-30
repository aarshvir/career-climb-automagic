import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { staticPageMeta } from '@/lib/public-site-meta';
import { ArrowLeft, ArrowRight, Captions, Check, FileText, RotateCcw } from 'lucide-react';
import { publicWalkthroughVideoManifest, validateWalkthroughVideoManifest, walkthroughs, walkthroughTranscript, type WalkthroughVideoAsset } from '@/lib/walkthroughs';
import { BrandLockup } from '@/components/layout/MvpHeader';
import { WalkthroughAside } from '@/components/marketing/HeroAsides';
import { useReveal } from '@/hooks/useReveal';
import './Walkthroughs.css';

function timeLabel(seconds: number) { const wholeSeconds=Math.floor(seconds); return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`; }

function RecordedWalkthrough({ asset }: { asset: WalkthroughVideoAsset }) {
  const [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false), [presenterFailed, setPresenterFailed] = useState(false), [captionFailed, setCaptionFailed] = useState(false);
  const presenter = useRef<HTMLVideoElement | null>(null), mainVideo=useRef<HTMLVideoElement|null>(null), pendingSeek=useRef<number|null>(null);
  const captionTrack = useRef<HTMLTrackElement | null>(null);
  useEffect(() => {
    const track = captionTrack.current;
    if (!track) return;
    const handleError = () => setCaptionFailed(true);
    track.addEventListener('error', handleError);
    return () => track.removeEventListener('error', handleError);
  }, [loaded, failed]);
  function seek(seconds:number){pendingSeek.current=seconds;if(mainVideo.current && mainVideo.current.readyState>=1){mainVideo.current.currentTime=seconds;pendingSeek.current=null;}} 
  function syncPresenter(video: HTMLVideoElement) {
    if (!presenter.current) return;
    if (Math.abs(presenter.current.currentTime - video.currentTime) > .5) presenter.current.currentTime = video.currentTime;
  }
  return <section id="wt-recorded" className="wt-recorded" aria-labelledby="wt-recorded-title"><h2 id="wt-recorded-title">Video walkthrough</h2><p>Follow the product screens through an example application. {asset.hasBurnedCaptions ? 'English captions appear in the recording.' : 'An English caption track is available.'} Use the player’s full-screen control for a larger view. Read the video transcript or follow the separate interactive steps below.</p>
    {loaded && !failed ? <div className="wt-video-layout"><video ref={mainVideo} poster={asset.posterUrl} onLoadedMetadata={event=>{if(pendingSeek.current!==null){event.currentTarget.currentTime=pendingSeek.current;pendingSeek.current=null;}}} className="wt-main-video" aria-label="Recorded Jobvance walkthrough" crossOrigin="anonymous" controls playsInline preload="metadata" onError={() => setFailed(true)} onPlay={event => { syncPresenter(event.currentTarget); void presenter.current?.play().catch(() => setPresenterFailed(true)); }} onPause={() => presenter.current?.pause()} onSeeked={event => syncPresenter(event.currentTarget)} onTimeUpdate={event => syncPresenter(event.currentTarget)}>
      <source src={asset.videoUrl} type={asset.videoUrl.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4'} onError={() => setFailed(true)} /><track ref={captionTrack} kind="captions" src={asset.captionUrl} srcLang="en" label="English captions" default={!asset.hasBurnedCaptions} />Your browser cannot play this recording. Use the interactive steps and transcript below.
    </video>{asset.presenterVideoUrl && !presenterFailed && <video ref={presenter} className="wt-presenter-video" src={asset.presenterVideoUrl} muted playsInline preload="none" aria-hidden="true" tabIndex={-1} onError={() => setPresenterFailed(true)} />}</div> : !failed && <button className="wt-button" type="button" onClick={() => setLoaded(true)}>Load recorded walkthrough <ArrowRight size={16} aria-hidden="true" /></button>}
    {loaded&&!failed&&asset.chapters?.length && <nav className="wt-video-chapters" aria-label="Video chapters">{asset.chapters.map(chapter=><button type="button" key={chapter.id} onClick={()=>seek(chapter.startSeconds)}>{timeLabel(chapter.startSeconds)} · {chapter.title}</button>)}</nav>}
    {failed && <p role="alert">The recording could not be loaded. Continue with the interactive steps and complete video transcript below.</p>}{captionFailed && !failed && <p role="alert">{asset.hasBurnedCaptions ? 'The optional English caption track could not be loaded. On-screen captions remain in the recording.' : 'The English caption track could not be loaded.'} Read the complete video transcript below.</p>}{asset.presenterDisclosure && <details className="wt-presenter-disclosure"><summary>About this video</summary><p>{asset.presenterDisclosure}</p></details>}
  </section>;
}

export interface WalkthroughsProps { videoManifest?: unknown }
export default function Walkthroughs({ videoManifest = publicWalkthroughVideoManifest }: WalkthroughsProps) {
  useReveal();
  const meta=staticPageMeta('/walkthroughs')!;
  const player=useRef<HTMLElement|null>(null);
  const selectedTask=useRef<HTMLElement|null>(null);
  const transcript=useRef<HTMLDetailsElement|null>(null);
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get('tutorial');
  const [tutorialId, setTutorialId] = useState(() => walkthroughs.find(tutorial => tutorial.id === requested)?.id ?? walkthroughs[0].id);
  const [stepIndex, setStepIndex] = useState(0), [captions, setCaptions] = useState(true), [allTasks,setAllTasks]=useState(false);
  const tutorial = walkthroughs.find(item => item.id === tutorialId) ?? walkthroughs[0];
  const scene = tutorial.scenes[stepIndex];
  const videos = useMemo(() => validateWalkthroughVideoManifest(videoManifest).videos, [videoManifest]);
  const video = videos.find(asset => asset.tutorialId === tutorial.id);
  const script = walkthroughTranscript(tutorial, video);
  const last = stepIndex === tutorial.scenes.length - 1;
  function selectTutorial(id: string) { setTutorialId(id); setStepIndex(0); setAllTasks(false); selectedTask.current?.focus({preventScroll:true}); selectedTask.current?.scrollIntoView?.({block:'start',behavior:'auto'}); }
  function next() { if(stepIndex>=tutorial.scenes.length-2)player.current?.focus({preventScroll:true});setStepIndex(current => Math.min(current + 1, tutorial.scenes.length - 1)); }
  function previous() { if(stepIndex<=1)player.current?.focus({preventScroll:true});setStepIndex(current => Math.max(0, current - 1)); }
  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('video, input, textarea, select') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    if (event.key === 'Home') { event.preventDefault(); event.currentTarget.focus({preventScroll:true});setStepIndex(0); }
    if (event.key === 'End') { event.preventDefault(); event.currentTarget.focus({preventScroll:true});setStepIndex(tutorial.scenes.length - 1); }
  }
  return <main className="walkthroughs-page jv-rails">
    <Helmet><title>{meta.title}</title><meta name="description" content={meta.description} /><link rel="canonical" href="https://jobvance.io/walkthroughs" /></Helmet>
    <nav className="wt-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to="/help">Help center</Link><span aria-hidden="true">/</span><span aria-current="page">Walkthroughs</span></nav>
    <header className="wt-hero jv-aside-grid jv-dark"><div className="jv-aside-slot"><WalkthroughAside /></div><p className="wt-eyebrow"><FileText size={16} aria-hidden="true" /> SHORT STEPS, AT YOUR PACE</p><h1 className="jv-enter-h1">Watch how to use Jobvance.</h1><p className="jv-enter">Choose a task, watch a captioned video or follow the interactive steps at your own pace.</p><div className="wt-hero-actions"><Link className="jv-btn jv-btn--primary jv-btn--lg" to="/onboarding">Start my search<ArrowRight aria-hidden="true" /></Link><a className="jv-link" href="#wt-interactive"><span>Follow interactive steps</span><ArrowRight aria-hidden="true" /></a></div></header>
    <section ref={selectedTask} data-reveal className="wt-selected-task" aria-label="Selected walkthrough" tabIndex={-1}><div><p className="wt-eyebrow">YOUR SELECTED TASK</p><h2>{tutorial.title}</h2><p>{tutorial.scenes.length} interactive steps{video ? ` · ${timeLabel(video.durationSeconds)} captioned video` : ' · written script'}</p></div><button className="wt-task-toggle" type="button" aria-expanded={allTasks} aria-controls="wt-task-options" onClick={()=>setAllTasks(value=>!value)}>{allTasks?'Close task choices':'Choose a different task'}</button><nav className="wt-format-links" aria-label="Walkthrough formats">{video && <a href="#wt-recorded">Watch the video</a>}<a href="#wt-interactive">Follow interactive steps</a><a href="#wt-transcript" onClick={()=>{if(transcript.current)transcript.current.open=true;}}>Read {video ? 'video transcript' : 'written script'}</a><Link to={`/help#${tutorial.helpAnchor}`}>Read task help <ArrowRight size={14} aria-hidden="true" /></Link></nav></section>
    <section id="wt-task-options" hidden={!allTasks} className="wt-task-picker" aria-label="Choose a walkthrough">{walkthroughs.map(item => <button key={item.id} type="button" aria-pressed={item.id === tutorialId} onClick={() => selectTutorial(item.id)}><span>{item.scenes.length} steps</span><strong>{item.title}</strong><small>{item.description}</small><span className="wt-task-audience">{item.audience}</span></button>)}</section>
    {video && <RecordedWalkthrough key={`${video.tutorialId}-${video.videoUrl}`} asset={video} />}
    <section id="wt-interactive" ref={player} className="wt-player" aria-labelledby="wt-tutorial-title" tabIndex={0} onKeyDown={handleKeys} aria-describedby="wt-keyboard-help">
      <header className="wt-player-heading"><div><p className="wt-eyebrow">INTERACTIVE WALKTHROUGH</p><h2 id="wt-tutorial-title">{tutorial.title}</h2></div><button className="wt-caption-toggle" type="button" aria-pressed={captions} onClick={() => setCaptions(value => !value)}><Captions size={17} aria-hidden="true" /> Step captions {captions ? 'on' : 'off'}</button></header>
      <p className="wt-format-note">Follow the steps at your own pace. This product tour uses an example application; open your workspace when you are ready to use your own information.</p>
      <p className="wt-step-status" role="status">Step {stepIndex + 1} of {tutorial.scenes.length}: {scene.title}</p>
      {/* Controls and the step picker sit above the stage, so "Next step" never moves when a step is taller or shorter. */}
      <div className="wt-controls"><div className="wt-navigation"><button className="wt-button" type="button" disabled={stepIndex === 0} onClick={previous}><ArrowLeft size={16} aria-hidden="true" />Previous step</button><button className="wt-button wt-button--primary" type="button" disabled={last} onClick={next}>Next step<ArrowRight size={16} aria-hidden="true" /></button><button className="wt-restart" type="button" onClick={() => setStepIndex(0)}><RotateCcw size={15} aria-hidden="true" />Restart</button></div><p id="wt-keyboard-help">Focus this walkthrough and use the <ArrowLeft className="jv-inline-arrow" aria-label="left arrow" /> and <ArrowRight className="jv-inline-arrow" aria-label="right arrow" /> keys to move, Home to restart, or End for the final step.</p></div>
      <ol className="wt-step-picker" aria-label="Walkthrough steps">{tutorial.scenes.map((item, index) => <li key={item.id}><button type="button" aria-current={index === stepIndex ? 'step' : undefined} onClick={() => setStepIndex(index)}><span aria-hidden="true">{index < stepIndex ? <Check size={14} /> : index + 1}</span>{item.title}</button></li>)}</ol>
      <div className="wt-storyboard"><div className="wt-demo" role="group" aria-label="Product tour: example application"><div className="wt-demo-top"><BrandLockup /><span>PRODUCT TOUR</span></div><div className="wt-demo-body"><p className="wt-demo-section">{scene.demo.section}</p><dl>{scene.demo.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl><div className="wt-demo-action"><span>{scene.demo.action}<ArrowRight size={15} aria-hidden="true" /></span></div><p className="wt-demo-note">{scene.demo.note}</p></div></div>
        <div className="wt-instructions"><p className="wt-eyebrow">YOUR NEXT CLICK</p><h3>{scene.title}</h3><p>{scene.instruction}</p><p className="wt-demo-disclosure">Follow this step in your workspace using your own information. The tour does not change your account.</p>{captions && <div className="wt-step-caption" role="group" aria-label="Current step caption"><Captions size={17} aria-hidden="true" /><p>{scene.caption}</p></div>}</div>
      </div>
      {last && <div className="wt-ready"><p>You have reached the end of the example. Your own document will still need your review and approval.</p><Link className="wt-button wt-button--primary" to={tutorial.action.to}>{tutorial.action.label}<ArrowRight size={16} aria-hidden="true" /></Link></div>}
    </section>
    <details id="wt-transcript" ref={transcript} className="wt-transcript"><summary>{video ? 'Complete video transcript and measured chapter timings' : 'Complete written script and planned script timings'}: {tutorial.title}</summary><p>{video ? 'This is the narration in the released recording. Chapter times use the measured video; the separate interactive steps may include newer guidance. No customer data is used.' : 'Read the steps for this product tour. Timings are estimates for the written guide. A recording is not available for this selection.'}</p><ol>{script.map(item => <li key={item.id}><h3>{item.title}</h3><p className="wt-script-time">{item.timing === 'unavailable' ? 'Recording timing unavailable for this step' : `${item.timing === 'recorded' ? 'Video chapter' : 'Planned narration'} ${timeLabel(item.startSeconds!)}–${timeLabel(item.endSeconds!)}`} · {item.demo.section}</p><p>{item.narration}</p><p className="wt-script-caption"><strong>Interactive step caption:</strong> {item.caption}</p></li>)}</ol></details>
    <section className="wt-further" data-reveal><div><h2>Ready to use your own experience?</h2><p>Open the free check for one CV and vacancy, or read how the <span className="jv-nb">Automated Job Loop</span> reuses your saved facts.</p></div><div><Link className="wt-button wt-button--primary" to="/check">Try the free CV check<ArrowRight size={16} aria-hidden="true" /></Link><Link to="/job-loop">How the Automated Job Loop works</Link><Link to="/guides">Career guides</Link><Link to="/contact">Get workflow help</Link></div></section>
  </main>;
}

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Walkthroughs from '@/pages/Walkthroughs';
import { isPublicWalkthroughMediaUrl, publicWalkthroughVideoManifest, validateWalkthroughVideoManifest, walkthroughs, walkthroughScript, type WalkthroughVideoAsset } from '@/lib/walkthroughs';

vi.unmock('react-router-dom');
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function showWalkthrough(manifest: unknown={version:1,videos:[]}, path = '/walkthroughs') { return render(<MemoryRouter initialEntries={[path]}><Walkthroughs videoManifest={manifest} /></MemoryRouter>); }
function readyAsset(patch: Partial<WalkthroughVideoAsset> = {}): WalkthroughVideoAsset {
  return { tutorialId: 'first-check', videoUrl: 'https://jobvance.io/walkthroughs/media/first-check.mp4', captionUrl: 'https://jobvance.io/walkthroughs/media/first-check.vtt', durationSeconds: 140, verifiedAt: '2026-10-13T12:00:00Z', usesFictionalData: true, contentKind: 'screen_recording', status: 'ready', ...patch };
}

describe('honest interactive walkthroughs', () => {
  it('shows a fictional storyboard and full script without pretending a video exists', () => {
    const { container } = showWalkthrough();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Watch how to use Jobvance.');
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3: Add your CV and the job');
    expect(screen.getByText('PRODUCT TOUR')).toBeInTheDocument();
    expect(screen.getByText(/The tour does not change your account/)).toBeInTheDocument();
    expect(screen.getByText(/planned script timings/i)).toBeInTheDocument();
    expect(screen.getByText(/Planned narration 0:00–0:33/)).toBeInTheDocument();
    expect(container.querySelector('video, iframe')).toBeNull();
    expect(screen.queryByRole('button', { name: /watch|load recorded/i })).not.toBeInTheDocument();
    expect(validateWalkthroughVideoManifest(publicWalkthroughVideoManifest).videos).toHaveLength(publicWalkthroughVideoManifest.videos.length);
  });

  it('supports next, previous, restart, direct scene choice and captions', async () => {
    const user = userEvent.setup();
    showWalkthrough();
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 2 of 3: Review changes');
    expect(screen.getByLabelText('Current step caption')).toHaveTextContent('the line of your own CV it came from');
    await user.click(screen.getByRole('button', { name: 'Step captions on' }));
    expect(screen.queryByLabelText('Current step caption')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3');
    const steps = screen.getByRole('list', { name: 'Walkthrough steps' });
    await user.click(within(steps).getByRole('button', { name: /Download/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 3 of 3: Download');
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Start my free check' })).toHaveAttribute('href', '/check');
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3');
  });

  it('supports keyboard controls and resets the step when the task changes', async () => {
    const user = userEvent.setup();
    showWalkthrough();
    const player = screen.getByRole('region', { name: 'Your first CV check' });
    player.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent('Step 2 of 3');
    await user.keyboard('{End}');
    expect(screen.getByRole('status')).toHaveTextContent('Step 3 of 3');
    await user.keyboard('{Home}');
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3');
    await user.click(screen.getByRole('button', { name: 'Choose a different task' }));
    await user.click(screen.getByRole('button', { name: /Set up your reusable career record/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 5: Open the saved workspace');
    expect(screen.getByRole('link', { name: 'Read task help' })).toHaveAttribute('href', '/help#job-loop-start');
    expect(screen.getByRole('region', { name: 'Selected walkthrough' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Choose a different task' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Choose a walkthrough' })).not.toBeInTheDocument();
  });
  it('keeps a keyboard focus target after an endpoint disables a navigation button',async()=>{
    const user=userEvent.setup();showWalkthrough();
    const player=screen.getByRole('region',{name:'Your first CV check'});
    screen.getByRole('button',{name:'Next step'}).focus();await user.keyboard('{End}');
    expect(player).toHaveFocus();expect(screen.getByRole('button',{name:'Next step'})).toBeDisabled();
    screen.getByRole('button',{name:'Previous step'}).focus();await user.keyboard('{Home}');
    expect(player).toHaveFocus();expect(screen.getByRole('button',{name:'Previous step'})).toBeDisabled();
  });

  it('supports a known tutorial URL and recovers from an unknown selection', () => {
    const view = showWalkthrough(undefined, '/walkthroughs?tutorial=another-application');
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 4: Keep the current application first');
    view.unmount();
    showWalkthrough(undefined, '/walkthroughs?tutorial=missing');
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3: Add your CV and the job');
  });

  it('shows text-only steps for check tutorials whose recordings show the retired six-step flow', () => {
    for (const id of ['first-check', 'another-application', 'controls-and-recovery']) expect(publicWalkthroughVideoManifest.videos.some(video => video.tutorialId === id)).toBe(false);
    const { container } = showWalkthrough(publicWalkthroughVideoManifest);
    const selected = screen.getByRole('region', { name: 'Selected walkthrough' });
    expect(selected).toHaveTextContent('Your first CV check');
    expect(selected).toHaveTextContent('3 interactive steps · written script');
    expect(within(selected).queryByRole('link', { name: 'Watch the video' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load recorded walkthrough' })).not.toBeInTheDocument();
    expect(screen.getByText(/Planned narration 0:00–0:33/)).toBeInTheDocument();
    expect(container.querySelector('#wt-recorded, video')).toBeNull();
  });

  it('presents the selected task before choosing alternatives and distinguishes the released video from untimed steps', async () => {
    const user=userEvent.setup();
    const { container } = showWalkthrough(publicWalkthroughVideoManifest, '/walkthroughs?tutorial=job-loop-start');
    const selected = screen.getByRole('region', { name: 'Selected walkthrough' });
    expect(selected).toHaveTextContent('Set up your reusable career record');
    expect(selected).toHaveTextContent('5 interactive steps · 1:35 captioned video');
    expect(within(selected).getByRole('link', { name: 'Watch the video' })).toHaveAttribute('href', '#wt-recorded');
    expect(within(selected).getByRole('link', { name: 'Follow interactive steps' })).toHaveAttribute('href', '#wt-interactive');
    expect(container.querySelector('#wt-task-options')).toHaveAttribute('hidden');
    expect(screen.getByText(/Follow the steps at your own pace/)).toBeInTheDocument();
    expect(screen.getByText('Video chapter 0:16–0:34 · Career record · 1. Import or paste your CV')).toBeInTheDocument();
    expect(screen.getByText('Video chapter 1:14–1:35 · Opportunities · Add an opportunity')).toBeInTheDocument();
    expect(screen.queryByText(/Planned narration/)).not.toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
    await user.click(within(selected).getByRole('link', { name: 'Read video transcript' }));
    expect(container.querySelector('#wt-transcript')).toHaveAttribute('open');
  });

  it('loads actual captioned media only after a user action and provides a playback-error fallback', async () => {
    const user = userEvent.setup();
    const asset = readyAsset({ presenterVideoUrl: 'https://jobvance.io/walkthroughs/media/presenter.mp4', presenterDisclosure: 'AI-generated synthetic presenter, not a human adviser.' });
    const { container } = showWalkthrough({ version: 1, videos: [asset] });
    expect(container.querySelector('video')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Load recorded walkthrough' }));
    const videos = container.querySelectorAll('video');
    expect(videos).toHaveLength(2);
    expect(videos[0]).toHaveAttribute('controls');
    expect(videos[0]).toHaveAttribute('preload', 'metadata');
    expect(videos[0]).toHaveAttribute('crossorigin', 'anonymous');
    expect(videos[0].querySelector('track')).toHaveAttribute('src', asset.captionUrl);
    expect(videos[1]).toHaveClass('wt-presenter-video');
    expect(screen.getByText('AI-generated synthetic presenter, not a human adviser.')).toBeInTheDocument();
    fireEvent.error(videos[0].querySelector('source')!);
    expect(screen.getByRole('alert')).toHaveTextContent('Continue with the interactive steps');
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3');
  });

  it('renders initial instructions and transcript without window, navigator, fetch or storage', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', undefined);
    const html = renderToString(<MemoryRouter><Walkthroughs /></MemoryRouter>);
    expect(html).toContain('PRODUCT TOUR');
    expect(html).toContain('Complete written script and planned script timings');
    expect(html).toContain('Tailor my CV for this job');
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
});

describe('walkthrough scripts and public media boundary', () => {
  it('has 3–6 complete original scenes with contiguous planned narration timings', () => {
    for (const tutorial of walkthroughs) {
      expect(tutorial.scenes.length).toBeGreaterThanOrEqual(3);
      expect(tutorial.scenes.length).toBeLessThanOrEqual(6);
      expect(new Set(tutorial.scenes.map(scene => scene.id)).size).toBe(tutorial.scenes.length);
      const script = walkthroughScript(tutorial);
      expect(script[0].startSeconds).toBe(0);
      for (const [index, scene] of script.entries()) {
        expect(scene.narration.length).toBeGreaterThan(80);
        expect(scene.caption.length).toBeGreaterThan(30);
        expect(scene.stageId).toMatch(/^(check|loop)-/);
        if (index > 0) expect(scene.startSeconds).toBe(script[index - 1].endSeconds);
      }
    }
  });

  it('follows the three-stage check and names no retired check controls', () => {
    expect(walkthroughs.find(tutorial => tutorial.id === 'first-check')!.scenes.map(scene => scene.title)).toEqual(['Add your CV and the job', 'Review changes', 'Download']);
    const retired = ['Continue to your CV', 'Use this reviewed CV text', 'One vacancy', 'Check these inputs', 'Review my CV & questions', 'Recheck my changes', 'Approve this CV', 'Preview current PDF', 'Target role', 'Check this next vacancy', 'Inspect or edit the reused CV'];
    for (const scene of walkthroughs.flatMap(tutorial => tutorial.scenes).filter(scene => scene.stageId.startsWith('check-'))) {
      const copy = [scene.instruction, scene.caption, scene.narration, scene.demo.section, scene.demo.action, scene.demo.note, ...scene.demo.fields.flatMap(field => [field.label, field.value])].join(' ');
      for (const label of retired) expect(copy, `${scene.id} mentions ${label}`).not.toContain(label);
    }
  });

  it('accepts only exact first-party public HTTPS paths for supported asset types', () => {
    expect(isPublicWalkthroughMediaUrl('https://jobvance.io/walkthroughs/media/check.mp4', 'video')).toBe(true);
    expect(isPublicWalkthroughMediaUrl('https://gvftdfriujrkpptdueyb.supabase.co/storage/v1/object/public/walkthroughs/check.webm', 'video')).toBe(true);
    for (const url of ['http://jobvance.io/walkthroughs/media/check.mp4', 'https://evil.example/check.mp4', 'https://jobvance.io.evil.example/walkthroughs/media/check.mp4', 'https://other.supabase.co/storage/v1/object/public/walkthroughs/check.mp4', 'https://jobvance.io/private/check.mp4', 'https://jobvance.io/walkthroughs/media/check.mp4?token=secret', 'https://user:password@jobvance.io/walkthroughs/media/check.mp4', 'javascript:alert(1)', 'https://jobvance.io/walkthroughs/media/check.svg', 'https://jobvance.io/walkthroughs/media/%2e%2e/check.mp4']) expect(isPublicWalkthroughMediaUrl(url, 'video')).toBe(false);
    expect(isPublicWalkthroughMediaUrl('https://jobvance.io/walkthroughs/media/check.mp4', 'captions')).toBe(false);
    expect(isPublicWalkthroughMediaUrl('https://raw.githubusercontent.com/aarshvir/career-climb-automagic/main/docs/product-hardening/tutorial-assets/videos/first-check.mp4','video')).toBe(true);
    expect(isPublicWalkthroughMediaUrl('https://raw.githubusercontent.com/other/career-climb-automagic/main/docs/product-hardening/tutorial-assets/videos/first-check.mp4','video')).toBe(false);
    expect(isPublicWalkthroughMediaUrl('https://raw.githubusercontent.com/aarshvir/other/main/docs/product-hardening/tutorial-assets/videos/first-check.mp4','video')).toBe(false);
  });
  it('retains an integrated AI presenter disclosure and avoids duplicate native captions',async()=>{
    const user=userEvent.setup();
    const asset=readyAsset({contentKind:'screen_walkthrough',presenterDisclosure:'Original fictional AI presenter; actual product screens use fictional data.',hasBurnedCaptions:true});
    expect(validateWalkthroughVideoManifest({version:1,videos:[asset]}).videos[0]).toMatchObject({presenterDisclosure:asset.presenterDisclosure,hasBurnedCaptions:true});
    const {container}=showWalkthrough({version:1,videos:[asset]});
    await user.click(screen.getByRole('button',{name:'Load recorded walkthrough'}));
    const track=container.querySelector('track')!;
    expect(track).not.toHaveAttribute('default');
    fireEvent.error(track);
    expect(screen.getByRole('alert')).toHaveTextContent('On-screen captions remain in the recording');
    expect(container.querySelector('video')).toBeInTheDocument();
  });
  it('uses measured chapter starts and rejects invalid chapter metadata',async()=>{
    const user=userEvent.setup(),asset=readyAsset({chapters:[{id:'add',title:'Add your CV and the job',startSeconds:0},{id:'review',title:'Review the changes',startSeconds:13.125}]});
    const {container}=showWalkthrough({version:1,videos:[asset]});
    expect(screen.getByText('Video chapter 0:00–0:13 · Add your CV and the job')).toBeInTheDocument();
    expect(screen.getByText('Video chapter 0:13–2:20 · What changed for this job · Line 9')).toBeInTheDocument();
    expect(screen.queryByText(/Planned narration/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Recording timing unavailable for this step/)).toHaveLength(1);
    await user.click(screen.getByRole('button',{name:'Load recorded walkthrough'}));
    await user.click(screen.getByRole('button',{name:'0:13 · Review the changes'}));
    const video=container.querySelector('video')!;fireEvent.loadedMetadata(video);expect(video.currentTime).toBe(13.125);
    expect(validateWalkthroughVideoManifest({version:1,videos:[{...asset,chapters:[null]}]}).videos).toHaveLength(0);
    expect(validateWalkthroughVideoManifest({version:1,videos:[{...asset,chapters:[{id:'review',title:'Wrong timing',startSeconds:150}]}]}).videos).toHaveLength(0);
    expect(validateWalkthroughVideoManifest({version:1,videos:[{...asset,chapters:[{id:'role',title:'Retired six-step chapter',startSeconds:0}]}]}).videos).toHaveLength(0);
  });

  it('rejects unready, uncaptained, real-user or undisclosed presenter entries and duplicate IDs', () => {
    const accepted = readyAsset();
    expect(validateWalkthroughVideoManifest({ version: 1, videos: [accepted] }).videos).toHaveLength(1);
    for (const patch of [{ status: 'planned' }, { captionUrl: undefined }, { usesFictionalData: false }, { contentKind: 'avatar_only' }, { tutorialId: 'missing' }, { verifiedAt: 'not-a-date' }, { durationSeconds: Infinity }, { videoUrl: 'https://evil.example/video.mp4' }, { presenterVideoUrl: accepted.videoUrl }, { presenterVideoUrl: accepted.videoUrl, presenterDisclosure: 'Your professional human expert.' }]) expect(validateWalkthroughVideoManifest({ version: 1, videos: [{ ...accepted, ...patch }] }).videos).toEqual([]);
    expect(validateWalkthroughVideoManifest({ version: 1, videos: [accepted, accepted] }).videos).toHaveLength(1);
    expect(validateWalkthroughVideoManifest({ version: 2, videos: [accepted] }).videos).toEqual([]);
    expect(validateWalkthroughVideoManifest(null).videos).toEqual([]);
  });
});

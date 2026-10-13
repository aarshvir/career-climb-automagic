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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('See the next step.');
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 6: Choose one target role');
    expect(screen.getByText('FICTIONAL DEMO')).toBeInTheDocument();
    expect(screen.getByText(/not a live form/)).toBeInTheDocument();
    expect(screen.getByText(/planned script timings/i)).toBeInTheDocument();
    expect(screen.getByText(/Planned narration 0:00–0:18/)).toBeInTheDocument();
    expect(container.querySelector('video, iframe')).toBeNull();
    expect(screen.queryByRole('button', { name: /watch|load recorded/i })).not.toBeInTheDocument();
    expect(validateWalkthroughVideoManifest(publicWalkthroughVideoManifest).videos).toHaveLength(publicWalkthroughVideoManifest.videos.length);
  });

  it('supports next, previous, restart, direct scene choice and captions', async () => {
    const user = userEvent.setup();
    showWalkthrough();
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 2 of 6: Read and check your CV text');
    expect(screen.getByLabelText('Current step caption')).toHaveTextContent('up to 5 MB');
    await user.click(screen.getByRole('button', { name: 'Step captions on' }));
    expect(screen.queryByLabelText('Current step caption')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 6');
    const steps = screen.getByRole('list', { name: 'Walkthrough steps' });
    await user.click(within(steps).getByRole('button', { name: /Preview, approve and download/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 6 of 6');
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Start my free check' })).toHaveAttribute('href', '/check');
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 6');
  });

  it('supports keyboard controls and resets the step when the task changes', async () => {
    const user = userEvent.setup();
    showWalkthrough();
    const player = screen.getByRole('region', { name: 'Your first CV check' });
    player.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent('Step 3 of 6');
    await user.keyboard('{End}');
    expect(screen.getByRole('status')).toHaveTextContent('Step 6 of 6');
    await user.keyboard('{Home}');
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 6');
    await user.click(screen.getByRole('button', { name: /Set up your reusable career record/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 5: Open the saved workspace');
    expect(screen.getByRole('link', { name: 'Read task help' })).toHaveAttribute('href', '/help#job-loop-start');
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
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 6: Choose one target role');
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
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 6');
  });

  it('renders initial instructions and transcript without window, navigator, fetch or storage', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', undefined);
    const html = renderToString(<MemoryRouter><Walkthroughs /></MemoryRouter>);
    expect(html).toContain('FICTIONAL DEMO');
    expect(html).toContain('Complete transcript and planned script timings');
    expect(html).toContain('Continue to your CV');
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
});

describe('walkthrough scripts and public media boundary', () => {
  it('has 4–6 complete original scenes with contiguous planned narration timings', () => {
    for (const tutorial of walkthroughs) {
      expect(tutorial.scenes.length).toBeGreaterThanOrEqual(4);
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

  it('accepts only exact first-party public HTTPS paths for supported asset types', () => {
    expect(isPublicWalkthroughMediaUrl('https://jobvance.io/walkthroughs/media/check.mp4', 'video')).toBe(true);
    expect(isPublicWalkthroughMediaUrl('https://gvftdfriujrkpptdueyb.supabase.co/storage/v1/object/public/walkthroughs/check.webm', 'video')).toBe(true);
    for (const url of ['http://jobvance.io/walkthroughs/media/check.mp4', 'https://evil.example/check.mp4', 'https://jobvance.io.evil.example/walkthroughs/media/check.mp4', 'https://other.supabase.co/storage/v1/object/public/walkthroughs/check.mp4', 'https://jobvance.io/private/check.mp4', 'https://jobvance.io/walkthroughs/media/check.mp4?token=secret', 'https://user:password@jobvance.io/walkthroughs/media/check.mp4', 'javascript:alert(1)', 'https://jobvance.io/walkthroughs/media/check.svg', 'https://jobvance.io/walkthroughs/media/%2e%2e/check.mp4']) expect(isPublicWalkthroughMediaUrl(url, 'video')).toBe(false);
    expect(isPublicWalkthroughMediaUrl('https://jobvance.io/walkthroughs/media/check.mp4', 'captions')).toBe(false);
    expect(isPublicWalkthroughMediaUrl('https://raw.githubusercontent.com/aarshvir/career-climb-automagic/main/docs/product-hardening/tutorial-assets/videos/first-check.mp4','video')).toBe(true);
    expect(isPublicWalkthroughMediaUrl('https://raw.githubusercontent.com/other/career-climb-automagic/main/docs/product-hardening/tutorial-assets/videos/first-check.mp4','video')).toBe(false);
    expect(isPublicWalkthroughMediaUrl('https://raw.githubusercontent.com/aarshvir/other/main/docs/product-hardening/tutorial-assets/videos/first-check.mp4','video')).toBe(false);
  });
  it('retains an integrated AI presenter disclosure and avoids duplicate native captions',()=>{
    const asset=readyAsset({contentKind:'screen_walkthrough',presenterDisclosure:'Original fictional AI presenter; actual product screens use fictional data.',hasBurnedCaptions:true});
    expect(validateWalkthroughVideoManifest({version:1,videos:[asset]}).videos[0]).toMatchObject({presenterDisclosure:asset.presenterDisclosure,hasBurnedCaptions:true});
  });
  it('uses measured chapter starts and rejects invalid chapter metadata',async()=>{
    const user=userEvent.setup(),asset=readyAsset({chapters:[{id:'role',title:'Choose one target role',startSeconds:0},{id:'cv',title:'Read your CV',startSeconds:13.125}]});
    const {container}=showWalkthrough({version:1,videos:[asset]});
    await user.click(screen.getByRole('button',{name:'Load recorded walkthrough'}));
    await user.click(screen.getByRole('button',{name:'0:13 · Read your CV'}));
    const video=container.querySelector('video')!;fireEvent.loadedMetadata(video);expect(video.currentTime).toBe(13.125);
    expect(validateWalkthroughVideoManifest({version:1,videos:[{...asset,chapters:[null]}]}).videos).toHaveLength(0);
    expect(validateWalkthroughVideoManifest({version:1,videos:[{...asset,chapters:[{id:'cv',title:'Wrong timing',startSeconds:150}]}]}).videos).toHaveLength(0);
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

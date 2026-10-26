import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Link, Routes, Route } from 'react-router-dom';
import fallbackHtml from '../../index.html?raw';
import SiteShareMetadata from '../components/SiteShareMetadata';
import { SeoHead } from '../components/SEOHead';
import ProductPage from '../pages/ProductPage';
import HelpCenter from '../pages/HelpCenter';
import LoopOnboarding from '../pages/LoopOnboarding';
import { staticPageMeta } from '../lib/public-site-meta';
import { clearTrackingDraftMemory } from '../lib/tracking-draft-memory';

vi.unmock('react-router-dom');
vi.unmock('react-helmet-async');
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: vi.fn(async () => ({ existingState: 'absent' })), boundLoopAction: (value: unknown) => value }));
const image='https://jobvance.io/og-job-loop-account.png?v=2';
const fallbackTitle='Jobvance — automate your job search';
const originalHead=document.head.innerHTML;
function content(key:string) {
  const matches=document.head.querySelectorAll(`meta[name="${key}"],meta[property="${key}"]`);
  expect(matches).toHaveLength(1);
  expect(matches[0]).toHaveAttribute('data-rh','true');
  return matches[0].getAttribute('content');
}
function tree(path='/') {
  return <HelmetProvider><MemoryRouter initialEntries={[path]}><SiteShareMetadata/><nav><Link to="/">Test home</Link><Link to="/help">Test help</Link><Link to="/onboarding">Test setup</Link><Link to="/custom-preview">Test custom</Link></nav><Routes>
    <Route path="/" element={<ProductPage kind="home"/>}/><Route path="/help" element={<HelpCenter/>}/><Route path="/onboarding" element={<LoopOnboarding/>}/>
    <Route path="/custom-preview" element={<SeoHead title="Custom article" description="An article-specific description." ogImage="https://jobvance.io/custom-preview.png"/>}/>
  </Routes></MemoryRouter></HelmetProvider>;
}
beforeEach(()=>{
  clearTrackingDraftMemory();
  document.head.innerHTML = new DOMParser().parseFromString(fallbackHtml, 'text/html').head.innerHTML;
});
afterEach(async()=>{cleanup();clearTrackingDraftMemory();await new Promise(resolve=>setTimeout(resolve,30));document.head.innerHTML=originalHead;});
describe('real Helmet ownership during client mount and navigation',()=>{
  it('replaces the static fallback and retains exactly one share image on public and title-only account routes',async()=>{
    render(tree());
    await waitFor(()=>expect(content('og:title')).toBe(staticPageMeta('/')!.title));
    expect(content('og:description')).toBe(staticPageMeta('/')!.description);
    expect(content('twitter:title')).toBe(staticPageMeta('/')!.title);
    expect(content('twitter:description')).toBe(staticPageMeta('/')!.description);
    for(const key of ['og:image','twitter:image'])expect(content(key)).toBe(image);
    for(const key of ['og:image:alt','twitter:image:alt'])expect(content(key)).toContain('Automate your job search');
    fireEvent.click(screen.getByRole('link',{name:'Test help'}));
    await waitFor(()=>expect(content('og:title')).toBe(staticPageMeta('/help')!.title));
    expect(content('twitter:title')).toBe(staticPageMeta('/help')!.title);
    expect(content('og:description')).toBe(staticPageMeta('/help')!.description);
    expect(content('twitter:description')).toBe(staticPageMeta('/help')!.description);
    fireEvent.click(screen.getByRole('link',{name:'Test setup'}));
    await screen.findByRole('heading',{name:'Which roles would you like to find?'});
    await waitFor(()=>expect(content('og:title')).toBe(fallbackTitle));
    expect(document.title).toBe('Set up your Automated Job Loop | Jobvance');
    expect(content('twitter:title')).toBe(fallbackTitle);
    for(const key of ['description','og:description','twitter:description'])expect(content(key)).toMatch(/^Create your account,/);
    for(const key of ['og:image','twitter:image'])expect(content(key)).toBe(image);
    for(const key of ['og:image:alt','twitter:image:alt'])expect(content(key)).toContain('Automate your job search');
    expect(document.head.querySelectorAll('meta[property="og:image:width"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[property="og:image:width"]')).toHaveAttribute('content','1200');
    expect(document.head.querySelector('meta[property="og:image:height"]')).toHaveAttribute('content','630');
    expect(document.head.querySelector('meta[name="google-site-verification"]')).not.toHaveAttribute('data-rh');
    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute('content','strict-origin-when-cross-origin');
  });
  it('lets an actual SeoHead override image and alt once, then restores the shared image on navigation',async()=>{
    render(tree('/custom-preview'));
    await waitFor(()=>expect(content('og:title')).toBe('Custom article'));
    for(const key of ['og:image','twitter:image'])expect(content(key)).toBe('https://jobvance.io/custom-preview.png');
    for(const key of ['og:image:alt','twitter:image:alt'])expect(content(key)).toBe('An article-specific description.');
    fireEvent.click(screen.getByRole('link',{name:'Test home'}));
    await waitFor(()=>expect(content('og:title')).toBe(staticPageMeta('/')!.title));
    for(const key of ['og:image','twitter:image'])expect(content(key)).toBe(image);
    for(const key of ['og:image:alt','twitter:image:alt'])expect(content(key)).toContain('Automate your job search');
    expect(document.head.querySelectorAll('title')).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });
});

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductPage from '@/pages/ProductPage';
import JobLoopOverview from '@/pages/JobLoopOverview';
import MvpFooter from '@/components/layout/MvpFooter';
import CareerGuides from '@/pages/CareerGuides';
import AudienceLanding from '@/pages/AudienceLanding';
import Auth from '@/pages/Auth';
import Walkthroughs from '@/pages/Walkthroughs';
import { publicStaticPages } from '@/lib/public-site-meta';

vi.unmock('react-router-dom');
afterEach(cleanup);
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null, loading: false, authError: null }) }));

// Owner copy rules for public marketing: no deterrent caveats, no unsupported absolutes, no bare "Job Loop" in prose.
const banned: [string, RegExp][] = [
  ['deterrent: nothing is sent', /nothing is sent/i],
  ['deterrent: apply yourself', /apply yourself|you apply yourself/i],
  ['deterrent: never applies', /never applies|does not apply for you|doesn.t apply for you/i],
  ['deterrent: submit on the employer', /submit on the employer/i],
  ['deterrent: you submit applications', /(you|your)\s+(review and\s+)?(send messages and\s+)?submit (each |your )?applications?/i],
  ['absolute: guaranteed', /guaranteed ats|guaranteed (job|interview)s?\b(?!\.)/i],
  ['absolute: every role you target', /every role you target/i],
  ['bare Job Loop', /(^|[^d] )Job Loop\b/],
];
function text(node: React.ReactElement) {
  const { container } = render(<HelmetProvider><MemoryRouter>{node}</MemoryRouter></HelmetProvider>);
  return container.textContent ?? '';
}
const surfaces: [string, () => React.ReactElement][] = [
  ['home', () => <ProductPage kind="home" />],
  ['how it works', () => <ProductPage kind="how" />],
  ['faq', () => <ProductPage kind="faq" />],
  ['about', () => <ProductPage kind="about" />],
  ['pricing', () => <ProductPage kind="pricing" />],
  ['job-loop', () => <JobLoopOverview />],
  ['footer', () => <MvpFooter />],
  ['guides', () => <CareerGuides />],
  ['for-students', () => <AudienceLanding audience="student" />],
  ['for-mba', () => <AudienceLanding audience="mba" />],
  ['for-career-switchers', () => <AudienceLanding audience="professional" />],
  // The account entry (the ad landing page) and the walkthrough hero are guarded too. Help and the recorded walkthrough
  // scripts are left out on purpose: in-product instructions legitimately say where you apply yourself.
  ['auth', () => <Auth />],
  ['walkthroughs', () => <Walkthroughs />],
];

describe('public marketing copy rules', () => {
  it.each(surfaces)('%s keeps to the owner copy rules', (_name, make) => {
    const content = text(make()).replace(/Automated Job Loop/g, 'AUTOMATED');
    for (const [label, pattern] of banned) expect(content, label).not.toMatch(pattern);
  });
});

describe('public page titles and descriptions', () => {
  it.each(publicStaticPages.map(page => [page.path, page] as const))('%s metadata keeps to the owner copy rules and the 60-character title cap', (_path, page) => {
    const content = `${page.title} ${page.description}`.replace(/Automated Job Loop/g, 'AUTOMATED');
    for (const [label, pattern] of banned) expect(content, label).not.toMatch(pattern);
    expect(page.title.length).toBeLessThanOrEqual(60);
  });
});

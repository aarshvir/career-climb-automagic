import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductPage from '@/pages/ProductPage';
import JobLoopOverview from '@/pages/JobLoopOverview';
import MvpFooter from '@/components/layout/MvpFooter';

vi.unmock('react-router-dom');
afterEach(cleanup);
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null, loading: false, authError: null }) }));

// Owner copy rules for public marketing: no deterrent caveats, no unsupported absolutes, no bare "Job Loop" in prose.
const banned: [string, RegExp][] = [
  ['deterrent: nothing is sent', /nothing is sent/i],
  ['deterrent: apply yourself', /apply yourself|you apply yourself/i],
  ['deterrent: never applies', /never applies|does not apply for you|doesn.t apply for you/i],
  ['deterrent: submit on the employer', /submit on the employer/i],
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
];

describe('public marketing copy rules', () => {
  it.each(surfaces)('%s keeps to the owner copy rules', (_name, make) => {
    const content = text(make()).replace(/Automated Job Loop/g, 'AUTOMATED');
    for (const [label, pattern] of banned) expect(content, label).not.toMatch(pattern);
  });
});

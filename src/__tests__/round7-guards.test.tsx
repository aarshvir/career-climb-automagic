import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductPage from '@/pages/ProductPage';
import AudienceLanding from '@/pages/AudienceLanding';
import Auth from '@/pages/Auth';
import { passPlans } from '@/lib/pass-plans';
import { publicSitemap } from '@/lib/public-route-manifest';

vi.unmock('react-router-dom');
afterEach(cleanup);
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null, loading: false, authError: null, signInWithEmail: vi.fn(), signUpWithEmail: vi.fn(), signInWithGoogle: vi.fn(), resetPassword: vi.fn() }) }));

const root = resolve(__dirname, '../..');
const css = (file: string) => readFileSync(resolve(root, file), 'utf8');

function page(node: React.ReactElement, entry = '/') {
  return render(<HelmetProvider><MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter></HelmetProvider>);
}

describe('round 7 copy rules', () => {
  const absolutes = /Nothing invented|stays accurate|never adds employers/i;
  it.each([['about', 'about'], ['how', 'how'], ['faq', 'faq']] as const)('%s makes no unqualified accuracy promise', (_name, kind) => {
    const { container } = page(<ProductPage kind={kind} />);
    expect(container.textContent ?? '').not.toMatch(absolutes);
  });
});

describe('pricing keeps the entry price and the billing terms in view', () => {
  it('shows the cheapest one-time pass price in the passes summary, drawn from the plan data', () => {
    const { container } = page(<ProductPage kind="pricing" />);
    const cheapest = Math.min(...passPlans.map(plan => plan.price));
    const summary = container.querySelector('details.pricing-passes-disclosure > summary');
    expect(summary).toHaveTextContent(`one-time passes from $${cheapest}`);
  });
  it('states that no trial or subscription starts automatically outside the collapsed details', () => {
    const { container } = page(<ProductPage kind="pricing" />);
    const line = container.querySelector('.pricing-billed-line');
    expect(line).toHaveTextContent('No trial or subscription starts automatically');
  });
});

describe('audience heroes have their own artifacts', () => {
  it.each(['student', 'mba', 'professional'] as const)('%s does not reuse the shared three-row run card', audience => {
    const { container } = page(<AudienceLanding audience={audience} />);
    expect(container.querySelector('.audience-hero-visual .pc-run')).toBeNull();
    expect(container.querySelector('.audience-hero-visual .pc-card')).not.toBeNull();
  });
});

describe('sitemap', () => {
  it('only asserts a modified date for pages that have a real one', () => {
    const xml = publicSitemap();
    expect(xml).toContain('<loc>https://jobvance.io/pricing</loc></url>');
  });
});

describe('dark-band buttons cannot be overridden back to white on white', () => {
  it('guides and help set the dark-band primary label with !important, beating their base rules', () => {
    expect(css('src/pages/CareerGuides.css')).toMatch(/\.cg-actions\.jv-dark a\.cg-primary[^{]*\{[^}]*color:\s*var\(--jv-forest\)\s*!important/);
    expect(css('src/pages/HelpCenter.css')).toMatch(/\.hc-further\.jv-dark \.hc-button--primary\s*\{[^}]*color:\s*var\(--jv-forest\)\s*!important/);
  });
});

describe('auth validation (declared change: custom field validation replaces native browser validation)', () => {
  it('names the count, not one field, when several fields are invalid, and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    page(<Auth />, '/auth?mode=signup');
    await user.click(screen.getByRole('button', { name: /Create account/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Please fix the \d+ highlighted fields below\./);
    expect(screen.getByLabelText('Full name')).toHaveFocus();
  });
  it('reports an empty password in sign-in mode on the password field', async () => {
    const user = userEvent.setup();
    page(<Auth />, '/auth');
    await user.type(screen.getByLabelText('Email address'), 'person@example.com');
    await user.click(screen.getByRole('button', { name: /^Sign in/ }));
    expect((await screen.findAllByText('Enter your password to continue.')).length).toBeGreaterThan(0);
  });
});

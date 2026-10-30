import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
import SubscriptionPricing from '@/pages/SubscriptionPricing';
import ProductPage from '@/pages/ProductPage';
import HomePage from '@/pages/HomePage';
import HelpCenter from '@/pages/HelpCenter';

afterEach(cleanup);
const read = (file: string) => readFileSync(resolve(__dirname, '..', '..', file), 'utf8').replace(/\r\n/g, '\n');
const css = (file: string) => read(`src/${file}`);
const wrap = (node: React.ReactNode) => <HelmetProvider><MemoryRouter>{node}</MemoryRouter></HelmetProvider>;

describe('round 12 guards', () => {
  it('the home hero is one staged object: the run window and a three-bullet resume sheet that sits outside the window (nothing covers the run footer)', () => {
    const { container } = render(wrap(<HomePage />));
    const stage = container.querySelector('.hs')!;
    expect(stage).not.toBeNull();
    const sheet = stage.querySelector('.rs')!;
    expect(sheet.querySelectorAll('.rs-list li')).toHaveLength(3);
    expect(sheet.querySelectorAll('mark').length).toBeGreaterThanOrEqual(3);
    expect(stage.querySelector('.hs-win')!.contains(sheet)).toBe(false);
    expect(container.querySelector('.jv-hero-orbit-wrap')).toBeNull();
  });

  it('the account entry shell and the React panel carry the same description, and the page keeps no duplicate steps or check line', () => {
    const shell = read('scripts/build-host-worker.mjs');
    const auth = read('src/pages/Auth.tsx');
    const sentence = 'Choose your roles and locations once. <span className="jv-nb">Automated Job Loop</span> finds the best-matching jobs and prepares a tailored, role-specific CV for each.';
    expect(auth).toContain(sentence);
    expect(shell).toContain(`<p class="ap-story-description">${sentence.replace('className', 'class')}</p>`);
    expect(shell).toContain('Free account · 3 tailored CVs a month');
    expect(auth).not.toContain('ap-story-steps');
    expect(auth).not.toContain('ap-story-footnote');
    expect(auth).not.toContain('ap-next-line');
    // One validation source for the signup contact fields.
    expect(auth).not.toContain('checkContact(');
  });

  it('the free account offer in structured data points at an indexable page, not the noindex /check', () => {
    const source = read('scripts/public-render-entry.tsx');
    expect(source).toContain("name:'Free account',price:'0',priceCurrency:'USD',url:siteOrigin+'/onboarding'");
    expect(source).not.toContain("url:siteOrigin+'/check'");
  });

  it('the one-time passes stay reachable from a real disclosure (keyboard and screen reader): summary, buy links and prices live in one details element', () => {
    render(wrap(<SubscriptionPricing />));
    const summary = screen.getByText('Prefer a one-off? See one-time passes').closest('summary')!;
    expect(summary).not.toBeNull();
    const details = summary.closest('details')!;
    expect(details.tagName).toBe('DETAILS');
    expect(within(details).getAllByRole('link', { name: /Sign in to buy/ })).toHaveLength(3);
    expect(summary).toHaveTextContent('$9');
    expect(summary).toHaveTextContent('$39');
  });

  it('pricing opens with a free path: a "Start free" link to onboarding beside the free-account line', () => {
    render(wrap(<ProductPage kind="pricing" />));
    const hero = document.querySelector('.jv-page-head')!;
    expect(within(hero as HTMLElement).getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/onboarding');
  });

  it('the help hero has one primary action (Start my search) and one text link', () => {
    render(wrap(<HelpCenter />));
    const actions = document.querySelector('.hc-hero-actions')! as HTMLElement;
    expect(within(actions).getAllByRole('link')).toHaveLength(2);
    expect(within(actions).getByRole('link', { name: 'Start my search' })).toHaveClass('jv-btn--primary');
  });

  it('the type scale is one rhythm: 14 and 16 replace the 13 and 15 steps, and the page title is whole pixels', () => {
    const index = css('index.css');
    expect(index).toMatch(/--t-sm: \.875rem;/);
    expect(index).toMatch(/--t-body-sm: 1rem;/);
    expect(index).not.toMatch(/--t-(?:h2|h3|h4|lead): clamp/);
    const marketing = css('styles/marketing.css');
    expect(marketing).toMatch(/--t-page: 3\.75rem;/);
    expect(marketing).toMatch(/--t-page-band: 2rem;/);
  });

  it('focus on dark panels uses the mint ring, stronger than every page-scoped rule', () => {
    expect(css('styles/marketing.css')).toContain(':root .jv-dark :is(a, button, summary, input, select, textarea):focus-visible { outline-color: var(--jv-on-dark-link); }');
  });

  it('the footer wordmark ends in the round lime dot of the header lockup, and legal links share one colour', () => {
    const marketing = css('styles/marketing.css');
    expect(marketing).toMatch(/\.jv-footer-mark > span::after \{ content: ""; display: inline-block;[^}]*border-radius: 50%;[^}]*var\(--jv-signal\)/);
    expect(marketing).toContain(':root :is(.jv-footer-bottom nav a, .jv-footer-col a):is(:link, :visited) { color: var(--jv-ink-2); }');
  });

  it('there is one toggle: every disclosure draws the same 32px circle', () => {
    expect(css('styles/marketing.css')).toContain('.hc-topic > details, .hc-contents details, .pricing-passes-disclosure) > summary::after { content: ""; display: block; flex-shrink: 0; width: 32px; height: 32px;');
  });

  it('plan cards share one row grid so lists and buttons align', () => {
    expect(css('styles/marketing.css')).toContain(':root .product-proposed-grid > .pricing-card { display: grid; grid-template-rows: subgrid; grid-row: span 7;');
  });

  it('the FAQ hero card jumps to topics instead of repeating the question list, and guide cards use one chip treatment', () => {
    expect(css('pages/CareerGuides.css')).not.toContain('--cg-tint: var(--jv-brand-glyph)');
    render(wrap(<ProductPage kind="faq" />));
    expect(screen.getByRole('complementary', { name: 'Jump to a topic' })).toBeInTheDocument();
  });

  it('the signed-in surfaces use tokens, so the green after sign-up is the same green', () => {
    for (const file of ['pages/Workspace.css', 'pages/ApplicationsHome.css']) expect(css(file)).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it('the trust row never puts a tailored CV for each role beside the free account', () => {
    const note = read('src/components/marketing/PriceNote.tsx');
    expect(note).toContain('3 tailored CVs a month, free');
    expect(note).not.toContain('Tailored CV for each role');
  });
});

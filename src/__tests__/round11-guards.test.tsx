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
import MvpFooter from '@/components/layout/MvpFooter';
import { staticPageMeta } from '@/lib/public-site-meta';

afterEach(cleanup);
const css = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8');

describe('round 11 guards', () => {
  it('pricing shows its currency control on the page and three points in every plan card, with plans and prices unchanged', () => {
    render(<MemoryRouter><SubscriptionPricing /></MemoryRouter>);
    const proposals = screen.getByRole('region', { name: 'Automated Job Loop monthly plans' });
    const control = within(proposals).getByRole('link', { name: 'Change country or currency' });
    expect(control).toHaveAttribute('href', '#billing-details');
    expect(proposals).toHaveTextContent('Prices in USD.');
    for (const list of within(proposals).getAllByRole('list', { name: /includes$/ })) expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    for (const price of ['$29', '$59', '$99']) expect(proposals).toHaveTextContent(price);
    expect(document.getElementById('billing-details')).not.toBeNull();
  });

  it('closing headings carry no accent phrase on any page (one rule)', () => {
    for (const kind of ['faq', 'about', 'how', 'contact'] as const) {
      const { container, unmount } = render(<HelmetProvider><MemoryRouter><ProductPage kind={kind} /></MemoryRouter></HelmetProvider>);
      expect(container.querySelector('.jv-cta h2 .jv-h-signal')).toBeNull();
      unmount();
    }
  });

  it('the FAQ opens on a topic-jump card (themes, not a repeat of the question list) whose links open their answers', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="faq" /></MemoryRouter></HelmetProvider>);
    const card = screen.getByRole('complementary', { name: 'Jump to a topic' });
    expect(within(card).getAllByRole('link')).toHaveLength(5);
    expect(within(card).getAllByRole('link')[0]).toHaveAttribute('href', '#faq-0');
    // No question text is printed twice.
    for (const link of within(card).getAllByRole('link')) expect(link.textContent).not.toMatch(/\?$/);
    expect(document.getElementById('faq-0')).toBeInstanceOf(HTMLDetailsElement);
  });

  it('the footer has five balanced columns of three links', () => {
    render(<MemoryRouter><MvpFooter /></MemoryRouter>);
    for (const group of screen.getAllByRole('group')) expect(within(group).getAllByRole('link')).toHaveLength(3);
  });

  it('home and Automated Job Loop descriptions follow the hero wording and make no absolute claim', () => {
    for (const path of ['/', '/job-loop']) {
      const meta = staticPageMeta(path)!;
      expect(meta.description).toMatch(/best-matching jobs/);
      expect(meta.description).not.toMatch(/guarantee/i);
    }
  });

  it('H1 size is capped by the viewport so the product name always fits, and tracking comes from tokens', () => {
    const marketing = css('styles/marketing.css');
    expect(marketing).toMatch(/--t-page: 2\.25rem;/);
    expect(marketing).toMatch(/@media \(max-width: 379px\) \{ :root \{ --t-page: min\(2\.25rem, calc\(\(100vw - 2 \* var\(--gutter\)\) \/ 9\.4\)\)/);
    expect(css('index.css')).toMatch(/--ls-h2: -\.03em/);
    for (const file of ['styles/marketing.css', 'pages/Home.css', 'pages/ProductPage.css']) expect(css(file)).not.toMatch(/letter-spacing:\s*-\.0(?:2|25|3|35|4)em/);
  });

  it('guide category tints come from the colour tokens', () => {
    const guides = css('pages/CareerGuides.css');
    expect(guides).not.toMatch(/--cg-tint(?:-ink)?:\s*#/i);
    expect(guides).not.toMatch(/existing tokens only[^*]*#/i);
  });

  it('the walkthrough keyboard hint is visually hidden on touch and phones but stays described', () => {
    expect(css('styles/marketing.css')).toMatch(/\(pointer: coarse\), \(max-width: 767px\)[^}]*#wt-keyboard-help \{[^}]*clip: rect\(0 0 0 0\)/);
  });

  it('/check is not in the sitemap and is prerendered noindex', () => {
    expect(readFileSync(resolve(__dirname, '../../public/sitemap.xml'), 'utf8')).not.toContain('/check<');
    expect(readFileSync(resolve(__dirname, '../../scripts/prerender-public-pages.mjs'), 'utf8')).toMatch(/page\.kind==='check'\?'<meta name="robots" content="noindex,follow"\/>'/);
  });
});

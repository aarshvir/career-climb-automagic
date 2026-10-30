import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PriceNote from '@/components/marketing/PriceNote';
import { productFaqs } from '@/lib/product-faqs';
import { staticPageMeta } from '@/lib/public-site-meta';
import { passPlans } from '@/lib/pass-plans';

vi.unmock('react-router-dom');
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import SubscriptionPricing from '@/pages/SubscriptionPricing';

afterEach(cleanup);
const css = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8');

describe('round 9 conversion copy', () => {
  it('shows one reassurance row of three facts and never mentions "pass" before it is explained', () => {
    const { container } = render(<PriceNote />);
    const facts = Array.from(container.querySelectorAll('.jv-meta-in > span')).map(node => node.textContent);
    expect(facts).toEqual(['Free to start', '3 tailored CVs a month, free', 'Plans from $29/month']);
  });
  it('keeps the FAQ description and the visible questions in step', () => {
    const description = staticPageMeta('/faq')!.description;
    expect(description).toMatch(/optional saving/);
    expect(description).toMatch(/model consent/);
    const questions = productFaqs.map(([question]) => question);
    expect(questions).toContain('Is my CV saved?');
    expect(questions).toContain('Does an AI model see my CV?');
  });
  it('puts each pass allowance and validity in the collapsed pass summary', () => {
    render(<MemoryRouter><SubscriptionPricing /></MemoryRouter>);
    const prices = screen.getByLabelText('One-time pass prices');
    for (const plan of passPlans) expect(within(prices).getByText(new RegExp(`${plan.name} · ${plan.tailoredCvs} CVs · ${plan.days} days`))).toBeInTheDocument();
  });
  it('asks the pricing FAQ the two most common questions first', () => {
    render(<MemoryRouter><SubscriptionPricing /></MemoryRouter>);
    const questions = Array.from(document.querySelectorAll('.pricing-faq summary > span:first-child')).map(node => node.textContent);
    expect(questions.slice(0, 2)).toEqual(['What stays free?', 'What counts as a tailored CV?']);
  });
});

describe('round 9 design guards', () => {
  it('keeps the product name unbroken on 360px and wider phones', () => {
    expect(css('styles/marketing.css')).toMatch(/@media \(max-width: 359px\) \{ \.jv-nb, \.jv-prod \{ white-space: normal; \}/);
    expect(css('styles/marketing.css')).not.toMatch(/product-page--how \.jv-page-title \.jv-nb \{ white-space: normal/);
  });
  it('ends the frame rails at the closing band and draws the footer wordmark without text', () => {
    const marketing = css('styles/marketing.css');
    expect(marketing).toMatch(/bottom: var\(--rail-bottom\)/);
    expect(marketing).toMatch(/\.jv-footer-mark > span::before \{ content: "jobvance"; \}/);
  });
  it('uses one ink channel for shadows and an icon stroke token', () => {
    const index = css('index.css');
    expect(index).toMatch(/--jv-ink-rgb: 15 29 23/);
    expect(index).not.toMatch(/rgb\(15 29 23 \//);
    expect(index).toMatch(/--icon-stroke: 1\.75/);
  });
});

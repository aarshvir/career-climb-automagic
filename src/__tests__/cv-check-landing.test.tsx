import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CvCheckLanding from '@/pages/CvCheckLanding';
import { EXAMPLE_AD, EXAMPLE_CV } from '@/lib/cv-check-example';
import { analyzeCvEvidence } from '@/lib/cv-evidence';
import { MAX_CV_BYTES } from '@/lib/cv-extraction';
import { evidenceStatusLabels } from '@/lib/evidence-labels';
import { cvCheckCostText, cvCheckFaqs } from '@/lib/cv-check-faqs';
import { passPlans, FREE_TAILORED_CVS_PER_MONTH } from '@/lib/pass-plans';
import { cvCheckStructuredNodes } from '@/lib/cv-check-structured-data';

vi.unmock('react-router-dom');
afterEach(cleanup);
const renderPage = () => render(<HelmetProvider><MemoryRouter initialEntries={['/cv-check']}><CvCheckLanding /></MemoryRouter></HelmetProvider>);

describe('public CV Check page', () => {
  it('has one h1, starts the check at /check, and states the account requirement beside "free"', () => {
    renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check your CV against a job ad, requirement by requirement');
    for (const link of screen.getAllByRole('link', { name: /Start the free CV check/ })) expect(link).toHaveAttribute('href', '/check');
    expect(screen.getByText(/You need a free Jobvance account to open the check\./)).toBeInTheDocument();
  });

  it('shows what the real engine returns for the invented example, never typed-in outcomes', () => {
    renderPage();
    const report = analyzeCvEvidence(EXAMPLE_CV, EXAMPLE_AD);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(report.requirements.length);
    report.requirements.forEach((requirement, index) => {
      expect(rows[index]).toHaveTextContent(requirement.vacancyQuote);
      expect(rows[index]).toHaveTextContent(evidenceStatusLabels[requirement.status]);
    });
    expect(new Set(report.requirements.map(requirement => requirement.status))).toEqual(new Set(['direct', 'partial', 'missing', 'review']));
    expect(screen.getByText('Invented example for illustration. Not a customer result.')).toBeInTheDocument();
  });

  it('keeps its prices, limits and file size in step with the product', () => {
    renderPage();
    expect(cvCheckCostText).toContain(`${FREE_TAILORED_CVS_PER_MONTH} AI-tailored CVs a month`);
    for (const plan of passPlans) expect(cvCheckCostText).toContain(`$${plan.price} (${plan.name}, ${plan.tailoredCvs} CVs over ${plan.days} days)`);
    expect(MAX_CV_BYTES).toBe(5 * 1024 * 1024);
    expect(document.body).toHaveTextContent('up to 5 MB');
  });

  it('prints every FAQ answer, and the FAQPage data says exactly the same', () => {
    renderPage();
    for (const [question, answer] of cvCheckFaqs) {
      expect(screen.getByText(question)).toBeInTheDocument();
      expect(screen.getByText(answer)).toBeInTheDocument();
    }
    const nodes = cvCheckStructuredNodes('https://jobvance.io') as Record<string, unknown>[];
    const faq = nodes.find(node => node['@type'] === 'FAQPage') as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(faq.mainEntity.map(item => [item.name, item.acceptedAnswer.text])).toEqual(cvCheckFaqs);
  });

  it('claims no ratings, reviews, user counts or outcomes in its structured data or text', () => {
    const json = JSON.stringify(cvCheckStructuredNodes('https://jobvance.io'));
    expect(json).not.toMatch(/aggregateRating|"review"|ratingValue|award/);
    renderPage();
    expect(document.body.textContent ?? '').not.toMatch(/cannot invent|no sign-?up|without an account|ATS match|\b\d+\s*%|users|reviews from/i);
  });
});

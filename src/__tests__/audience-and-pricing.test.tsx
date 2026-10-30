import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankLoopProfile, loopAudienceContent } from '@/lib/job-loop-audiences';
vi.unmock('react-router-dom');
const account = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: account.user }) }));
import AudienceLanding from '@/pages/AudienceLanding';
import SubscriptionPricing from '@/pages/SubscriptionPricing';
import ProductPage from '@/pages/ProductPage';
import type { LoopAudience } from '../../supabase/functions/_shared/job-loop-types';

function page(audience: LoopAudience) { return <HelmetProvider><MemoryRouter><AudienceLanding audience={audience} /></MemoryRouter></HelmetProvider>; }
beforeEach(() => { account.user = null; });
afterEach(cleanup);

describe('audience entry points', () => {
  it.each(['student', 'mba', 'professional'] as const)('offers first value without sign-in for %s', audience => {
    render(page(audience));
    // Destinations match the live site: the hero leads with the check the page describes.
    expect(screen.getByRole('link', { name: 'Check my CV against a job' })).toHaveAttribute('href', `/check?audience=${audience}`);
    expect(screen.getByRole('link', { name: /See how the Automated Job Loop works/ })).toHaveAttribute('href', '/job-loop');
    expect(screen.getByRole('link', { name: /Sign in to save my experience/ })).toHaveAttribute('href', `/auth?next=${encodeURIComponent(`/loop?audience=${audience}`)}`);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(loopAudienceContent[audience].title);
    expect(screen.getByText('Example application')).toBeInTheDocument();
  });
  it('opens the selected private setup for a signed-in candidate', () => {
    account.user = { id: 'fictional-owner' }; render(page('professional'));
    expect(screen.getByRole('link', { name: 'Open my saved applications' })).toHaveAttribute('href', '/loop?audience=professional');
  });
  it('uses editable preferences without inferring employment years, titles or claims', () => {
    for (const audience of ['student','mba','professional'] as const) {
      const profile = blankLoopProfile(audience);
      expect(profile.audience).toBe(audience); expect(profile.experienceYears).toBeNull(); expect(profile.name).toBe('');
      expect(profile.targetTitles).toEqual([]); expect(profile.sourceText).toBe('');
    }
    expect(blankLoopProfile('professional')).toMatchObject({ pageTarget: 2, discreetSearch: true });
    expect(blankLoopProfile('student')).toMatchObject({ pageTarget: 1, discreetSearch: false });
  });
});

describe('current offer', () => {
  it('starts free and offers only the three one-time passes, never the legacy pack or a subscription', () => {
    render(<MemoryRouter><SubscriptionPricing /></MemoryRouter>);
    const passes = screen.getByRole('region', { name: /AI CV tailoring/ });
    expect(within(passes).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Free', 'Sprint', 'Job Search', 'Career Move']);
    expect(within(passes).getByRole('link', { name: 'Check my CV' })).toHaveAttribute('href', '/check');
    expect(within(passes).queryByText(/\$15|\$29|ten application packs|per month, billed|cancel anytime|free trial/i)).not.toBeInTheDocument();
    expect(screen.getByText('One-time payment. No subscription, nothing renews.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('states the new free allowance everywhere the old beta line was', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="pricing" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByText('Choose how often your Automated Job Loop runs. Plans from $29/month, with a free account to start.')).toBeInTheDocument();
    expect(screen.queryByText(/2 tailored CVs a day|8 when signed in/i)).not.toBeInTheDocument();
  });
  it('names Dodo Payments as merchant of record and publishes the refund promise', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="privacy" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByRole('heading', { name: 'Payments' }).nextElementSibling).toHaveTextContent(/Dodo Payments, which acts as our merchant of record and payment processor/);
    expect(screen.queryByText(/Paddle or Stripe/)).not.toBeInTheDocument();
    cleanup();
    render(<HelmetProvider><MemoryRouter><ProductPage kind="refund" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByRole('heading', { name: '7-day money-back promise' }).nextElementSibling).toHaveTextContent(/within 7 days of buying it.*fewer than 5 tailored CVs/);
    expect(screen.getByRole('heading', { name: 'What a refund does' }).nextElementSibling).toHaveTextContent(/stops working straight away.*partial refund/);
    cleanup();
    render(<HelmetProvider><MemoryRouter><ProductPage kind="terms" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByRole('heading', { name: 'Passes' }).nextElementSibling).toHaveTextContent(/Sprint \(\$9, 7 days, 25 AI-tailored CVs\).*Nothing renews/);
    expect(screen.queryByText(/No paid plan is currently offered for sale/)).not.toBeInTheDocument();
  });
});

describe('Automated Job Loop access and monthly plans', () => {
  it('leads with monthly Automated Job Loop and requires an account before checking purchase availability', () => {
    render(<MemoryRouter><SubscriptionPricing /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Pick your pace, then start.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start my search' })).toHaveAttribute('href', '/onboarding');
    expect(screen.getByRole('link', { name: 'Check my CV' })).toHaveAttribute('href', '/check');
    expect(screen.queryByText(/beta|ten accounts|no account needed/i)).not.toBeInTheDocument();
    const proposals = screen.getByRole('region', { name: 'Automated Job Loop monthly plans' });
    expect(proposals).toHaveTextContent('No trial or subscription starts automatically');
    expect(proposals).toHaveTextContent('billed every month until you cancel');
    for (const price of ['$29', '$59', '$99']) expect(proposals).toHaveTextContent(price);
    expect(within(proposals).getAllByText('USD / month')).toHaveLength(3);
    expect(proposals).toHaveTextContent('1 Automated Job Loop run a week');
    expect(proposals).toHaveTextContent('3 Automated Job Loop runs a week');
    expect(proposals).toHaveTextContent('1 Automated Job Loop run a day');
    expect(within(proposals).getByRole('link',{name:'Start with Starter'})).toHaveAttribute('href','/auth?next=%2Fpricing%3FloopPlan%3Dweekly%26country%3DUS%26currency%3DUSD');
    expect(within(proposals).queryByRole('button')).not.toBeInTheDocument();
    expect(proposals).toHaveTextContent('does not cancel subscription billing');
  });
});

describe('Automated Job Loop first homepage', () => {
  it('explains the ordered search journey and offers a separate neutral CV Check entry', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="home" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Jobvance automates your job search end to end.');
    const stages = within(screen.getByRole('list', { name: 'Your Automated Job Loop journey' })).getAllByRole('listitem');
    expect(stages).toHaveLength(3);
    expect(stages[0]).toHaveTextContent('Add your experience');
    expect(stages[0]).toHaveTextContent('build your first CV from guided questions');
    expect(stages[1]).toHaveTextContent('Choose your search');
    expect(stages[1]).toHaveTextContent('roles and locations');
    expect(stages[2]).toHaveTextContent('Review your dashboard');
    expect(stages[2]).toHaveTextContent('tailored CV for each');
    // Short actions sit under headings that name the product; the final call to action keeps the full name.
    expect(screen.getByText('Automated Job Loop', { selector: '.jv-hero-eyebrow' })).toBeInTheDocument();
    expect(screen.getByText('How Automated Job Loop works')).toBeInTheDocument();
    const starts = screen.getAllByRole('link', { name: 'Start my search' });
    expect(starts).toHaveLength(3);
    for (const link of starts) expect(link).toHaveAttribute('href', '/onboarding');
    expect(screen.getByRole('link', { name: /Try the free CV Check/ })).toHaveAttribute('href', '/check');
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).not.toContain('audience=');
    expect(screen.getByText(/runs in the background and finds the best-matching jobs/, { selector: '.jv-hero-lead' })).toHaveTextContent('Choose your roles and locations once');
    expect(screen.getByText(/Each run looks through connected sources/)).toHaveTextContent('Some runs may find nothing new');
  });
});

describe('published draft privacy guidance', () => {
  it('links the concise guest privacy explanation to the full storage choices', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="home" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByRole('link', { name: 'How your CV is handled' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByText(/^Tailored, role-specific CVs/)).toHaveTextContent('built for a high ATS match');
  });
  it('publishes the consented tab-storage exposure and requires renewed approval after restoration', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="privacy" /></MemoryRouter></HelmetProvider>);
    const paragraph = screen.getByRole('heading', { name: 'Optional refresh recovery' }).nextElementSibling;
    expect(paragraph).toHaveTextContent(/Anyone using the same browser tab may access this copy/);
    expect(paragraph).toHaveTextContent(/Restoring a draft clears its approval/);
    expect(paragraph).toHaveTextContent(/does not save the check to your account/);
    const models = screen.getByRole('heading', { name: 'Optional models and search' }).nextElementSibling;
    expect(models).toHaveTextContent('comparison without AI runs on your device');
    expect(models).toHaveTextContent('AI tailoring sends your CV and vacancy text');
    const local = screen.getByRole('heading', { name: 'Your free check' }).nextElementSibling;
    expect(local).toHaveTextContent(/Without optional tab-storage permission, refreshing or closing the tab clears the draft/);
  });
});

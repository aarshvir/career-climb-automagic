import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    const start = screen.getByRole('link', { name: 'Check my CV against a job' });
    expect(start).toHaveAttribute('href', `/check?audience=${audience}`);
    expect(screen.getByRole('link', { name: /See how Job Loop works/ })).toHaveAttribute('href', '/job-loop');
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
    expect(screen.getAllByRole('heading', { level: 2 }).slice(0, 4).map(heading => heading.textContent)).toEqual(['Free', 'Sprint', 'Job Search', 'Career Move']);
    expect(screen.getByRole('link', { name: /Check my CV against a job/ })).toHaveAttribute('href', '/check');
    expect(screen.queryByText(/\$15|\$29|ten application packs|per month, billed|cancel anytime|free trial/i)).not.toBeInTheDocument();
    expect(screen.getByText('One-time payment. No subscription, nothing renews.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('states the new free allowance everywhere the old beta line was', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="home" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByText('Free to start: 3 tailored CVs a month. Passes from $9, one-time.')).toBeInTheDocument();
    expect(screen.queryByText(/free while in beta/i)).not.toBeInTheDocument();
    cleanup();
    render(<HelmetProvider><MemoryRouter><ProductPage kind="pricing" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByText('Free to start: 3 tailored CVs a month. Passes from $9, one-time.')).toBeInTheDocument();
    expect(screen.queryByText(/2 tailored CVs a day|8 when signed in|during beta/i)).not.toBeInTheDocument();
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

describe('neutral homepage start', () => {
  it('changes the visible example without changing any check destination or requiring an audience setup', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="home" /></MemoryRouter></HelmetProvider>);
    const examples = screen.getByRole('group', { name: 'Compare examples' });
    const expectedExamples = [
      ['Project experience', 'Graduate data analyst'],
      ['Career change', 'Business analyst'],
      ['Work experience', 'Operations analyst'],
    ];
    for (const [label, role] of expectedExamples) {
      fireEvent.click(within(examples).getByRole('button', { name: label }));
      expect(within(examples).getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('heading', { name: role })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('This changes the example only; everyone starts with the same CV check.');
      const starts = screen.getAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('/check'));
      expect(starts.length).toBeGreaterThan(0);
      for (const start of starts) expect(start).toHaveAttribute('href', '/check');
    }
    expect(screen.getByText(/There is no separate student or professional setup to choose/)).toBeInTheDocument();
    expect(screen.getByText(/Start with your CV or choose a saved CV check/)).toBeInTheDocument();
  });
});

describe('published draft privacy guidance', () => {
  it('links the concise guest privacy explanation to the full storage choices', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="home" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByRole('link', { name: 'How your CV is handled' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByText(/Your free check runs on your device/)).toHaveTextContent(/Sign in when you want to save an approved version privately/);
  });
  it('publishes the consented tab-storage exposure and requires renewed approval after restoration', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="privacy" /></MemoryRouter></HelmetProvider>);
    const paragraph = screen.getByRole('heading', { name: 'Optional refresh recovery' }).nextElementSibling;
    expect(paragraph).toHaveTextContent(/Anyone using the same browser tab may access this copy/);
    expect(paragraph).toHaveTextContent(/Restoring a draft clears its approval/);
    expect(paragraph).toHaveTextContent(/does not save the check to your account/);
    const local = screen.getByRole('heading', { name: 'Your free check' }).nextElementSibling;
    expect(local).toHaveTextContent(/Without optional tab-storage permission, refreshing or closing the tab clears the draft/);
  });
});

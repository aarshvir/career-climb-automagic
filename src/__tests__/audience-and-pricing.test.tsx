import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankLoopProfile, loopAudienceContent } from '@/lib/job-loop-audiences';
import { subscriptionPlans } from '@/lib/subscription-plans';
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
    const start = screen.getByRole('link', { name: 'Check my CV for free' });
    expect(start).toHaveAttribute('href', `/check?audience=${audience}`);
    expect(screen.getByRole('link', { name: /See how Job Loop works/ })).toHaveAttribute('href', '/job-loop');
    expect(screen.getByRole('link', { name: /Build my career record/ })).toHaveAttribute('href', `/auth?next=${encodeURIComponent(`/loop?audience=${audience}`)}`);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(loopAudienceContent[audience].title);
    expect(screen.getByText('Fictional illustration')).toBeInTheDocument();
  });
  it('opens the selected private setup for a signed-in candidate', () => {
    account.user = { id: 'fictional-owner' }; render(page('professional'));
    expect(screen.getByRole('link', { name: 'Open my Job Loop' })).toHaveAttribute('href', '/loop?audience=professional');
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

describe('free pilot and proposed subscriptions', () => {
  it('shows separate free and proposed tiers without enabling a purchase', () => {
    render(<MemoryRouter><SubscriptionPricing /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Free Starter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Focus' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Job Loop' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Checkout not available' })).toHaveLength(2);
    for (const button of screen.getAllByRole('button', { name: 'Checkout not available' })) expect(button).toBeDisabled();
    expect(screen.getByText(/No card, charge or automatic conversion/)).toBeInTheDocument();
    expect(subscriptionPlans.every(plan => plan.billing === false)).toBe(true);
    expect(screen.queryByRole('link', { name: /buy|subscribe|pay/i })).not.toBeInTheDocument();
  });
});

describe('published draft privacy guidance', () => {
  it('explains that guest refresh recovery needs permission and is separate from account saving', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="home" /></MemoryRouter></HelmetProvider>);
    const guidance = screen.getByText(/Your unsaved check can return when you visit another page/);
    expect(guidance).toHaveTextContent(/Refresh recovery requires your permission/);
    expect(guidance).toHaveTextContent(/30 minutes after your last change/);
    expect(guidance).toHaveTextContent(/Without that permission, refreshing clears the draft/);
    expect(guidance).toHaveTextContent(/Account saving is a separate choice/);
    expect(screen.queryByText(/Unsaved checks are held in memory and cleared when the page closes or refreshes/)).not.toBeInTheDocument();
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

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
import type { LoopAudience } from '../../supabase/functions/_shared/job-loop-types';

function page(audience: LoopAudience) { return <HelmetProvider><MemoryRouter><AudienceLanding audience={audience} /></MemoryRouter></HelmetProvider>; }
beforeEach(() => { account.user = null; });
afterEach(cleanup);

describe('audience entry points', () => {
  it.each(['student', 'mba', 'professional'] as const)('carries %s through sign-in without creating a factual profile', audience => {
    render(page(audience));
    const start = screen.getByRole('link', { name: 'Start my free Job Loop' });
    expect(start).toHaveAttribute('href', `/auth?next=${encodeURIComponent(`/loop?audience=${audience}`)}`);
    expect(screen.getByRole('link', { name: /Try one CV check/ })).toHaveAttribute('href', `/check?audience=${audience}`);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(loopAudienceContent[audience].title);
    expect(screen.getByText('Fictional illustration')).toBeInTheDocument();
  });
  it('opens the selected private setup for a signed-in candidate', () => {
    account.user = { id: 'fictional-owner' }; render(page('professional'));
    expect(screen.getByRole('link', { name: 'Start my free Job Loop' })).toHaveAttribute('href', '/loop?audience=professional');
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

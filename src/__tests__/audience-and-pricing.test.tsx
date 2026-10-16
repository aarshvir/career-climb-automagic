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

describe('Job Loop access and proposed plans', () => {
  it('keeps current free access separate from unavailable monthly proposals', () => {
    render(<MemoryRouter><SubscriptionPricing /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Start your Job Loop' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start my Job Loop' })).toHaveAttribute('href', '/loop');
    expect(screen.getByRole('link', { name: 'Check my CV against a job' })).toHaveAttribute('href', '/check');
    expect(screen.getByText(/Cloud preparation is limited to ten accounts/)).toBeInTheDocument();
    const proposals = screen.getByRole('region', { name: 'Planned monthly subscriptions' });
    expect(proposals).toHaveTextContent('not available to buy');
    expect(proposals).toHaveTextContent('the free beta does not include these paid allowances');
    for (const price of ['$29', '$59', '$99']) expect(proposals).toHaveTextContent(price);
    expect(within(proposals).getAllByText('USD / month')).toHaveLength(3);
    expect(proposals).toHaveTextContent('1 Job Loop run a week');
    expect(proposals).toHaveTextContent('3 Job Loop runs a week');
    expect(proposals).toHaveTextContent('1 Job Loop run a day');
    expect(within(proposals).queryByRole('link')).not.toBeInTheDocument();
    expect(within(proposals).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/does not become a paid subscription automatically/)).toBeInTheDocument();
  });
});

describe('Job Loop first homepage', () => {
  it('explains the ordered search journey and offers a separate neutral CV Check entry', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="home" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Automate your job search.');
    const stages = within(screen.getByRole('list', { name: 'Your Job Loop journey' })).getAllByRole('listitem');
    expect(stages).toHaveLength(3);
    expect(stages[0]).toHaveTextContent('Add your experience');
    expect(stages[0]).toHaveTextContent('build your first CV from guided questions');
    expect(stages[1]).toHaveTextContent('Choose your search');
    expect(stages[1]).toHaveTextContent('roles and locations');
    expect(stages[2]).toHaveTextContent('Review your dashboard');
    expect(stages[2]).toHaveTextContent('approve your documents');
    for (const link of screen.getAllByRole('link', { name: 'Start my Job Loop' })) expect(link).toHaveAttribute('href', '/loop');
    expect(screen.getByRole('link', { name: /Try a free CV check/ })).toHaveAttribute('href', '/check');
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).not.toContain('audience=');
    expect(screen.getByText(/Scheduled runs use rules-based preparation/)).toHaveTextContent('AI preparation needs your consent for each run');
    expect(screen.getByText(/Broad web search and inbox access are not currently connected/)).toBeInTheDocument();
  });
});

describe('published draft privacy guidance', () => {
  it('links the concise guest privacy explanation to the full storage choices', () => {
    render(<HelmetProvider><MemoryRouter><ProductPage kind="home" /></MemoryRouter></HelmetProvider>);
    expect(screen.getByRole('link', { name: 'How your CV is handled' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByText(/Review the experience and vacancy you want to reuse before saving/)).toHaveTextContent('You approve each document');
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

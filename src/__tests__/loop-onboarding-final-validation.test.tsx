import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LoopOnboarding, { onboardingStepError } from '../pages/LoopOnboarding';
import { blankLoopProfile } from '../lib/job-loop-audiences';
import { blankLoopCvAnswers } from '../lib/loop-cv-builder';
import { retainOnboardingDraft } from '../lib/loop-onboarding-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, trackingDraftAuthority } from '../lib/tracking-draft-memory';

vi.unmock('react-router-dom');
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-a' }, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: mock.call, boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));

beforeEach(() => {
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a');
  mock.call.mockReset().mockImplementation(async (_owner, action) => {
    if (action.action === 'get_existing') return { existingState: 'absent' };
    throw new Error('No write or record initialization is permitted for invalid draft text');
  });
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); });

it.each([
  { step: 0, patch: { targetTitles: ['Research\u202a assistant'] }, field: /role/i },
  { step: 1, patch: { locations: ['Bos\u2066ton'] }, field: /location/i },
  { step: 3, patch: { excludedTerms: ['Confidential\u0007 project'] }, field: /private term/i },
])('rejects unsupported text in editable preferences at its own step $step', ({ step, patch, field }) => {
  const profile = { ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Research assistant'], locations: ['Boston'], sourceText: 'Recorded local plant species in a supervised academic project at Example University.', ...patch };
  const before = structuredClone(profile);
  expect(onboardingStepError(step, profile)).toMatch(field);
  expect(onboardingStepError(step, profile)).toMatch(/invisible|unsupported/);
  expect(profile).toEqual(before);
});

it('blocks a recovered final-step draft with unsupported text before any initialization or save RPC', async () => {
  const source = 'Alex Example\nEducation\nRecorded local plant species for a supervised university fieldwork project.\n\u202aExtra source line';
  retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: null }, {
    profile: { ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Research assistant'], locations: ['Boston'], sourceText: source },
    answers: blankLoopCvAnswers(), step: 5, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '',
  });
  render(<MemoryRouter initialEntries={['/onboarding']}><LoopOnboarding /></MemoryRouter>);
  const save = await screen.findByRole('button', { name: 'Save my setup' });
  fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ }));
  fireEvent.click(save);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Line 4.*invisible/));
  expect(mock.call.mock.calls.map(([, action]) => action.action)).toEqual(['get_existing']);
  expect(screen.getByText((_text, element) => element?.tagName === 'PRE' && element.textContent === source)).toBeInTheDocument();
});

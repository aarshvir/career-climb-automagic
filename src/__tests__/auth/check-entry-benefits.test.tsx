import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';

vi.unmock('@/contexts/AuthContext');
vi.unmock('react-router-dom');

const sdk = vi.hoisted(() => ({
  initialize: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(),
  from: vi.fn(), invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  configurationError: null,
  supabase: {
    auth: {
      initialize: sdk.initialize, getSession: sdk.getSession, onAuthStateChange: sdk.onAuthStateChange,
      signInWithOAuth: sdk.signInWithOAuth, signInWithPassword: sdk.signInWithPassword, signUp: sdk.signUp,
      resetPasswordForEmail: sdk.resetPasswordForEmail, updateUser: sdk.updateUser, signOut: sdk.signOut,
    },
    from: sdk.from, functions: { invoke: sdk.invoke },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  sdk.initialize.mockResolvedValue({ error: null });
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: null });
  sdk.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  window.localStorage.clear(); sessionStorage.clear();
});
afterEach(cleanup);

const open = (search: string) => render(<AuthProvider><MemoryRouter initialEntries={[`/auth${search}`]}><Auth /></MemoryRouter></AuthProvider>);

// The free CV Check ad sends visitors to /check, which sends a signed-out visitor to this page.
// The page must describe the CV Check, not the Automated Job Loop's outcome list.
describe('sign-up page reached from the free CV Check ad', () => {
  it('describes the CV Check and its free account, and nothing from the Job Loop outcome list', async () => {
    open('?mode=signup&next=%2Fcheck&utm_source=meta');
    const list = await screen.findByRole('list', { name: 'What the free CV Check does' });
    expect(list).toHaveTextContent('Compare your CV with a job ad.');
    expect(list).toHaveTextContent('With AI, each change sits beside your original.');
    expect(list).toHaveTextContent('You tick that your CV is accurate first.');
    expect(screen.getByText('Your account is free. Compare without AI has no limit. AI tailoring is 3 CVs a month.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'What the Automated Job Loop does' })).not.toBeInTheDocument();
    for (const loopClaim of [/Roles matched to your CV/, /A tailored CV for each role/, /Built for a high ATS match/, /Each run searches/]) {
      expect(screen.queryByText(loopClaim)).not.toBeInTheDocument();
    }
  });

  it('keeps the Job Loop outcome list for the Job Loop entry', async () => {
    open('?mode=signup&next=%2Fonboarding&utm_source=meta');
    expect(await screen.findByRole('list', { name: 'What the Automated Job Loop does' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'What the free CV Check does' })).not.toBeInTheDocument();
  });

  it('shows no explainer on sign-in', async () => {
    open('?next=%2Fcheck');
    await screen.findByText('Sign in to Jobvance');
    expect(screen.queryByRole('list', { name: 'What the free CV Check does' })).not.toBeInTheDocument();
  });
});

import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvCheck from '@/pages/CvCheck';
import RouteNavigation from '@/components/RouteNavigation';
import { passPlans } from '@/lib/pass-plans';
import { clearTrackingDraftMemory } from '@/lib/tracking-draft-memory';
import { clearCheckRecovery } from '@/lib/check-draft';
import { TailorUnavailable } from '@/lib/cv-tailor-api';

// The CV Check allowance notice says "See passes from $9". The link must land on the one-time passes themselves: section open, scrolled to, focused.
// It only opens and moves; it never picks a pass, starts a payment or sends the CV.
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({
  auth: { user: null as null | { id: string; email: string }, loading: false },
  tailor: vi.fn(), preview: vi.fn(), list: vi.fn(), invoke: vi.fn(), open: vi.fn(), scroll: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) }, functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/payment-checkout', () => ({ openPaymentCheckout: mocks.open }));
vi.mock('@/pages/Auth', () => ({ default: () => <div>Optional account form</div> }));
vi.mock('@/lib/free-check-api', () => ({ saveFreeCheck: vi.fn(), listFreeChecks: mocks.list, deleteFreeCheck: vi.fn() }));
vi.mock('@/lib/workspace-api', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/workspace-api')>()), addApplication: vi.fn() }));
vi.mock('@/lib/document-download', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/document-download')>()), downloadBlob: vi.fn() }));
vi.mock('@/lib/document-export', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/document-export')>()), createReviewedPdfPreview: mocks.preview }));
vi.mock('@/lib/cv-tailor-api', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/cv-tailor-api')>()), requestTailoredCv: mocks.tailor }));
import SubscriptionPricing from '@/pages/SubscriptionPricing';

const source = 'Alex Example\nalex@example.com\n\nEXPERIENCE\nAnalyst - Example Co | 2021 - 2024\n- Prepared monthly stakeholder reports using Excel.\n- Supported a transformation pilot across five units.\n\nSKILLS\nExcel, Power BI';
const vacancy = 'Transformation Analyst - Example Bank, Dubai\nResponsibilities\n- Prepare monthly stakeholder reporting.\n- Support transformation programmes.\nRequirements\n- Excel and Power BI.';
const refusal = (code: string) => new TailorUnavailable('You have used your 3 free AI-tailored CVs this month. Passes start at $9 on the Pricing page.', code);
const section = () => document.getElementById('one-time-passes') as HTMLElement | null;
const disclosure = () => document.querySelector('details.pricing-passes-disclosure') as HTMLDetailsElement | null;

function Back() { const navigate = useNavigate(); return <button type="button" onClick={() => navigate(-1)}>Test back</button>; }
function app() {
  return render(<HelmetProvider><MemoryRouter initialEntries={['/check']}>
    <RouteNavigation /><Back />
    <Routes><Route path="/check" element={<CvCheck />} /><Route path="/pricing" element={<SubscriptionPricing />} /></Routes>
  </MemoryRouter></HelmetProvider>);
}
function pricing(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><RouteNavigation /><SubscriptionPricing /></MemoryRouter>);
}
async function reachNotice(code = 'TAILOR_FREE_LIMIT') {
  mocks.tailor.mockRejectedValue(refusal(code));
  app();
  fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: source } });
  fireEvent.change(screen.getByLabelText('The job description'), { target: { value: vacancy } });
  fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
  return screen.findByRole('link', { name: 'See passes from $9' });
}

beforeEach(() => {
  clearTrackingDraftMemory(); clearCheckRecovery(); sessionStorage.clear();
  mocks.auth.user = { id: 'user-1', email: 'alex@example.com' };
  for (const mock of [mocks.tailor, mocks.invoke, mocks.open, mocks.scroll, mocks.preview, mocks.list]) mock.mockReset();
  mocks.list.mockResolvedValue([]);
  mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF'], { type: 'application/pdf' }), pageCount: 1 });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
  Element.prototype.scrollIntoView = mocks.scroll;   // jsdom has no layout; what matters is which element is scrolled to
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => { cleanup(); });

describe('the CV Check "See passes from $9" link', () => {
  it.each(['TAILOR_FREE_LIMIT', 'TAILOR_PASS_DAILY_LIMIT', 'TAILOR_GUEST_LIMIT'])('names the one-time passes section for %s', async code => {
    const link = await reachNotice(code);
    expect(link).toHaveAttribute('href', '/pricing#one-time-passes');
  });

  it('lands on the open passes: section open, scrolled to, focused, prices and buy controls on the page', async () => {
    const link = await reachNotice();
    mocks.scroll.mockClear();
    fireEvent.click(link);
    await waitFor(() => expect(section()).not.toBeNull());
    expect(disclosure()).toHaveAttribute('open');
    await waitFor(() => expect(document.activeElement).toBe(section()));
    expect(mocks.scroll).toHaveBeenCalledTimes(1);
    expect(mocks.scroll.mock.contexts[0]).toBe(section());
    expect(mocks.scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(section()).toHaveAttribute('tabindex', '-1');
    // The section is named for a screen reader, and shows every pass with its price and its own control.
    expect(section()).toHaveAttribute('aria-labelledby', 'passes-title');
    for (const plan of passPlans) {
      expect(screen.getByRole('region', { name: plan.name })).toHaveTextContent(`$${plan.price}`);
      expect(screen.getByRole('button', { name: `Buy ${plan.name}` })).toBeEnabled();
    }
  });

  it('only looks: nothing is picked, no payment or checkout is started, and the tailoring service is not asked again', async () => {
    const link = await reachNotice();
    expect(mocks.tailor).toHaveBeenCalledTimes(1);
    fireEvent.click(link);
    await waitFor(() => expect(section()).not.toBeNull());
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('.pricing-picked, .pricing-tier--picked')).toBeNull();
    expect(screen.queryByText(/You picked the/)).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.tailor).toHaveBeenCalledTimes(1);
    for (const plan of passPlans) expect(screen.getByRole('button', { name: `Buy ${plan.name}` })).not.toHaveAttribute('aria-pressed');
  });

  it('keeps the Back button working: Back returns to the CV Check and the passes are gone', async () => {
    const link = await reachNotice();
    fireEvent.click(link);
    await waitFor(() => expect(section()).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Test back' }));
    await waitFor(() => expect(section()).toBeNull());
    expect(disclosure()).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });
});

describe('the pricing page reads only the one fragment', () => {
  it('stays collapsed on an ordinary visit, and does not scroll or take focus', () => {
    pricing('/pricing');
    expect(disclosure()).not.toHaveAttribute('open');
    expect(mocks.scroll).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it.each(['#other', '#One-Time-Passes', '#one-time-passes-2', '#one-time-pass', '#', '#passes-title'])('stays collapsed for the fragment %s', fragment => {
    pricing(`/pricing${fragment}`);
    expect(disclosure()).not.toHaveAttribute('open');
  });

  it('opens and focuses on a fresh load of the address, signed out, and keeps the sign-in links as they were', async () => {
    mocks.auth.user = null;
    pricing('/pricing#one-time-passes');
    expect(disclosure()).toHaveAttribute('open');
    await waitFor(() => expect(document.activeElement).toBe(section()));
    for (const plan of passPlans) expect(screen.getByRole('link', { name: `Sign in to buy ${plan.name}` })).toHaveAttribute('href', `/auth?next=${encodeURIComponent(`/pricing?plan=${plan.key}`)}`);
    expect(document.querySelector('.pricing-picked, .pricing-tier--picked')).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('keeps the selected-pass return: ?plan= still opens the section, shows the pick, and scrolls to that card, not to the section', async () => {
    const plan = passPlans[1];
    pricing(`/pricing?plan=${plan.key}`);
    expect(disclosure()).toHaveAttribute('open');
    expect(screen.getByRole('status')).toHaveTextContent(`You picked the ${plan.name} pass`);
    expect(document.querySelector('.pricing-tier--picked')).toHaveTextContent(plan.name);
    await waitFor(() => expect(mocks.scroll).toHaveBeenCalled());
    expect(mocks.scroll.mock.contexts.every(context => context !== section())).toBe(true);
  });

  it('keeps the cancelled-checkout return: the section is open with the reassurance and nothing is scrolled', () => {
    pricing('/pricing?checkout=cancelled');
    expect(disclosure()).toHaveAttribute('open');
    expect(screen.getByText('Checkout was cancelled. You have not been charged.')).toBeInTheDocument();
    expect(mocks.scroll).not.toHaveBeenCalled();
  });

  it('keeps the buy path unchanged: a signed-in tap still asks the checkout service for that one pass only', async () => {
    const checkout = { provider: 'dodo', url: 'https://test.checkout.dodopayments.com/session/cks_FixtureSession000001', sessionId: 'cks_FixtureSession000001', billingMode: 'test' };
    mocks.invoke.mockResolvedValue({ data: checkout, error: null });
    pricing('/pricing#one-time-passes');
    expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Buy Sprint' }));
    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(1));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [name, options] = mocks.invoke.mock.calls[0];
    expect(name).toBe('create-checkout');
    expect(options.body).toEqual({ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), plan: passPlans[0].key });
    expect(mocks.open.mock.calls[0][0]).toEqual(checkout);
  });
});

describe('the focus marker on the passes section', () => {
  const css = readFileSync('src/styles/marketing.css', 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: match[2] }));

  it('drops the ring only on the section the link focuses (a position marker, as for the page heading) and leaves the controls inside it their rings', () => {
    const removals = rules.filter(item => /pricing-passes/.test(item.selector) && /outline:\s*none/.test(item.body));
    expect(removals.map(item => item.selector)).toEqual(['.pricing-passes[tabindex="-1"]:focus']);
    expect(rules.some(item => item.selector === '.pricing-passes-disclosure > summary:focus-visible' && /outline:\s*2px solid/.test(item.body))).toBe(true);
  });

  it('only takes effect once focus has been moved there: an ordinary visit never puts a tabindex on the section', () => {
    pricing('/pricing');
    expect(section()).not.toHaveAttribute('tabindex');
  });
});

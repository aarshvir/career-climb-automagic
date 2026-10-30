import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductPage from '@/pages/ProductPage';
import CareerGuides from '@/pages/CareerGuides';
import { staticPageMeta } from '@/lib/public-site-meta';

vi.unmock('react-router-dom');
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null, loading: false, authError: null }) }));
afterEach(cleanup);
const page = (node: React.ReactElement) => render(<HelmetProvider><MemoryRouter>{node}</MemoryRouter></HelmetProvider>);

describe('round 5 accuracy and structure', () => {
  it('describes support storage as optional, not as a promise of human review', () => {
    page(<ProductPage kind="contact" />);
    const note = screen.getByRole('complementary', { name: 'How support works' });
    expect(note).toHaveTextContent('Storing your message is optional');
    expect(note).not.toHaveTextContent(/read by a person/i);
  });
  it('qualifies the privacy at-a-glance claim about files', () => {
    page(<ProductPage kind="privacy" />);
    const note = screen.getByLabelText('Your information at a glance');
    expect(note).toHaveTextContent('The free check runs on your device');
    expect(note).toHaveTextContent('Comparing without AI never uploads your file');
    expect(note).not.toHaveTextContent('Your file stays on your device');
  });
  it('words the free-start block so it is true whether or not free places are open', () => {
    page(<ProductPage kind="pricing" />);
    expect(screen.getByText(/Choose a plan for ongoing automatic runs\./)).toBeInTheDocument();
    expect(screen.queryByText(/Choose a plan when you want searches to run/)).not.toBeInTheDocument();
  });
  it('shows what every plan includes once, and leads each plan card with its run pace', () => {
    page(<ProductPage kind="pricing" />);
    const shared = screen.getByRole('list', { name: 'Every plan includes' });
    expect(within(shared).getByText('Up to 3 saved CV variants')).toBeInTheDocument();
    expect(screen.getAllByText('Up to 3 saved CV variants')).toHaveLength(1);
    expect(screen.getByText('3 runs')).toBeInTheDocument();
  });
  it('keeps the billing notes inside the Billing details disclosure', () => {
    page(<ProductPage kind="pricing" />);
    const details = screen.getByText('Billing details').closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('Payment help and refunds');
    expect(details).toHaveTextContent('billed every month until you cancel');
  });
  it('shows no region label on the US guide library cards', () => {
    page(<CareerGuides />);
    for (const card of document.querySelectorAll('.cg-card-meta span:first-child')) expect(card.textContent).not.toMatch(/UAE/i);
  });
  it('gives the home page a keyword title with the brand suffix inside the 60-character cap', () => {
    const title = staticPageMeta('/')!.title;
    expect(title).toMatch(/\| Jobvance$/);
    expect(title.length).toBeLessThanOrEqual(60);
  });
});

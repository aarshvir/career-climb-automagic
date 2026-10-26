import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
import ProductPage from '@/pages/ProductPage';
import LoopRunMock from '@/components/marketing/LoopRunMock';

const original = { matchMedia: window.matchMedia, IntersectionObserver: (window as { IntersectionObserver?: unknown }).IntersectionObserver };
class FakeObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
function motion(allowed: boolean, observer: boolean) {
  window.matchMedia = ((query: string) => ({ matches: allowed && query.includes('no-preference'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
  if (observer) (window as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
  else delete (window as { IntersectionObserver?: unknown }).IntersectionObserver;
}
const home = () => render(<HelmetProvider><MemoryRouter><ProductPage kind="home" /></MemoryRouter></HelmetProvider>);

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('jv-motion');
  window.matchMedia = original.matchMedia;
  (window as { IntersectionObserver?: unknown }).IntersectionObserver = original.IntersectionObserver;
});

describe('hero mock motion controls (WCAG 2.2.2)', () => {
  it('pauses the example run and reports the pressed state', () => {
    motion(true, true);
    render(<LoopRunMock />);
    const figure = screen.getByRole('figure', { name: 'Example of an Automated Job Loop run' });
    const pause = screen.getByRole('button', { name: 'Pause motion' });
    expect(pause).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pause);
    expect(pause).toHaveAttribute('aria-pressed', 'true');
    expect(figure).toHaveClass('is-paused');
  });
  it('always labels the example as illustrative', () => {
    render(<LoopRunMock />);
    expect(screen.getByRole('figure', { name: 'Example of an Automated Job Loop run' })).toHaveTextContent(/illustrative data/i);
  });
});

describe('scroll reveals stay visible without motion', () => {
  it('turns reveals on only when motion is allowed and IntersectionObserver exists', () => {
    motion(true, true);
    home();
    expect(document.documentElement).toHaveClass('jv-motion');
  });
  it('does not hide content for visitors who prefer reduced motion', () => {
    motion(false, true);
    home();
    expect(document.documentElement).not.toHaveClass('jv-motion');
  });
  it('does not hide content when IntersectionObserver is unavailable', () => {
    motion(true, false);
    home();
    expect(document.documentElement).not.toHaveClass('jv-motion');
  });
});

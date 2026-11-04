import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelmetProvider } from 'react-helmet-async';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import CvCheckLanding from '@/pages/CvCheckLanding';
import TruthfulTailoring from '@/pages/TruthfulTailoring';
import CareerGuides, { CareerGuideArticle } from '@/pages/CareerGuides';

vi.unmock('react-router-dom');
vi.unmock('react-helmet-async');
const originalHead = document.head.innerHTML;
beforeEach(() => { document.head.innerHTML = originalHead; });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 30)); document.head.innerHTML = originalHead; });

function tree(path: string) {
  return <HelmetProvider><MemoryRouter initialEntries={[path]}><nav>
    <Link to="/cv-check">Test CV Check</Link><Link to="/truthful-cv-tailoring">Test tailoring</Link>
    <Link to="/guides/cv-job-description-evidence">Test guide FAQ</Link><Link to="/guides">Test library</Link>
  </nav><Routes>
    <Route path="/cv-check" element={<CvCheckLanding />} /><Route path="/truthful-cv-tailoring" element={<TruthfulTailoring />} />
    <Route path="/guides/:slug" element={<CareerGuideArticle />} /><Route path="/guides" element={<CareerGuides />} />
  </Routes></MemoryRouter></HelmetProvider>;
}
function faqNodes() {
  return [...document.head.querySelectorAll('script[type="application/ld+json"]')]
    .flatMap(script => { const data = JSON.parse(script.textContent!); return data['@graph'] ?? [data]; })
    .filter(node => node['@type'] === 'FAQPage');
}
async function expectLandingFaq(path: string) {
  await waitFor(() => {
    const nodes = faqNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]['@id']).toBe(`https://jobvance.io${path}#faq`);
    const printed = [...document.querySelectorAll('.jv-faq details')].map(item => [
      item.querySelector('summary > span')!.textContent, item.querySelector('p')!.textContent,
    ]);
    expect(nodes[0].mainEntity.map((item: { name: string; acceptedAnswer: { text: string } }) => [item.name, item.acceptedAnswer.text])).toEqual(printed);
    expect(printed.length).toBeGreaterThanOrEqual(7);
  });
}
describe('landing FAQ ownership on ordinary client navigation', () => {
  it('replaces CV Check FAQ with tailoring FAQ and removes it on the guide library', async () => {
    render(tree('/cv-check'));
    await expectLandingFaq('/cv-check');
    fireEvent.click(screen.getByRole('link', { name: 'how AI changes to your CV are checked' }));
    await screen.findByRole('heading', { level: 1, name: 'AI CV tailoring: how the AI’s suggestions are checked' });
    await expectLandingFaq('/truthful-cv-tailoring');
    fireEvent.click(screen.getByRole('link', { name: 'Test library' }));
    await waitFor(() => expect(faqNodes()).toHaveLength(0));
    fireEvent.click(screen.getByRole('link', { name: 'Test CV Check' }));
    await expectLandingFaq('/cv-check');
  });
  it('owns FAQ on direct tailoring entry and transitions between landing and guide FAQ', async () => {
    render(tree('/truthful-cv-tailoring'));
    await expectLandingFaq('/truthful-cv-tailoring');
    fireEvent.click(screen.getByRole('link', { name: 'Test guide FAQ' }));
    await waitFor(() => { expect(faqNodes()).toHaveLength(1); expect(faqNodes()[0]['@id']).toBe('https://jobvance.io/guides/cv-job-description-evidence#faq'); });
    fireEvent.click(screen.getByRole('link', { name: 'Test tailoring' }));
    await expectLandingFaq('/truthful-cv-tailoring');
    fireEvent.click(screen.getByRole('link', { name: 'The free CV Check, requirement by requirement' }));
    await expectLandingFaq('/cv-check');
  });
});


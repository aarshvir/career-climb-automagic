import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoopCvBuilder from '../pages/LoopCvBuilder';
import { blankLoopCvAnswers, type LoopCvAnswers } from '../lib/loop-cv-builder';

const education = 'Studied biology at Example College. Completed a class project recording local plant species.';
const original = 'Original Example\nExisting CV source that must be retained until the candidate deliberately replaces it.';
const answers = { ...blankLoopCvAnswers(), name: 'Alex Example', education };
afterEach(cleanup);

function Harness({ initialSource = '', onUse = vi.fn((_text: string) => true) }: { initialSource?: string; onUse?: (text: string) => boolean }) {
  const [value, setValue] = useState<LoopCvAnswers>(answers), [source, setSource] = useState(initialSource);
  return <><LoopCvBuilder answers={value} onChange={setValue} source={source} disabled={false} onUse={text => { if (!onUse(text)) return false; setSource(text); return true; }} /><output data-testid="source">{source}</output></>;
}

describe('guided CV builder preview and replacement', () => {
  it('requires explicit replacement and can restore the exact previous source draft', () => {
    const use = vi.fn((_text: string) => true); render(<Harness initialSource={original} onUse={use} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    expect(screen.getByRole('button', { name: 'Use this CV draft' })).toBeDisabled();
    expect(use).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Replace my current source CV draft/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this CV draft' }));
    expect(screen.getByTestId('source')).toHaveTextContent('Alex Example');
    fireEvent.click(screen.getByRole('button', { name: 'Undo CV builder replacement' }));
    expect(screen.getByTestId('source').textContent).toBe(original);
    expect(use).toHaveBeenCalledTimes(2);
  });
  it('clears preview and replacement permission after an answer changes', () => {
    render(<Harness initialSource={original} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Replace my current source CV draft/ }));
    fireEvent.change(screen.getByLabelText('What have you studied or trained in?'), { target: { value: education + ' Still studying.' } });
    expect(screen.queryByRole('button', { name: 'Use this CV draft' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    expect(screen.getByRole('checkbox', { name: /Replace my current source CV draft/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Use this CV draft' })).toBeDisabled();
  });
  it('does not adopt a stale preview when an answer changes and use is clicked in one batch', () => {
    const use = vi.fn((_text: string) => true); render(<Harness onUse={use} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    const button = screen.getByRole('button', { name: 'Use this CV draft' });
    act(() => {
      fireEvent.change(screen.getByLabelText('What have you studied or trained in?'), { target: { value: education + ' Still studying.' } });
      fireEvent.click(button);
    });
    expect(use).not.toHaveBeenCalled();
    expect(screen.getByTestId('source')).toBeEmptyDOMElement();
  });
  it('never marks old answers current when change and preview happen in one batch', () => {
    const use = vi.fn((_text: string) => true); render(<Harness onUse={use} />);
    act(() => {
      fireEvent.change(screen.getByLabelText('What have you studied or trained in?'), { target: { value: education + ' Still studying.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    });
    const button = screen.getByRole('button', { name: 'Use this CV draft' });
    fireEvent.click(button);
    expect(use.mock.calls.every(([text]) => text.includes('Still studying.'))).toBe(true);
  });
  it('keeps preview when parent rejects an obsolete owner or generation action', () => {
    const use = vi.fn((_text: string) => false); render(<Harness onUse={use} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this CV draft' }));
    expect(screen.getByTestId('source')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Use this CV draft' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo CV builder replacement' })).not.toBeInTheDocument();
  });
  it('requires a new preview if an outside source replacement happens', () => {
    const use = vi.fn((_text: string) => true), change = vi.fn();
    const view = render(<LoopCvBuilder answers={answers} onChange={change} source={original} disabled={false} onUse={use} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Replace my current source CV draft/ }));
    view.rerender(<LoopCvBuilder answers={answers} onChange={change} source={original + ' Revised.'} disabled={false} onUse={use} />);
    expect(screen.getByRole('button', { name: 'Use this CV draft' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Replace my current source CV draft/ })).not.toBeChecked();
  });
});


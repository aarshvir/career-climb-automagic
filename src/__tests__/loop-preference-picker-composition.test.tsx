import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoopPreferencePicker from '@/components/LoopPreferencePicker';

function Harness({ onChange }: { onChange: (values: string[]) => void }) {
  const [query, setQuery] = useState('');
  const [values, setValues] = useState<string[]>([]);
  return <LoopPreferencePicker id="t" label="Target roles" searchLabel="Search or add a role" values={values} query={query} choices={[]} onQuery={setQuery} description="Pick roles." onChange={next => { setValues(next); onChange(next); }} />;
}
afterEach(cleanup);

describe('LoopPreferencePicker Enter handling', () => {
  it('adds the typed entry on an ordinary Enter and clears the box', () => {
    const changed = vi.fn(); render(<Harness onChange={changed} />);
    const input = screen.getByLabelText('Search or add a role');
    fireEvent.change(input, { target: { value: 'Data analyst' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(changed).toHaveBeenLastCalledWith(['Data analyst']);
    expect(input).toHaveValue('');
  });
  it('does not add or clear while an input method is composing (isComposing)', () => {
    const changed = vi.fn(); render(<Harness onChange={changed} />);
    const input = screen.getByLabelText('Search or add a role');
    fireEvent.change(input, { target: { value: 'Data ana' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13, isComposing: true });
    expect(changed).not.toHaveBeenCalled();
    expect(input).toHaveValue('Data ana');
  });
  it('does not add or clear on the legacy composition key code 229', () => {
    const changed = vi.fn(); render(<Harness onChange={changed} />);
    const input = screen.getByLabelText('Search or add a role');
    fireEvent.change(input, { target: { value: 'Product man' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(changed).not.toHaveBeenCalled();
    expect(input).toHaveValue('Product man');
  });
  it('adds normally once composition has finished', () => {
    const changed = vi.fn(); render(<Harness onChange={changed} />);
    const input = screen.getByLabelText('Search or add a role');
    fireEvent.change(input, { target: { value: 'Product manager' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(['Product manager']);
  });
});

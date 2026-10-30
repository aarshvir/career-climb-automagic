import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Token-pair contrast check (WCAG 2.1 AA). axe cannot evaluate text on gradients and tinted panels, so the pairs the
// site actually uses on light, tinted and forest surfaces are verified against the tokens themselves.
const root = resolve(__dirname, '../..');
const css = ['src/index.css', 'src/styles/marketing.css'].map(file => readFileSync(resolve(root, file), 'utf8')).join('\n');

function token(name: string): string {
  const match = css.match(new RegExp(`${name.replace(/[-]/g, '\\-')}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`Token ${name} not found`);
  return match[1];
}
function luminance(hex: string): number {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function ratio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const white = '#FFFFFF';
// [foreground, background, minimum ratio, where it is used]
const pairs: [string, string, number, string][] = [
  ['--jv-ink', white, 4.5, 'body and headings on white'],
  ['--jv-ink-2', white, 4.5, 'lead and body copy on white'],
  ['--jv-ink-3', white, 4.5, 'captions and meta on white'],
  ['--jv-ink-3', '--jv-bg-subtle', 4.5, 'captions on the neutral panel'],
  ['--jv-ink-3', '--jv-sunken', 4.5, 'captions on chips'],
  ['--jv-ink-2', '--jv-bg-subtle', 4.5, 'body copy on the neutral panel'],
  ['--jv-brand', white, 4.5, 'links and the wordmark period on white'],
  ['--jv-brand', '--jv-bg-subtle', 4.5, 'links on the neutral panel'],
  [white, '--jv-brand', 4.5, 'primary button label'],
  [white, '--jv-brand-hover', 4.5, 'primary button label on hover'],
  ['--jv-brand-ink', '--jv-brand-tint', 4.5, 'status tags and highlights'],
  ['--jv-on-dark-1', '--jv-forest', 4.5, 'headings on forest'],
  ['--jv-on-dark-body', '--jv-forest', 4.5, 'body copy on forest'],
  ['--jv-on-dark-2', '--jv-forest', 4.5, 'secondary copy on forest'],
  ['--jv-on-dark-3', '--jv-forest', 4.5, 'tertiary copy on forest'],
  ['--jv-on-dark-link', '--jv-forest', 4.5, 'links on forest'],
  ['--jv-forest', white, 4.5, 'primary button label on forest (white button)'],
  ['--jv-signal', '--jv-forest', 3, 'lime marker and focus ring on forest'],
  ['--jv-success', '--jv-success-tint', 4.5, 'success text'],
  ['--jv-warn', '--jv-warn-tint', 4.5, 'warning text'],
  ['--jv-danger', '--jv-danger-tint', 4.5, 'error text'],
  ['--jv-line-input', white, 3, 'input borders (non-text 3:1)'],
];

describe('design-token contrast', () => {
  it.each(pairs)('%s on %s reaches %s:1 (%s)', (foreground, background, minimum) => {
    const fg = foreground.startsWith('#') ? foreground : token(foreground);
    const bg = background.startsWith('#') ? background : token(background);
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(minimum);
  });
});

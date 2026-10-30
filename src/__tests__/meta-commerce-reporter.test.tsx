import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const flush = vi.hoisted(() => vi.fn(async (_owner: string, _force?: boolean) => false));
const auth = vi.hoisted(() => ({ user: { id: '11111111-1111-4111-8111-111111111111' } as { id: string } | null }));
vi.unmock('react-router-dom');
vi.mock('@/lib/meta-commerce', () => ({ flushMetaCommerce: flush }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

import MetaCommerceReporter from '@/components/MetaCommerceReporter';

const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><MetaCommerceReporter /></MemoryRouter>);

beforeEach(() => { vi.useFakeTimers(); flush.mockClear(); flush.mockResolvedValue(false); auth.user = { id: '11111111-1111-4111-8111-111111111111' }; });
afterEach(() => { vi.useRealTimers(); });

describe('MetaCommerceReporter', () => {
  it('checks once, a few seconds after an ordinary visit, and not again on later navigation', async () => {
    mount('/loop');
    expect(flush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4000);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(auth.user!.id, false);
    await vi.advanceTimersByTimeAsync(300000);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('checks repeatedly after a return from checkout until Meta has the purchase', async () => {
    flush.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mount('/pricing?loop_checkout=success&payment_id=pay_secret');
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(20000);
    await vi.advanceTimersByTimeAsync(200000);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls.every(call => call[1] === true)).toBe(true);
  });

  it('does nothing for a signed-out visitor, and stops when the page closes', async () => {
    auth.user = null;
    mount('/pricing?loop_checkout=success');
    await vi.advanceTimersByTimeAsync(200000);
    expect(flush).not.toHaveBeenCalled();
    auth.user = { id: '11111111-1111-4111-8111-111111111111' };
    mount('/loop').unmount();
    await vi.advanceTimersByTimeAsync(10000);
    expect(flush).not.toHaveBeenCalled();
  });
});

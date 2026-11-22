import { fireEvent, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * Ticks a purchase-consent checkbox of the monthly billing page and returns only
 * once the page has KEPT the consent.
 *
 * The page deliberately revokes consent whenever its status or price effects
 * re-run. React runs those effects after the commit that shows the checkbox, on
 * a scheduler task, so on a busy runner the first click can land just before
 * them and be dropped. The checkbox then reads unchecked, the button stays
 * disabled and the checkout is never requested. A person would simply tick
 * again, so this ticks again until the consent holds. It asserts the checked
 * state and never bypasses the page's consent guard.
 */
export async function giveConsent(box: HTMLElement): Promise<void> {
  await waitFor(() => {
    if (!(box as HTMLInputElement).checked) fireEvent.click(box);
    expect(box).toBeChecked();
  });
}

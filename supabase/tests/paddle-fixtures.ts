import { PASS } from '../functions/_shared/core.ts';
export const paddlePriceId = `pri_${'a'.repeat(26)}`;
export const paddleTransactionId = `txn_${'b'.repeat(26)}`;
export const paddleEventId = `evt_${'c'.repeat(26)}`;
export const paddleAdjustmentId = `adj_${'d'.repeat(26)}`;
export const paddleUser = '11111111-1111-1111-1111-111111111111';
export const paddleRequest = '33333333-3333-3333-3333-333333333333';
export function paddlePrice() {
  return { id: paddlePriceId, status: 'active', billing_cycle: null, trial_period: null, tax_mode: 'external', unit_price: { amount: '2900', currency_code: 'USD' }, unit_price_overrides: [] };
}
export function paddleTransaction() {
  return { id: paddleTransactionId, status: 'completed', currency_code: 'USD', collection_mode: 'automatic', subscription_id: null,
    custom_data: { user_id: paddleUser, request_id: paddleRequest, product: PASS.product },
    items: [{ price: paddlePrice(), quantity: 1 }], details: { totals: { subtotal: '2900', discount: '0', currency_code: 'USD', tax: '145', grand_total: '3045' },
      line_items: [{ price_id: paddlePriceId, quantity: 1, totals: { subtotal: '2900', discount: '0', tax: '145', total: '3045' } }] } };
}
export function paddleRefund() {
  return { id: paddleAdjustmentId, transaction_id: paddleTransactionId, action: 'refund', status: 'approved', currency_code: 'USD',
    totals: { subtotal: '500', currency_code: 'USD', tax: '25', total: '525' } };
}

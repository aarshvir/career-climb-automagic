import type { z } from 'zod';
import type { checkoutSchema } from '@/lib/workspace-api';
type Checkout=z.infer<typeof checkoutSchema>;
export function isPaddleClientReady(mode:'test'|'live'|null|undefined, token=import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string|undefined){
  return !!mode&&!!token&&token.startsWith(mode==='test'?'test_':'live_');
}
export async function openPaymentCheckout(checkout:Checkout,onPaymentEvent:()=>void){
  if(checkout.provider==='stripe'||checkout.provider==='dodo'){window.location.assign(checkout.url);return;}
  if(!isPaddleClientReady(checkout.billingMode))throw new Error('Checkout is currently unavailable. Your saved pack access is unchanged.');
  const {initializePaddle}=await import('@paddle/paddle-js');
  const paddle=await initializePaddle({environment:checkout.billingMode==='test'?'sandbox':'production',token:import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
    eventCallback:event=>{if(event.name==='checkout.completed')onPaymentEvent();}});
  if(!paddle)throw new Error('Secure checkout could not be opened. Please retry.');
  paddle.Checkout.open({transactionId:checkout.transactionId,settings:{displayMode:'overlay',theme:'light',successUrl:`${window.location.origin}/dashboard?tab=billing&checkout=success`}});
}

import { subscriptionPlans } from "@/lib/subscription-plans";

const fromPrice = subscriptionPlans[0].priceUsd;

/** One reassurance row, identical under the main buttons: three short facts, each with its own tick, so a wrap never leaves a dangling separator. */
export default function PriceNote() {
  return <span className="jv-meta"><span className="jv-meta-in"><span>Free account</span><span>Tailored CV for each role</span><span>Plans from ${fromPrice}/month</span></span></span>;
}

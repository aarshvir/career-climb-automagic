import { subscriptionPlans } from "@/lib/subscription-plans";

const fromPrice = subscriptionPlans[0].priceUsd;

/** One reassurance row, identical under the main buttons: three short facts, each with its own tick, so a wrap never leaves a dangling separator.
 * Free and paid are never one list: the free account is 3 tailored CVs a month; preparing CVs for matching roles belongs to the plans (the hero lead says so). */
export default function PriceNote() {
  return <span className="jv-meta"><span className="jv-meta-in"><span>Free to start</span><span>3 tailored CVs a month, free</span><span>Plans from ${fromPrice}/month</span></span></span>;
}

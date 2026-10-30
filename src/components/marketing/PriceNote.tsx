import { subscriptionPlans } from "@/lib/subscription-plans";

const fromPrice = subscriptionPlans[0].priceUsd;

/** One reassurance line, identical under the main buttons. A row that wraps never starts with a separator. */
export default function PriceNote() {
  return <span className="jv-meta"><span className="jv-meta-in"><span>Free account</span><span>Free CV Check</span><span>Plans from ${fromPrice}/month</span><span>Pay only if you choose a plan or pass</span></span></span>;
}

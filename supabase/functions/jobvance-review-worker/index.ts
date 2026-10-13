import { adminClient } from '../_shared/runtime.ts';
import { createReviewWorkerHandler } from '../_shared/jobvance-review-runtime.ts';

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };
const env = (name: string) => Deno.env.get(name);
const handler = createReviewWorkerHandler({ db: { rpc: (name, args) => adminClient().rpc(name, args) }, env, waitUntil: work => EdgeRuntime.waitUntil(work) });
Deno.serve(handler);

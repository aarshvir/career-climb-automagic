import { ApiError } from './core.ts';
import type { AdminProviderStatus } from '../../../src/lib/admin-types.ts';

type Env = (name: string) => string | undefined;
export const ROUTER_MODELS = Object.freeze({
  'openai/gpt-6.1-sol': { input: 2, output: 10 },
  'anthropic/claude-sonnet-5.5': { input: 2, output: 10 },
  'moonshotai/kimi-k3': { input: .73, output: 10 },
  'meta/muse-spark-1.3': { input: 1.25, output: 4.25 },
});
export type RouterModel = keyof typeof ROUTER_MODELS;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export class RouterUncertain extends ApiError {
  constructor() { super(503, 'ROUTER_USAGE_UNCERTAIN', 'The model call could not be confirmed. Its reserved usage is retained; do not blindly retry.'); }
}
export async function routerJson(response: Response, limit = 1000000): Promise<Record<string, unknown>> {
  if (!response.body) throw new RouterUncertain();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > limit) { await reader.cancel(); throw new RouterUncertain(); } chunks.push(part.value); }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let parsed: unknown; try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RouterUncertain(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new RouterUncertain();
  return parsed as Record<string, unknown>;
}
export async function checkOpenRouterKey(env: Env, fetcher: typeof fetch = fetch): Promise<AdminProviderStatus> {
  const checkedAt = new Date().toISOString(); const key = env('JOB_LOOP_OPENROUTER_API_KEY');
  if (!key) return { configured: false, valid: null, status: 'not_configured', checkedAt, message: 'Add a replacement key in Supabase Edge Function Secrets.' };
  try {
    const response = await fetcher('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if ([401,403].includes(response.status)) return { configured: true, valid: false, status: 'invalid', checkedAt, message: 'OpenRouter rejected the configured key. Replace it in the secret store.' };
    if (!response.ok) return { configured: true, valid: null, status: 'unavailable', checkedAt, message: 'OpenRouter could not validate the key. No model call was made.' };
    const data = await routerJson(response, 100000);
    const details=object(data.data);
    if (typeof details.label !== 'string' || typeof details.is_free_tier !== 'boolean' || typeof details.usage !== 'number' || !Number.isFinite(details.usage) || details.usage<0) throw new RouterUncertain();
    return { configured: true, valid: true, status: 'valid', checkedAt, message: 'The stored key authenticated with OpenRouter. Model availability and funded usage require a separate bounded call.' };
  } catch { return { configured: true, valid: null, status: 'unavailable', checkedAt, message: 'Key validation was unavailable. The secret was not exposed and no model call was made.' }; }
}
export interface RouterRequest { body: Record<string, unknown>; headers: Record<string, string>; model: RouterModel; inputTokenBound: number; maxTokens: number; reservedMicros: number }
export function prepareRouterRequest(env: Env, model: RouterModel, messages: { role: 'system' | 'user'; content: string }[], schema: Record<string, unknown>, maxTokens = 4096, effort: 'medium' | 'max' = 'medium'): RouterRequest {
  const key = env('JOB_LOOP_OPENROUTER_API_KEY'); const price = ROUTER_MODELS[model];
  if (!key || !price) throw new ApiError(503, 'ROUTER_NOT_CONFIGURED', 'This model route is not configured.');
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 64 || maxTokens > 16384 || !['medium','max'].includes(effort) || !messages.length || messages.length > 3 || messages.some(message => !['system','user'].includes(message.role) || typeof message.content !== 'string')) throw new ApiError(400, 'ROUTER_INPUT_INVALID', 'Use the bounded model request.');
  // A UTF-8 byte per token is deliberately conservative, including JSON overhead.
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens, stream: false,
    reasoning: { effort, exclude: true },
    provider: { allow_fallbacks: false, require_parameters: true, data_collection: 'deny', max_price: { prompt: price.input, completion: price.output } },
    response_format: { type: 'json_schema', json_schema: { name: 'jobvance_review', strict: true, schema } } };
  const inputTokenBound = new TextEncoder().encode(JSON.stringify(body)).length + 2048;
  if (inputTokenBound > 150000) throw new ApiError(400, 'ROUTER_INPUT_TOO_LARGE', 'The model input exceeds the reviewed size.');
  const reservedMicros = Math.ceil(inputTokenBound * price.input + maxTokens * price.output);
  return { model, inputTokenBound, maxTokens, reservedMicros,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://jobvance.io', 'X-OpenRouter-Title': 'Jobvance' },
    body };
}
export interface RouterResult { content: string; model: string; requestId: string | null; inputTokens: number; outputTokens: number; actualMicros: number; httpStatus: number }
export async function callRouter(request: RouterRequest, fetcher: typeof fetch = fetch): Promise<RouterResult> {
  let response: Response;
  // Leave time to persist uncertainty before the Free worker's 150s wall limit.
  try { response = await fetcher('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), redirect: 'error', signal: AbortSignal.timeout(120000) }); } catch { throw new RouterUncertain(); }
  const data = await routerJson(response); const usage = object(data.usage);
  // Known pre-provider rejection incurs no model cost. Other errors remain uncertain.
  if ([400,401,402,403,404,429].includes(response.status) && data.error && !data.id && !data.usage) throw new ApiError(response.status, 'ROUTER_REQUEST_REJECTED', 'OpenRouter rejected this request before model usage was confirmed. Check account limits, model and routing settings.');
  const inputTokens = count(usage.prompt_tokens), outputTokens = count(usage.completion_tokens);
  const billed = typeof usage.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0 ? Math.ceil(usage.cost * 1000000) : null;
  const canonical = typeof data.model === 'string' ? data.model : '';
  if (!response.ok || inputTokens === null || outputTokens === null || inputTokens > request.inputTokenBound || outputTokens > request.maxTokens || billed === null || billed > request.reservedMicros || !(canonical === request.model || canonical.startsWith(request.model + '-'))) throw new RouterUncertain();
  const choice = object((Array.isArray(data.choices) ? data.choices : [])[0]); const content = object(choice.message).content;
  if (typeof content !== 'string' || content.length > 100000) throw new RouterUncertain();
  // Reasoning text and provider error payloads are intentionally never returned.
  return { content, model: canonical, requestId: typeof data.id === 'string' ? data.id.slice(0,200) : null, inputTokens, outputTokens, actualMicros: billed, httpStatus: response.status };
}

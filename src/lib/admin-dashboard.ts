import { z } from 'zod';
import type { AdminDashboard } from './admin-types';

/** The /admin dashboard contract. Test fixtures and admin staff accounts are excluded server-side;
 * emails are masked; no CV text, messages or payment details beyond plan and amount are returned. */
const text = z.string().max(400), id = z.string().min(1).max(128), count = z.number().int().nonnegative(), money = z.number().nonnegative();
const time = z.string().max(64), maybeTime = time.nullable();
const status = z.enum(['received', 'in_review', 'resolved']);

export const dashboardSchema = z.object({
  actor: z.object({ id, role: z.enum(['owner', 'operator']) }),
  generatedAt: time,
  window: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]), start: time, end: time }),
  coverage: z.object({ realUsers: count, excludedTest: count, excludedStaff: count, notes: z.array(text).max(20) }),
  today: z.array(z.object({ key: text, label: text, today: z.number(), yesterday: z.number(), kind: z.enum(['count', 'usd']) })).max(20),
  kpis: z.array(z.object({ key: text, label: text, current: z.number(), previous: z.number().nullable(), kind: z.enum(['count', 'usd', 'percent']), help: text })).max(20),
  daily: z.array(z.object({ day: time, signups: count, cvChecks: count, runs: count, paidOrders: count, revenueUsd: money })).max(100),
  funnel: z.array(z.object({ label: text, count, hint: text })).max(12),
  cohorts: z.array(z.object({ week: time, size: count, weeks: z.array(z.number().min(0).max(100).nullable()).max(12) })).max(12),
  revenue: z.object({
    allTimeUsd: money, allTimeOrders: count, payingCustomers: count, unknownUsdPayments: count,
    subscriptions: z.object({ active: count, cancelling: count, pastDue: count, ended: count }),
    places: z.object({ paidUsed: count, paidCapacity: count, pilotUsed: count, pilotCapacity: count }),
    byPlan: z.array(z.object({ label: text, usd: money, orders: count })).max(30),
    byCurrency: z.array(z.object({ currency: z.string().max(8), amountMinor: count, orders: count })).max(30),
    recent: z.array(z.object({ at: time, userId: id.nullable(), emailDisplay: text, plan: text, amountMinor: count, currency: z.string().max(8), usd: money.nullable(), status: text })).max(100),
    attention: z.array(z.object({ key: text, label: text, count, help: text })).max(10),
  }),
  users: z.array(z.object({
    id, emailDisplay: text, joinedAt: time, lastSignInAt: maybeTime, lastActiveAt: maybeTime,
    plan: text.nullable(), paidUsd: money, hasPaid: z.boolean(), cvChecks: count, runs: count, failedRuns: count, hasProfile: z.boolean(), pilot: z.boolean(),
  })).max(1000),
  ops: z.object({
    schedulerEnabled: z.boolean(), lastDispatchAt: maybeTime,
    checks: z.array(z.object({ key: text, label: text, count, danger: z.boolean(), help: text })).max(20),
    problems: z.array(z.object({ kind: text, at: time, userId: id.nullable(), emailDisplay: text, detail: text })).max(100),
    budget: z.object({ month: time, capUsd: money, committedUsd: money, actualUsd: money }),
  }),
  support: z.array(z.object({ id, userId: id, emailDisplay: text, category: z.enum(['help', 'privacy', 'bug']), status, createdAt: time, version: count })).max(200),
});
// The shape mirrors AdminDashboard in admin-types.ts (shared with the edge function, which has no zod).
export type { AdminDashboard };

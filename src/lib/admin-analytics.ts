import { z } from 'zod';

/** Exact browser contracts for actor-checked first-party analytics reads. */
const text = z.string().max(400), id = z.string().uuid(), count = z.number().int().nonnegative();
const time = z.string().max(64).datetime({ offset: true });
// SQL joins the separately admitted 300-character campaign/content tags with " · ".
const campaignText = z.string().max(603);
const maybe = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();
const coverage = z.object({ startedAt: time, status: z.enum(['partial', 'available']) }).strict();
const visitRow = z.object({
  id, visitorId: id, userId: maybe(id), startedAt: time, lastSeenAt: time, name: maybe(text), email: maybe(text), phone: maybe(text),
  channel: text, campaign: maybe(campaignText), landing: maybe(text), lastPage: maybe(text), pages: count, clicks: count, seconds: count,
  device: maybe(text), browser: maybe(text), inApp: maybe(text),
}).strict();

export const analyticsSchema = z.object({
  coverage: coverage.optional(),
  window: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]), start: time, end: time }).strict(),
  totals: z.object({ visitors: count, sessions: count, pageViews: count, avgSeconds: z.number().nonnegative(), signedIn: count, newAccounts: count, today: count }).strict(),
  previous: z.object({ visitors: count, sessions: count, pageViews: count }).strict(),
  daily: z.array(z.object({ day: z.string().date(), visitors: count, sessions: count, pageViews: count }).strict()).max(100),
  channels: z.array(z.object({ label: text, sessions: count, visitors: count, newAccounts: count }).strict()).max(50),
  campaigns: z.array(z.object({ source: text, campaign: text, content: text, sessions: count, newAccounts: count }).strict()).max(50),
  landings: z.array(z.object({ path: text, sessions: count, newAccounts: count, avgSeconds: z.number().nonnegative() }).strict()).max(50),
  pages: z.array(z.object({ path: text, views: count, visitors: count, avgSeconds: z.number().nonnegative() }).strict()).max(50),
  clicks: z.array(z.object({ label: text, path: text, href: maybe(text), count, visitors: count }).strict()).max(50),
  sessions: z.array(visitRow).max(300).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'Visit identifiers must be unique.'),
}).strict();

const person = z.object({ userId: id, name: maybe(text), email: text, phone: maybe(text), joinedAt: time }).strict();
const pageEvent = z.object({
  at: time, kind: z.enum(['page_view', 'click', 'form_submit', 'identify']), path: text, title: maybe(text), label: maybe(text), href: maybe(text),
  seconds: maybe(count), scroll: maybe(z.number().min(0).max(100)),
}).strict().refine(event => event.kind === 'page_view' || event.seconds == null && event.scroll == null, 'Only a page exposure carries visible duration and scroll.');
export const sessionSchema = z.object({
  id, visitorId: id, userId: maybe(id), startedAt: time, lastSeenAt: time, channel: text,
  context: z.record(z.string(), z.union([z.string().max(300), z.boolean()])),
  device: maybe(text), browser: maybe(text), os: maybe(text), inApp: maybe(text), country: maybe(text), person: person.nullable(), otherVisits: count,
  events: z.array(pageEvent).max(2000),
}).strict().refine(visit => !visit.person || !!visit.userId && visit.person.userId === visit.userId, 'The person must belong to this exact visit owner.');

const visit = z.object({ id, startedAt: time, channel: text, landing: maybe(text), pages: count, clicks: count, seconds: count, device: maybe(text), inApp: maybe(text) }).strict();
export const personSchema = z.object({
  userId: id, name: maybe(text), email: text, phone: maybe(text), joinedAt: time, lastSignInAt: maybe(time), paidUsd: z.number().nonnegative(),
  firstVisit: z.object({ at: time, channel: text, campaign: maybe(campaignText), landing: maybe(text), referrer: maybe(text) }).strict().nullable(),
  totals: z.object({ visits: count, pageViews: count, seconds: count }).strict(),
  visits: z.array(visit).max(200).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'Visit identifiers must be unique.'),
}).strict();

export const contactsSchema = z.array(z.object({ userId: id, name: maybe(text), phone: maybe(text), visits: count, lastVisitAt: maybe(time), channel: maybe(text) }).strict()).max(1000)
  .refine(rows => new Set(rows.map(row => row.userId)).size === rows.length, 'Account identifiers must be unique.');

export type AdminAnalytics = z.infer<typeof analyticsSchema>;
export type AdminVisit = z.infer<typeof sessionSchema>;
export type AdminPerson = z.infer<typeof personSchema>;
export type AdminContacts = z.infer<typeof contactsSchema>;

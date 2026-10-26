import { z } from 'zod';

/** Browser-side checks for the analytics admin RPCs (jobvance_admin_analytics/session/person/contacts). */
const text = z.string().max(400), id = z.string().min(1).max(128), count = z.number().int().nonnegative(), time = z.string().max(64);
const maybe = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();

export const analyticsSchema = z.object({
  window: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]), start: time, end: time }),
  totals: z.object({ visitors: count, sessions: count, pageViews: count, avgSeconds: z.number().nonnegative(), signedIn: count, newAccounts: count, today: count }),
  previous: z.object({ visitors: count, sessions: count, pageViews: count }),
  daily: z.array(z.object({ day: time, visitors: count, sessions: count, pageViews: count })).max(100),
  channels: z.array(z.object({ label: text, sessions: count, visitors: count, newAccounts: count })).max(50),
  campaigns: z.array(z.object({ source: text, campaign: text, content: text, sessions: count, newAccounts: count })).max(50),
  landings: z.array(z.object({ path: text, sessions: count, newAccounts: count, avgSeconds: z.number().nonnegative() })).max(50),
  pages: z.array(z.object({ path: text, views: count, visitors: count, avgSeconds: z.number().nonnegative() })).max(50),
  clicks: z.array(z.object({ label: text, path: text, href: maybe(text), count, visitors: count })).max(50),
  sessions: z.array(z.object({
    id, visitorId: id, userId: maybe(id), startedAt: time, lastSeenAt: time, name: maybe(text), email: maybe(text), phone: maybe(text),
    channel: text, campaign: maybe(text), landing: maybe(text), lastPage: maybe(text), pages: count, clicks: count, seconds: count,
    device: maybe(text), browser: maybe(text), inApp: maybe(text),
  })).max(300),
});

const person = z.object({ userId: id, name: maybe(text), email: text, phone: maybe(text), joinedAt: time });
export const sessionSchema = z.object({
  id, visitorId: id, userId: maybe(id), startedAt: time, lastSeenAt: time, channel: text, context: z.record(z.string(), z.union([z.string().max(300), z.boolean()])),
  device: maybe(text), browser: maybe(text), os: maybe(text), inApp: maybe(text), country: maybe(text), person: person.nullable(), otherVisits: count,
  events: z.array(z.object({ at: time, kind: z.enum(['page_view', 'click', 'form_submit', 'identify']), path: text, title: maybe(text), label: maybe(text), href: maybe(text), seconds: maybe(count), scroll: maybe(z.number().min(0).max(100)) })).max(2000),
});

const visit = z.object({ id, startedAt: time, channel: text, landing: maybe(text), pages: count, clicks: count, seconds: count, device: maybe(text), inApp: maybe(text) });
export const personSchema = z.object({
  userId: id, name: maybe(text), email: text, phone: maybe(text), joinedAt: time, lastSignInAt: maybe(time), paidUsd: z.number().nonnegative(),
  firstVisit: z.object({ at: time, channel: text, campaign: maybe(text), landing: maybe(text), referrer: maybe(text) }).nullable(),
  totals: z.object({ visits: count, pageViews: count, seconds: count }),
  visits: z.array(visit).max(200),
});

export const contactsSchema = z.array(z.object({ userId: id, name: maybe(text), phone: maybe(text), visits: count, lastVisitAt: maybe(time), channel: maybe(text) })).max(1000);

export type AdminAnalytics = z.infer<typeof analyticsSchema>;
export type AdminVisit = z.infer<typeof sessionSchema>;
export type AdminPerson = z.infer<typeof personSchema>;
export type AdminContacts = z.infer<typeof contactsSchema>;

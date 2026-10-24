// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { paidCapacitySchema } from './fixtures/paid-capacity-schema.mjs';
import { paidCapacityNativeCases } from '../../scripts/fixtures/paid-capacity-native-cases.mjs';

it('executes thirteen isolated actual-SQL paid-capacity, fulfillment and artifact checks', async () => {
  const db = new PGlite(); const completed: string[] = [];
  try {
    await db.exec(await paidCapacitySchema());
    const observer = {
      query: (sql: string) => db.exec(sql),
      json: async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0] ?? {})[0],
    };
    await paidCapacityNativeCases({ observer, quote: (s: string) => "'" + s.replaceAll("'", "''") + "'", check: async (name: string, test: () => Promise<unknown>) => { try { await test(); completed.push(name); } catch (e) { throw new Error(name, { cause: e }); } } });
    expect(completed).toHaveLength(13);
  } finally { await db.close(); }
}, 60000);

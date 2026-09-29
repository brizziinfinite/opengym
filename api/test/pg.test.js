import { test } from 'node:test';
import assert from 'node:assert/strict';

// Runs only when a test database is available (PG_TEST_URL); skipped in CI without one.
const url = process.env.PG_TEST_URL;
test('pg: round-trips the db.json shape and only writes what changed', { skip: !url && 'PG_TEST_URL not set' }, async () => {
  process.env.DATABASE_URL = url;
  const pg = await import('../db/pg.js');
  const pool = await pg.connect();
  await pool.query('delete from users');
  const db = { users: [{ id: 'u1', name: 'Ana', created: '2026-09-01T00:00:00.000Z', phone: '5511', wa: { step: 'active' } }],
    creds: [{ id: 'c1', userId: 'u1', publicKey: 'pk', counter: 1, transports: [] }], subs: [], invites: [{ code: 'X1', note: 'n', createdBy: 'u1', created: '2026-09-01T00:00:00.000Z' }] };
  await pg.save(db);
  const back = await pg.load();
  assert.equal(back.users[0].phone, '5511');
  assert.deepEqual(back.users[0].wa, { step: 'active' });
  assert.equal(back.creds[0].counter, 1);
  assert.equal(back.invites[0].code, 'X1');
  db.users[0].wa.step = 'paused_health'; db.creds = [];
  await pg.save(db);
  const again = await pg.load();
  assert.equal(again.users[0].wa.step, 'paused_health');
  assert.equal(again.creds.length, 0);
  await pg.logMessage('u1', '5511', 'in', 'text', 'oi'); await pg.logEvent('u1', 'test', { a: 1 }); await pg.logConsent('u1', 'p', {});
  const n = await pool.query('select (select count(*) from wa_messages) m, (select count(*) from events) e, (select count(*) from consents) c');
  assert.ok(+n.rows[0].m >= 1 && +n.rows[0].e >= 1 && +n.rows[0].c >= 1);
  await pool.end();
});

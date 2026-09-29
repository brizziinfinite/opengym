/* Postgres for the operational data — users, passkeys, push subscriptions, invites, WhatsApp
 * profiles, conversation log, events and consents. Optional: without DATABASE_URL the server
 * keeps using data/db.json exactly as before, so an instance that never turns WhatsApp on
 * needs no database.
 *
 * Phase 1 of the plan in docs/SELF_HOSTING.md §10: per-user app state (plans, workouts) stays
 * in data/state-<uid>.json for now; the web client syncs it whole and that is unchanged.
 *
 * The in-memory shape the rest of the server uses (db.users[], db.creds[] …) is kept: this
 * module loads it at boot and writes through on every saveDb(), row by row, only for what
 * changed. That keeps server.js and wa/*.js free of SQL. */
import pg from 'pg';

const SCHEMA = `
create table if not exists users (
  id text primary key, name text not null, created timestamptz not null default now(),
  phone text unique, admin boolean not null default false, disabled boolean not null default false,
  sv integer not null default 0, invited_by text, last_reminder date,
  wa jsonb,                                   -- WhatsApp conversation state (see wa/flow.js)
  extra jsonb not null default '{}'::jsonb    -- anything else db.json carried
);
create index if not exists users_wa_active on users ((wa->>'step')) where phone is not null;
create table if not exists creds (
  id text primary key, user_id text not null references users(id) on delete cascade,
  public_key text not null, counter bigint not null default 0, transports jsonb not null default '[]'::jsonb
);
create table if not exists push_subs (
  endpoint text primary key, user_id text not null references users(id) on delete cascade,
  keys jsonb not null, created timestamptz not null default now()
);
create table if not exists invites (
  code text primary key, note text, created_by text, created timestamptz, used_by text, used_at timestamptz, revoked boolean not null default false
);
create table if not exists wa_messages (
  id bigserial primary key, user_id text references users(id) on delete cascade,
  phone text not null, dir text not null check (dir in ('in','out')), kind text not null default 'text',
  body text, created timestamptz not null default now()
);
create index if not exists wa_messages_user on wa_messages (user_id, created desc);
create table if not exists events (
  id bigserial primary key, user_id text references users(id) on delete cascade,
  type text not null, payload jsonb not null default '{}'::jsonb, at timestamptz not null default now()
);
create index if not exists events_user on events (user_id, at desc);
create table if not exists consents (
  id bigserial primary key, user_id text references users(id) on delete cascade,
  purpose text not null, granted_at timestamptz not null default now(), revoked_at timestamptz, detail jsonb
);
create table if not exists meta (k text primary key, v jsonb);
`;

export const url = process.env.DATABASE_URL || '';
export const enabled = () => !!url;
let pool = null;

export async function connect() {
  if (!url) return null;
  pool = new pg.Pool({ connectionString: url, max: 5 });
  await pool.query(SCHEMA);
  return pool;
}
export const query = (text, params) => pool.query(text, params);

/* ---------- load / save the db.json shape ---------- */
const rowToUser = r => ({
  id: r.id, name: r.name, created: r.created?.toISOString?.() || r.created,
  ...(r.phone ? { phone: r.phone } : {}), ...(r.admin ? { admin: true } : {}), ...(r.disabled ? { disabled: true } : {}),
  ...(r.sv ? { sv: r.sv } : {}), ...(r.invited_by ? { invitedBy: r.invited_by } : {}),
  ...(r.last_reminder ? { lastReminder: typeof r.last_reminder === 'string' ? r.last_reminder : r.last_reminder.toISOString().slice(0, 10) } : {}),
  ...(r.wa ? { wa: r.wa } : {}), ...(r.extra || {})
});
const KNOWN = new Set(['id', 'name', 'created', 'phone', 'admin', 'disabled', 'sv', 'invitedBy', 'lastReminder', 'wa']);
const userToRow = u => {
  const extra = {}; for (const k of Object.keys(u)) if (!KNOWN.has(k)) extra[k] = u[k];
  return [u.id, u.name, u.created || new Date().toISOString(), u.phone || null, !!u.admin, !!u.disabled, u.sv || 0, u.invitedBy || null, u.lastReminder || null, u.wa ? JSON.stringify(u.wa) : null, JSON.stringify(extra)];
};

export async function load() {
  const [u, c, s, i] = await Promise.all([
    query('select * from users order by created'), query('select * from creds'), query('select * from push_subs'), query('select * from invites')
  ]);
  return {
    users: u.rows.map(rowToUser),
    creds: c.rows.map(r => ({ id: r.id, userId: r.user_id, publicKey: r.public_key, counter: Number(r.counter), transports: r.transports })),
    subs: s.rows.map(r => ({ userId: r.user_id, endpoint: r.endpoint, keys: r.keys })),
    invites: i.rows.map(r => ({ code: r.code, note: r.note || '', createdBy: r.created_by, created: r.created?.toISOString?.(), ...(r.used_by ? { usedBy: r.used_by, usedAt: r.used_at?.toISOString?.() } : {}), ...(r.revoked ? { revoked: true } : {}) }))
  };
}

// Write-through: called with the in-memory db on every saveDb(). Rows are upserted only when
// their JSON changed since the last save; deleted ones are removed. Cheap enough at thousands
// of users because the diff is in memory and touches a handful of rows per call.
const last = { users: new Map(), creds: new Map(), subs: new Map(), invites: new Map() };
export async function save(db) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const sync = async (name, list, key, upsert, del) => {
      const seen = new Set();
      for (const item of list) {
        const k = item[key], j = JSON.stringify(item); seen.add(k);
        if (last[name].get(k) !== j) { await upsert(client, item); last[name].set(k, j); }
      }
      for (const k of [...last[name].keys()]) if (!seen.has(k)) { await del(client, k); last[name].delete(k); }
    };
    await sync('users', db.users, 'id',
      (c, u) => c.query(`insert into users (id,name,created,phone,admin,disabled,sv,invited_by,last_reminder,wa,extra) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        on conflict (id) do update set name=$2,phone=$4,admin=$5,disabled=$6,sv=$7,invited_by=$8,last_reminder=$9,wa=$10,extra=$11`, userToRow(u)),
      (c, id) => c.query('delete from users where id=$1', [id]));
    await sync('creds', db.creds, 'id',
      (c, x) => c.query(`insert into creds (id,user_id,public_key,counter,transports) values ($1,$2,$3,$4,$5) on conflict (id) do update set counter=$4,transports=$5`, [x.id, x.userId, x.publicKey, x.counter || 0, JSON.stringify(x.transports || [])]),
      (c, id) => c.query('delete from creds where id=$1', [id]));
    await sync('subs', db.subs, 'endpoint',
      (c, x) => c.query(`insert into push_subs (endpoint,user_id,keys) values ($1,$2,$3) on conflict (endpoint) do update set user_id=$2,keys=$3`, [x.endpoint, x.userId, JSON.stringify(x.keys)]),
      (c, k) => c.query('delete from push_subs where endpoint=$1', [k]));
    await sync('invites', db.invites, 'code',
      (c, x) => c.query(`insert into invites (code,note,created_by,created,used_by,used_at,revoked) values ($1,$2,$3,$4,$5,$6,$7) on conflict (code) do update set note=$2,used_by=$5,used_at=$6,revoked=$7`, [x.code, x.note || '', x.createdBy || null, x.created || null, x.usedBy || null, x.usedAt || null, !!x.revoked]),
      (c, k) => c.query('delete from invites where code=$1', [k]));
    await client.query('commit');
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
}
export function prime(db) {   // remember what is already in the database so the first save() only writes changes
  for (const u of db.users) last.users.set(u.id, JSON.stringify(u));
  for (const c of db.creds) last.creds.set(c.id, JSON.stringify(c));
  for (const s of db.subs) last.subs.set(s.endpoint, JSON.stringify(s));
  for (const i of db.invites) last.invites.set(i.code, JSON.stringify(i));
}

/* ---------- append-only logs (WhatsApp only; no-ops without a database) ---------- */
export const logMessage = (userId, phone, dir, kind, body) =>
  pool ? query('insert into wa_messages (user_id,phone,dir,kind,body) values ($1,$2,$3,$4,$5)', [userId || null, phone, dir, kind, body ? String(body).slice(0, 4000) : null]).catch(e => console.error('[pg] logMessage', e.message)) : Promise.resolve();
export const logEvent = (userId, type, payload) =>
  pool ? query('insert into events (user_id,type,payload) values ($1,$2,$3)', [userId, type, JSON.stringify(payload || {})]).catch(e => console.error('[pg] logEvent', e.message)) : Promise.resolve();
export const logConsent = (userId, purpose, detail) =>
  pool ? query('insert into consents (user_id,purpose,detail) values ($1,$2,$3)', [userId, purpose, JSON.stringify(detail || {})]).catch(e => console.error('[pg] logConsent', e.message)) : Promise.resolve();
// Retention: chat log 90 days; events 2 years.
export const prune = () => pool ? Promise.all([
  query(`delete from wa_messages where created < now() - interval '90 days'`),
  query(`delete from events where at < now() - interval '2 years'`)
]).catch(e => console.error('[pg] prune', e.message)) : Promise.resolve();

/* ---------- the compact per-user summary the trainer layer reads ---------- */
export async function upsertSummary(userId, summary) {
  if (!pool) return;
  await query(`create table if not exists user_summaries (user_id text primary key references users(id) on delete cascade, summary jsonb not null, updated timestamptz not null default now())`);
  await query('insert into user_summaries (user_id,summary,updated) values ($1,$2,now()) on conflict (user_id) do update set summary=$2,updated=now()', [userId, JSON.stringify(summary)]).catch(e => console.error('[pg] summary', e.message));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from '../test/helpers.mjs';

// The real route, real queue, and real fixture CLI. No account, browser or AI bill required.
tempData();
const cfg = await import('../coach/config.js');
const { spinningRoutes } = await import('./routes.js');
cfg.save({ enabled: true, provider: 'fixture' });

const allowed = new Set();
const routes = spinningRoutes({
  json(res, status, body) { res.status = status; res.body = body; },
  readBody: async req => req.body,
  readSession: req => req.user || null,
  readState: uid => allowed.has(uid) ? { spinning: { aiConsent: { version: 1, agreedAt: Date.now() } } } : null
});
const user = id => ({ id });
const params = { duration: 50, style: 'mix', level: 'moderate' };
async function call(route, req) {
  const res = {};
  await routes[route](req, res);
  return res;
}
async function poll(uid, id) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    const r = await call('GET /api/spinning/status', {
      user: user(uid), url: '/api/spinning/status?job=' + encodeURIComponent(id)
    });
    if (r.body?.job?.state === 'ready' || r.body?.job?.state === 'failed') return r;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Spinning job did not finish');
}

test('spinning AI rejects missing login, bad parameters and missing consent', async () => {
  const noLogin = await call('POST /api/spinning/generate', { body: params });
  assert.equal(noLogin.status, 401);
  allowed.add('teacher-a');
  const bad = await call('POST /api/spinning/generate', { user: user('teacher-a'), body: { ...params, duration: 1000 } });
  assert.equal(bad.status, 400);
  const missingConsent = await call('POST /api/spinning/generate', { user: user('teacher-unconsented'), body: params });
  assert.equal(missingConsent.status, 403);
});

test('generation returns a separate proposal that requires explicit approval', async () => {
  const started = await call('POST /api/spinning/generate', { user: user('teacher-a'), body: params });
  assert.equal(started.status, 202);
  assert.ok(started.body.job.id);
  const result = await poll('teacher-a', started.body.job.id);
  assert.equal(result.status, 200);
  assert.equal(result.body.job.state, 'ready', JSON.stringify(result.body));
  assert.equal(result.body.requiresApproval, true);
  assert.equal(result.body.proposal.phases.reduce((s, p) => s + p.seconds, 0), 3000);
  assert.equal(result.body.proposal.source, 'ai');
  assert.ok(result.body.proposal.phases.every(p => p.rpe <= 6));
  // The route returns a proposal; the UI alone explicitly writes it into the profile.
});

test('users cannot inspect other teachers\' jobs', async () => {
  allowed.add('teacher-b');
  const started = await call('POST /api/spinning/generate', { user: user('teacher-b'), body: params });
  assert.equal(started.status, 202);
  const seenByOther = await call('GET /api/spinning/status', {
    user: user('teacher-a'), url: '/api/spinning/status?job=' + started.body.job.id
  });
  assert.equal(seenByOther.status, 404);
  await poll('teacher-b', started.body.job.id);
});

test('spinning AI enforces the daily quota', async () => {
  allowed.add('teacher-quota');
  for (let i = 0; i < 3; i++) {
    const started = await call('POST /api/spinning/generate', { user: user('teacher-quota'), body: params });
    assert.equal(started.status, 202);
    const outcome = await poll('teacher-quota', started.body.job.id);
    assert.equal(outcome.body.job.state, 'ready');
  }
  const denied = await call('POST /api/spinning/generate', { user: user('teacher-quota'), body: params });
  assert.equal(denied.status, 429);
});

test('fixture provider failure is sanitized and cannot save a proposal', async () => {
  allowed.add('teacher-fail');
  process.env.FIXTURE_MODE = 'invalid';
  try {
    const started = await call('POST /api/spinning/generate', { user: user('teacher-fail'), body: params });
    assert.equal(started.status, 202);
    const result = await poll('teacher-fail', started.body.job.id);
    assert.equal(result.body.job.state, 'failed');
    assert.equal(result.body.proposal, undefined);
    assert.ok(!JSON.stringify(result.body).includes('FIXTURE_MODE'));
  } finally {
    delete process.env.FIXTURE_MODE;
  }
});

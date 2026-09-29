import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDays, parseTime, parseBody, numbers, parseWeight, isYes, isNo } from '../wa/text.js';
import { buildPlan, isSenior, pickDays, EX } from '../wa/plan.js';
import { parseWebhook } from '../wa/evolution.js';

test('parses days, ranges and times the way people write them', () => {
  assert.deepEqual(parseDays('seg qua sex 7h'), [1, 3, 5]);
  assert.deepEqual(parseDays('seg a sex'), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseDays('terça e quinta 18:30'), [2, 4]);
  assert.equal(parseTime('seg qua sex 7h'), '07:00');
  assert.equal(parseTime('18h30'), '18:30');
  assert.equal(parseTime('8 da noite'), '20:00');
  assert.equal(parseTime('amanhã'), null);
});

test('parses body data in one message', () => {
  assert.deepEqual(parseBody('52, feminino, 1,62, 70kg'), { sex: 'female', heightCm: 162, weightKg: 70, age: 52 });
  assert.deepEqual(parseBody('tenho 40 anos homem 180cm 90 kg'), { sex: 'male', heightCm: 180, weightKg: 90, age: 40 });
});

test('numbered answers, yes/no, weight', () => {
  assert.deepEqual(numbers('2 e 5'), [2, 5]);
  assert.deepEqual(numbers('0'), []);
  assert.ok(isYes('Sim!'));
  assert.ok(isNo('não'));
  assert.equal(parseWeight('peso 82,5'), 82.5);
});

test('over 50 and sedentary: legs and balance first, light dose, custom sit-to-stand', () => {
  const p = { age: 58, level: 'sedentary', goal: 'general', setup: 'home', days: [1, 2, 3, 4, 5], conditions: [] };
  assert.ok(isSenior(p));
  const { routines, week, customEx } = buildPlan(p);
  assert.equal(Object.keys(week).length, 3);
  assert.equal(routines[0].ex[0].id, 'cx-sitstand');
  assert.ok(routines.every(r => r.ex.some(e => e.id === 'cx-balance' && e.mode === 'time')));
  assert.ok(routines.every(r => r.ex.every(e => e.sets === 2)));
  assert.deepEqual(customEx.map(c => c.id).sort(), ['cx-balance', 'cx-sitstand']);
});

test('conditions swap risky exercises', () => {
  const knee = buildPlan({ age: 35, level: 'regular', goal: 'muscle', setup: 'gym', days: [1, 3, 5], conditions: ['knee'] });
  assert.ok(!knee.routines.flatMap(r => r.ex.map(e => e.id)).includes('0043'), 'no barbell squat with knee pain');
  const back = buildPlan({ age: 35, level: 'returning', goal: 'general', setup: 'gym', days: [1, 4], conditions: ['back'] });
  const bids = back.routines.flatMap(r => r.ex.map(e => e.id));
  assert.ok(!bids.includes('0085') && !bids.includes('0043'), 'no heavy hinge/squat with back pain');
  const hyp = buildPlan({ age: 45, level: 'regular', goal: 'strength', setup: 'gym', days: [1, 3, 5], conditions: ['hypertension'] });
  assert.ok(hyp.routines.every(r => r.ex.every(e => !(e.reps <= 6))), 'no heavy low-rep sets with hypertension');
});

test('only equipment the user has (from photos)', () => {
  const { routines } = buildPlan({ age: 30, level: 'returning', goal: 'muscle', equipment: ['dumbbell'], days: [1, 3, 5], conditions: [] });
  routines.forEach(r => r.ex.forEach(e => assert.ok(['dumbbell', 'body weight'].includes(EX[e.id].eq), e.id)));
});

test('spreads sessions over the offered days', () => {
  assert.deepEqual(pickDays([1, 2, 3, 4, 5], 3), [1, 3, 5]);
  assert.deepEqual(pickDays([], 2), [1, 4]);
});

test('webhook: only messages from people', () => {
  const base = { event: 'messages.upsert', data: { key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'A' }, pushName: 'João', message: { conversation: 'oi' } } };
  assert.equal(parseWebhook(base).text, 'oi');
  assert.equal(parseWebhook({ ...base, data: { ...base.data, key: { ...base.data.key, fromMe: true } } }), null);
  assert.equal(parseWebhook({ ...base, data: { ...base.data, key: { ...base.data.key, remoteJid: '123@g.us' } } }), null);
  assert.equal(parseWebhook({ event: 'connection.update' }), null);
});

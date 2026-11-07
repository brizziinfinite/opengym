import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClass, validateRequest, templateClass, buildPrompt } from './contract.js';

test('input accepts only supported duration, style, and effort', () => {
  assert.deepEqual(validateRequest({ duration: 50, style: 'mix', level: 'moderate' }),
    { ok: true, duration: 50, style: 'mix', level: 'moderate' });
  assert.equal(validateRequest({ duration: 400, style: 'mix', level: 'light' }).ok, false);
  assert.equal(validateRequest({ duration: 50, style: 'hijack', level: 'light' }).ok, false);
  assert.equal(validateRequest({ duration: 50, style: 'rock', level: 'max' }).ok, false);
});

test('a valid five-phase class must total the requested duration', () => {
  const v = validateClass({
    title: 'Teste', subtitle: 'Dance',
    phases: [600, 600, 600, 600, 600].map((seconds, i) => ({
      name: ['Aquecimento','Estrada','Subida','Reta','Recuperação'][i],
      seconds, rpmMin: 65, rpmMax: 80, rpe: 5, cue: 'Mantenha a pedalada controlada.'
    })),
    tracks: [{ title: 'Example', artist: 'Test Artist' }]
  }, 50);
  assert.equal(v.ok, true);
  assert.equal(v.value.phases.length, 5);
  assert.deepEqual(v.value.tracks, [['Example', 'Test Artist']]);
});

test('unsafe or malformed AI output is rejected', () => {
  const raw = { title: 'Oops', phases: [
    { name: 'Sprint', cue: 'Go', seconds: 1800, rpmMin: 115, rpmMax: 140, rpe: 10 },
    { name: 'Cooldown', cue: 'Recover', seconds: 600, rpmMin: 65, rpmMax: 70, rpe: 2 }
  ] };
  const v = validateClass(raw, 50);
  assert.equal(v.ok, false);
  assert.ok(v.errors.length > 0);
  assert.equal(validateClass(null, 50).ok, false);
});

test('offline template has exact duration and does not pretend to be AI', () => {
  const draft = templateClass({ duration: 45, style: 'rock', level: 'light' });
  assert.equal(draft.source, 'template');
  assert.equal(draft.phases.reduce((n, p) => n + p.seconds, 0), 2700);
  assert.ok(draft.phases.every(p => p.rpe <= 4));
});

test('prompt includes exact duration and no private workout state', () => {
  const prompt = buildPrompt({ duration: 30, style: 'rock', level: 'moderate' });
  assert.match(prompt, /1800/);
  assert.doesNotMatch(prompt, /bodyweight|medical history|patientName/);
});

/* Load progression for the WhatsApp assistant — what today's message prescribes.
 *
 * Follows the same policies as frontend/src/lib/progression.js (linear, double progression,
 * time, bodyweight → reps) so the web app and the chat agree on the numbers, with two
 * differences a conversation needs:
 *   - A plain "FIZ" carries no evidence. It is stored with `unknown: true` and never counts as
 *     a success: the load holds until a detailed log or an effort rating says otherwise.
 *   - The effort rating (1–5, asked after every session) drives progression on its own when
 *     there are no per-set numbers: 1–2 → up, 3–4 → hold, 5 → back off 10 %.
 * Seniors and beginners move in small steps (≈ 5 % or 1–2.5 kg) and start from nothing.
 */
import { EX, isSenior } from './plan.js';

const HEAVY_BP = new Set(['upper legs', 'lower legs', 'back']);
export const DELOAD_AFTER = { linear: 3, double: 3, time: 3 };
const round1 = v => Math.round(v * 10) / 10;
const snap = (v, step) => (step > 0 ? round1(Math.round(v / step) * step) : round1(v));

export function stepFor(id, p) {
  const heavy = HEAVY_BP.has(EX[id]?.bp);
  if (p && (isSenior(p) || p.level === 'sedentary')) return heavy ? 2.5 : 1;
  return heavy ? 5 : 2.5;
}
// A step never bigger than ~5 % of the current load for careful profiles.
function stepCapped(id, p, w) {
  const s = stepFor(id, p);
  return p && (isSenior(p) || p.level !== 'regular') && w > 0 ? Math.max(1, Math.min(s, round1(w * 0.05))) : s;
}
function deloadTo(cur, step) {
  let next = snap(cur * 0.9, step);
  if (next >= cur) next = snap(cur - step, step);
  return Math.max(step, next);
}

const modeOf = cfg => (cfg?.mode === 'time' ? 'time' : 'reps');
const policyOf = (cfg, routine, mode) => {
  const pick = cfg?.prog || routine?.prog || (mode === 'reps' ? 'linear' : 'off');
  if (mode === 'time') return pick === 'time' ? 'time' : 'off';
  return ['linear', 'double', 'greyskull'].includes(pick) ? (pick === 'greyskull' ? 'linear' : pick) : 'off';
};

/** One past session reduced to what a policy needs. `unknown` = a "FIZ" with no numbers. */
export function readSession(entry, fallback) {
  const target = entry?.target || fallback || {};
  const mode = modeOf(target);
  const sets = (entry?.sets || []).filter(s => s.done);
  const planned = target.sets || sets.length;
  const unknown = !!entry?.unknown;
  const effort = entry?.effort ?? null;
  if (mode === 'time') {
    const goal = target.sec || 0;
    const held = sets.map(s => s.sec || 0);
    return { mode, goal, unknown, effort, weight: 0, ok: !unknown && goal > 0 && sets.length >= planned && held.every(h => h >= goal) };
  }
  const goal = target.reps || 0;
  const reps = sets.map(s => s.r || 0);
  return {
    mode, goal, unknown, effort, reps,
    weight: Math.max(0, ...sets.map(s => s.w || 0)),
    low: reps.length ? Math.min(...reps) : 0,
    ok: !unknown && goal > 0 && sets.length >= planned && reps.every(r => r >= goal)
  };
}
export function sessionsFor(S, exId, fallback) {
  const out = [];
  (S.workouts || []).forEach(w => {
    const e = (w.entries || []).find(x => x.id === exId);
    if (e && (e.sets || []).some(s => s.done)) out.push({ d: w.d, ...readSession(e, fallback) });
  });
  return out;
}
const stallCount = ss => { let n = 0; for (let i = ss.length - 1; i >= 0; i--) { if (ss[i].ok) break; if (ss[i].unknown) continue; n++; } return n; };

/**
 * What to prescribe for one exercise today.
 * → { kind: 'first'|'up'|'hold'|'deload'|'off', weight?, reps?, sec?, why }
 */
export function nextPrescription(S, cfg, routine, profile) {
  const mode = modeOf(cfg);
  const policy = policyOf(cfg, routine, mode);
  if (policy === 'off') return { kind: 'off' };
  const ss = sessionsFor(S, cfg.id, cfg);
  const last = ss[ss.length - 1];
  if (!last) return { kind: 'first', why: 'primeira vez: comece leve e anote como foi' };
  const careful = profile && (isSenior(profile) || profile.level !== 'regular');

  // Effort rating decides when there are no numbers; a hard session (5) always backs off.
  const eff = last.effort;
  if (mode === 'time') {
    const cur = last.goal || cfg.sec || 20;
    const cap = careful ? 45 : 90;
    if (eff === 5) return { kind: 'deload', sec: Math.max(10, cur - 5), why: 'foi pesado da última vez' };
    if (last.ok || eff === 1 || eff === 2) return cur >= cap ? { kind: 'hold', sec: cur, why: 'no teto: hora de dificultar (sem apoio, olhos fechados)' } : { kind: 'up', sec: cur + 5, why: 'aguentou o tempo todo' };
    if (stallCount(ss) >= DELOAD_AFTER.time) return { kind: 'deload', sec: Math.max(10, cur - 5), why: 'vamos recuar e subir de novo' };
    return { kind: 'hold', sec: cur, why: 'mesmo tempo até sair limpo' };
  }

  const w = last.weight;
  const inc = cfg.inc > 0 ? cfg.inc : stepCapped(cfg.id, profile, w);
  const top = cfg.reps || last.goal || 12;
  const bottom = policy === 'double' ? Math.min(cfg.repsMin || Math.max(1, top - 4), top) : top;

  if (w <= 0) {   // bodyweight: progress in reps up to the top of the range, then a harder variation
    const goal = last.goal || top;
    if (eff === 5) return { kind: 'hold', weight: 0, reps: Math.max(bottom, goal - 2), why: 'foi pesado: um pouco menos hoje' };
    if (last.ok || eff === 1 || eff === 2) return goal >= top + 3
      ? { kind: 'hold', weight: 0, reps: goal, why: 'no teto: peça uma variação mais difícil (VARIAR)' }
      : { kind: 'up', weight: 0, reps: goal + 1, why: 'uma repetição a mais' };
    return { kind: 'hold', weight: 0, reps: goal, why: 'mesma meta até sair limpo' };
  }

  if (eff === 5) return { kind: 'deload', weight: deloadTo(w, inc), reps: bottom, why: 'foi pesado da última vez: -10 %' };
  const succeeded = last.ok || (last.unknown && (eff === 1 || eff === 2)) || (!last.unknown && (eff === 1 || eff === 2) && last.low >= bottom);
  if (succeeded) return { kind: 'up', weight: snap(w + inc, inc), reps: bottom, why: `+${String(inc).replace('.', ',')} kg` };
  if (!last.unknown && stallCount(ss) >= (DELOAD_AFTER[policy] || 3)) return { kind: 'deload', weight: deloadTo(w, inc), reps: bottom, why: 'vamos recuar e subir de novo' };
  const aim = policy === 'double' && !last.unknown ? Math.min(top, Math.max(bottom, last.low + 1)) : (last.unknown ? top : bottom);
  return { kind: 'hold', weight: w, reps: aim, why: last.unknown ? 'mesma carga: me diga como foi' : 'mesma carga, mais repetições' };
}

/** Weeks since the last workout — drives the "coming back" rules. */
export function weeksAway(S, today) {
  const last = (S.workouts || []).map(w => w.d).sort().pop();
  if (!last) return 0;
  return Math.floor((Date.parse(today) - Date.parse(last)) / (7 * 86400000));
}

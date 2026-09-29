/* Plan builder for the WhatsApp assistant.
 *
 * Same idea as frontend/src/lib/autoplan.js (a split filled from movement slots), with the
 * rules a conversation-first coach needs on top: the equipment actually photographed, the
 * user's age and activity level, and health conditions. Output is plain openGym state
 * (routines, week, customEx), so the web app shows the same plan.
 *
 * Guidance followed (orientation, not medical prescription):
 *  - WHO 2020: adults — muscle-strengthening ≥ 2 days/week; older adults — add balance work
 *    (multicomponent activity) ≥ 3 days/week to prevent falls.
 *  - ACSM: sedentary / older beginners start light (2 sets, 12–15 reps, far from failure) and
 *    progress slowly; legs and balance first (sit-to-stand, stepping, single-leg stance).
 *  - Hypertension: moderate loads, no breath-holding, no sets to failure.
 *  - Knee pain: avoid deep loaded squats/lunges/jumps; back pain: avoid loaded spinal flexion
 *    and heavy hinges — machine and supported variations instead.
 */
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

export const EX = JSON.parse(readFileSync(new URL('./exercises.json', import.meta.url), 'utf8'));
const uid = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');

// Exercises the library lacks but beginners over 50 need most. Created as the user's own
// custom exercises (no animation) — the app already supports those end to end.
export const CUSTOM = {
  sitstand: { id: 'cx-sitstand', n: 'Sentar e levantar da cadeira', bp: 'upper legs', desc: 'Sente-se na ponta de uma cadeira firme, pés no chão na largura do quadril. Levante sem usar as mãos (ou com apoio leve) e sente devagar. Mantenha o peito aberto.' },
  balance: { id: 'cx-balance', n: 'Equilíbrio em um pé só', bp: 'lower legs', desc: 'Em pé ao lado de uma parede ou cadeira para apoio, tire um pé do chão e mantenha a posição. Troque de perna. Olhe para um ponto fixo.' }
};

// Candidates per movement slot, best first. The first one whose equipment the user has wins.
const SLOTS = {
  sitstand: ['cx-sitstand'],
  balance: ['cx-balance'],
  squat: ['0043', '1760', '3132'],            // barbell squat · goblet squat · supported squat
  squatSafe: ['0739', '0431', '3013'],        // knee/back friendly: leg press · step-up · glute bridge
  hinge: ['0085', '1459', '3013'],            // romanian deadlift (barbell/dumbbell) · glute bridge
  hingeSafe: ['0586', '3013'],                // lying leg curl · glute bridge
  legs2: ['0739', '0336', '1460'],            // leg press · dumbbell lunge · walking lunge
  legs2Safe: ['0739', '0431', '3013'],
  legcurl: ['0586', '0431', '2368'],
  legext: ['0585'],
  calf: ['0605', '0417', '1373'],
  hpush: ['0025', '0577', '0289', '0662'],    // bench press · chest press machine · dumbbell bench · push-up
  hpushEasy: ['0577', '0289', '0493'],        // chest press machine · dumbbell bench · incline push-up
  ipush: ['0314', '0493'],
  vpush: ['0426', '0405'],
  hpull: ['0861', '0292', '0499'],            // cable row · one-arm dumbbell row · inverted row
  vpull: ['2330', '0375', '1326'],            // lat pulldown · dumbbell pullover · chin-up
  lateral: ['0334'],
  rear: ['0383'],
  biceps: ['0031', '0294'],
  triceps: ['0201', '0430', '0129'],
  core: ['0274'],
  core2: ['0472', '0276'],
  coreSafe: ['0276']                          // dead bug: no spinal flexion under load
};
const COMPOUND = new Set(['squat', 'squatSafe', 'hinge', 'hingeSafe', 'legs2', 'legs2Safe', 'hpush', 'hpushEasy', 'ipush', 'vpush', 'hpull', 'vpull', 'sitstand']);

const R = {
  seniorA: ['Força e equilíbrio A', 'legs', ['sitstand', 'legs2Safe', 'hpushEasy', 'hpull', 'balance', 'calf', 'coreSafe']],
  seniorB: ['Força e equilíbrio B', 'legs', ['squatSafe', 'hpull', 'hingeSafe', 'hpushEasy', 'balance', 'calf', 'coreSafe']],
  fullA: ['Corpo inteiro A', 'figureStrength', ['squat', 'hpush', 'hpull', 'hinge', 'lateral', 'core', 'calf']],
  fullB: ['Corpo inteiro B', 'figureStrength', ['hinge', 'vpush', 'vpull', 'legs2', 'biceps', 'triceps', 'core2']],
  fullC: ['Corpo inteiro C', 'figureStrength', ['legs2', 'ipush', 'hpull', 'legcurl', 'rear', 'core', 'calf']],
  upperA: ['Membros superiores A', 'arm', ['hpush', 'hpull', 'vpush', 'vpull', 'lateral', 'triceps', 'biceps']],
  upperB: ['Membros superiores B', 'arm', ['ipush', 'vpull', 'hpull', 'vpush', 'rear', 'biceps', 'triceps']],
  lowerA: ['Membros inferiores A', 'legs', ['squat', 'hinge', 'legcurl', 'legext', 'calf', 'core', 'core2']],
  lowerB: ['Membros inferiores B', 'legs', ['hinge', 'legs2', 'squat', 'legcurl', 'calf', 'core2', 'core']],
  push: ['Treino Push', 'barbell', ['hpush', 'vpush', 'ipush', 'lateral', 'triceps', 'core', 'calf']],
  pull: ['Treino Pull', 'pullup', ['vpull', 'hpull', 'rear', 'biceps', 'core2', 'hinge', 'calf']],
  legs: ['Treino de Pernas', 'legs', ['squat', 'hinge', 'legs2', 'legcurl', 'legext', 'calf', 'core']]
};

// Equipment categories (library `eq` values) a setup gives access to.
const SETUP_EQ = {
  gym: null,                                   // everything
  home: ['dumbbell', 'body weight', 'band', 'resistance band', 'stability ball', 'kettlebell'],
  bodyweight: ['body weight']
};
export const EQUIPMENT_KEYS = [...new Set(Object.values(EX).map(e => e.eq))].sort();

export function allowedEquipment(profile) {
  if (Array.isArray(profile.equipment) && profile.equipment.length)
    return new Set([...profile.equipment, 'body weight']);
  const base = SETUP_EQ[profile.setup] ?? null;
  return base ? new Set(base) : null;
}

// Beginner over 50, or anyone 65+: legs and balance first.
export const isSenior = p => (p.age >= 65) || (p.age >= 50 && p.level === 'sedentary');

export function splitFor(p) {
  const d = Math.min(6, Math.max(2, (p.days || []).length || 3));
  if (isSenior(p)) return d >= 3 ? ['seniorA', 'seniorB', 'seniorA'].slice(0, Math.min(d, 3)) : ['seniorA', 'seniorB'];
  if (d === 2) return ['fullA', 'fullB'];
  if (d === 3) return p.level === 'regular' ? ['push', 'pull', 'legs'] : ['fullA', 'fullB', 'fullC'];
  if (d === 4) return ['upperA', 'lowerA', 'upperB', 'lowerB'];
  if (d === 5) return ['push', 'pull', 'legs', 'upperA', 'lowerA'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
}

export function exercisesFor(p) {
  const m = p.sessionMin || (isSenior(p) ? 30 : 45);
  return m <= 30 ? 5 : m <= 45 ? 5 : m <= 60 ? 6 : 7;
}

export function doseFor(p, compound) {
  if (isSenior(p) || p.level === 'sedentary') return { sets: 2, reps: 15, repsMin: 10, prog: 'double' };
  const sets = compound && p.level === 'regular' ? 4 : 3;
  // Hypertension: no heavy low-rep work — strength goals train in the moderate 8–12 range.
  if (p.goal === 'strength' && !(p.conditions || []).includes('hypertension'))
    return compound ? { sets, reps: 5, prog: 'linear' } : { sets: 3, reps: 10, repsMin: 8, prog: 'double' };
  if (p.goal === 'muscle' || p.goal === 'strength') return { sets, reps: 12, repsMin: 8, prog: 'double' };
  return { sets, reps: 15, repsMin: 10, prog: 'double' };
}

// Slot substitutions for conditions.
function slotFor(slot, cond) {
  if (cond.includes('knee')) {
    if (slot === 'squat') return 'squatSafe';
    if (slot === 'legs2') return 'legs2Safe';
  }
  if (cond.includes('back')) {
    if (slot === 'squat') return 'squatSafe';
    if (slot === 'hinge') return 'hingeSafe';
    if (slot === 'core' || slot === 'core2') return 'coreSafe';
  }
  return slot;
}

/**
 * profile: { age, sex, level: 'sedentary'|'returning'|'regular', goal, setup, equipment?,
 *            days: [weekday 0-6], sessionMin?, conditions: [...] }
 * returns { routines, week, customEx }
 */
export function buildPlan(p) {
  const cond = p.conditions || [];
  const allowed = allowedEquipment(p);
  const has = id => {
    if (id.startsWith('cx-')) return true;
    const e = EX[id];
    return !!e && (!allowed || allowed.has(e.eq));
  };
  const keys = splitFor(p);
  const days = pickDays(p.days, keys.length);
  const per = exercisesFor(p);
  const built = {}, routines = [], week = {}, customEx = [];
  keys.forEach((k, i) => {
    if (!built[k]) {
      const [name, emoji, slots] = R[k];
      const routineProg = doseFor(p, true).prog;
      const ex = [];
      for (const s0 of slots) {
        if (ex.length >= per) break;
        const s = slotFor(s0, cond);
        const id = (SLOTS[s] || []).find(c => has(c) && !ex.some(e => e.id === c));
        if (!id) continue;
        const d = doseFor(p, COMPOUND.has(s));
        const entry = { id, sets: d.sets, reps: d.reps, weight: 0,
          ...(d.repsMin ? { repsMin: d.repsMin } : {}),
          ...(d.prog !== routineProg ? { prog: d.prog } : {}) };
        if (id === 'cx-balance') { delete entry.reps; delete entry.repsMin; Object.assign(entry, { mode: 'time', sec: 20, prog: 'time' }); }
        const c = Object.values(CUSTOM).find(x => x.id === id);
        if (c && !customEx.some(x => x.id === id)) customEx.push({ ...c, tg: '', eq: 'custom', custom: true });
        ex.push(entry);
      }
      built[k] = { id: uid(), name, emoji, prog: routineProg, auto: true, ex };
      routines.push(built[k]);
    }
    week[days[i]] = built[k].id;
  });
  return { routines, week, customEx };
}
const DEFAULT_DAYS = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] };
// The user's available days, Monday-first; when they offer more days than the plan needs
// (a beginner capped at 3), spread the sessions across them instead of bunching them up.
export function pickDays(avail, n) {
  const mon = d => (d + 6) % 7;
  const a = [...new Set((avail || []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((x, y) => mon(x) - mon(y));
  if (a.length === n) return a;
  if (a.length > n) return Array.from({ length: n }, (_, i) => a[Math.round(i * (a.length - 1) / Math.max(1, n - 1))]);
  return DEFAULT_DAYS[n];
}

// Display name of any exercise id in pt-BR (library or custom).
export const exName = (id, S) =>
  EX[id]?.pt || (S?.customEx || []).find(c => c.id === id)?.n || Object.values(CUSTOM).find(c => c.id === id)?.n || id;

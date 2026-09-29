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
// Two candidate lists per slot: `pro` for people who already train (free weights first) and
// `easy` for beginners, returners and seniors (machines and supported variations first, then
// dumbbells, then bodyweight). The first candidate the user's equipment allows wins.
const SLOTS = {
  sitstand: { easy: ['cx-sitstand'] },
  balance: { easy: ['cx-balance'] },
  squat: { pro: ['0043', '1760', '0291'], easy: ['0739', '1760', '0291', '2803'] },          // barbell squat · goblet · bench squat | leg press · goblet · bench squat · supported
  squatSafe: { pro: ['0739', '0431', '3013'], easy: ['0739', '0431', '0291', '3013'] },        // knee/back friendly: leg press · step-up · bench squat · glute bridge
  hinge: { pro: ['0085', '1459', '3013'], easy: ['0599', '1459', '3013'] },                  // romanian deadlift | seated leg curl · dumbbell RDL · glute bridge
  hingeSafe: { pro: ['0599', '3013'], easy: ['0599', '3013', '1422'] },                        // seated leg curl · glute bridge · pelvic tilt bridge
  legs2: { pro: ['0739', '0336', '0431'], easy: ['0739', '0431', '2368'] },                  // leg press · lunge · step-up | leg press · step-up · split squat
  legs2Safe: { pro: ['0739', '0431', '3013'], easy: ['0739', '0431', '3013'] },
  legcurl: { pro: ['0599', '0586', '0431'], easy: ['0599', '0431', '2368'] },                 // seated leg curl first (prone is awkward past 65)
  legext: { pro: ['0585'], easy: ['0585'] },
  hipabd: { easy: ['0597', '0710'] },                                                          // hip abduction (machine / bodyweight) — hip stability for seniors
  calf: { pro: ['0605', '0417', '1373'], easy: ['0605', '0417', '1373'] },
  hpush: { pro: ['0025', '0289', '0662'], easy: ['0577', '0289', '0493'] },                  // bench press · dumbbell bench · push-up | chest press machine · dumbbell bench · incline push-up
  hpushEasy: { easy: ['0577', '0289', '0493'] },
  ipush: { pro: ['0314', '0493'], easy: ['0314', '0493'] },
  vpush: { pro: ['0426', '0405'], easy: ['0603', '0405'] },                                  // standing OHP · seated DB press | shoulder press machine · seated DB press
  hpull: { pro: ['0861', '0292', '0499'], easy: ['1350', '0861', '0327', '3144', '0988'] },  // cable row · 1-arm DB row · inverted row | seated row machine · cable row · chest-supported DB row · band rows
  vpull: { pro: ['2330', '0375', '1326'], easy: ['2330', '1431', '0375', '0974', '3116'] },  // lat pulldown · pullover · chin-up | lat pulldown · assisted chin-up · pullover · band pulldowns
  carry: { easy: ['2133'] },                                                                   // farmer's walk — grip + gait
  lateral: { pro: ['0334'], easy: ['0334'] },
  rear: { pro: ['0383'], easy: ['0383'] },
  biceps: { pro: ['0031', '0294'], easy: ['0294'] },
  triceps: { pro: ['0201', '0430'], easy: ['0201', '0430'] },                                // no bench dips: shoulder-unfriendly
  core: { pro: ['0274', '0276'], easy: ['0276', '0979'] },                                   // crunch | dead bug · Pallof press
  core2: { pro: ['0472', '0276'], easy: ['0979', '0276'] },
  coreSafe: { pro: ['0276', '0979'], easy: ['0276', '0979'] }                                // no loaded spinal flexion
};
const COMPOUND = new Set(['squat', 'squatSafe', 'hinge', 'hingeSafe', 'legs2', 'legs2Safe', 'hpush', 'hpushEasy', 'ipush', 'vpush', 'hpull', 'vpull', 'sitstand']);

const R = {
  seniorA: ['Força e equilíbrio A', 'legs', ['sitstand', 'legs2Safe', 'hpushEasy', 'hpull', 'balance', 'carry', 'calf', 'coreSafe']],
  seniorB: ['Força e equilíbrio B', 'legs', ['squatSafe', 'hpull', 'hingeSafe', 'hpushEasy', 'balance', 'hipabd', 'calf', 'coreSafe']],
  fullA: ['Corpo inteiro A', 'figureStrength', ['squat', 'hpush', 'hpull', 'hinge', 'vpush', 'core', 'calf', 'lateral']],
  fullB: ['Corpo inteiro B', 'figureStrength', ['hinge', 'vpull', 'legs2', 'ipush', 'hpull', 'core2', 'calf', 'biceps']],
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

// Strength days a profile gets. Beginners (sedentary / returning) and seniors are capped at 3:
// more days of lifting is not more progress for them, and the days they offered beyond that
// become walking days (WHO: 150–300 min/week of aerobic activity).
export const MAX_STRENGTH_DAYS = p => (isSenior(p) || p.level !== 'regular' ? 3 : 6);
export function strengthDays(p) {
  return Math.min(MAX_STRENGTH_DAYS(p), Math.max(2, (p.days || []).length || 3));
}
export function splitFor(p) {
  const d = strengthDays(p);
  if (isSenior(p)) return d >= 3 ? ['seniorA', 'seniorB', 'seniorA'] : ['seniorA', 'seniorB'];
  if (d === 2) return ['fullA', 'fullB'];
  if (d === 3) return p.level === 'regular' ? ['fullA', 'fullB', 'fullC'] : ['fullA', 'fullB', 'fullC'];
  if (d === 4) return ['upperA', 'lowerA', 'upperB', 'lowerB'];
  if (d === 5) return ['push', 'pull', 'legs', 'upperA', 'lowerA'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
}

export function exercisesFor(p) {
  const m = p.sessionMin || (isSenior(p) ? 30 : 45);
  const n = m <= 30 ? 5 : m <= 45 ? 5 : m <= 60 ? 6 : 7;
  // Two days a week has to cover the whole body each time: one more slot, and the templates
  // for 2 days are compound-only, so the extra slot is a big lift rather than an isolation.
  return strengthDays(p) === 2 ? n + 1 : n;
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

// Slot substitutions for conditions (a slot can end up removed: null).
function slotFor(slot, cond) {
  if (cond.includes('knee') || cond.includes('hip')) {
    if (slot === 'squat') return 'squatSafe';
    if (slot === 'legs2') return 'legs2Safe';
  }
  if (cond.includes('back') || cond.includes('osteoporosis')) {
    if (slot === 'squat') return 'squatSafe';
    if (slot === 'hinge') return 'hingeSafe';
    if (slot === 'core' || slot === 'core2') return 'coreSafe';
  }
  if (cond.includes('shoulder') && (slot === 'vpush' || slot === 'ipush')) return null;
  return slot;
}
// Exercise ids never given to a condition, whatever the slot.
const BANNED = {
  knee: ['0043', '1460', '2368', '0336', '0053', '0514'],            // deep loaded squats, lunges, jumps
  hip: ['3132', '2803', '0710', '0597', '1460'],                     // deep flexion, adduction/abduction, lunges (prosthesis)
  back: ['0032', '0085', '0043', '0274', '0472', '0027'],             // heavy hinges, loaded flexion
  osteoporosis: ['0274', '0472', '0211', '0849', '0850'],             // spinal flexion / rotation under load
  shoulder: ['0426', '0129', '0025', '1326'],                         // overhead barbell, dips, barbell bench, chin-ups
  obesity: ['1460', '0514', '0513', '1160', '0630', '0662', '0274'],  // impact, floor-based
  vertigo: ['0274', '3013', '1422', '0276']                           // fast down-and-up from the floor
};

/**
 * profile: { age, sex, level: 'sedentary'|'returning'|'regular', goal, setup, equipment?,
 *            days: [weekday 0-6], sessionMin?, conditions: [...] }
 * returns { routines, week, customEx }
 */
export function buildPlan(p) {
  const cond = [...(p.conditions || [])];
  if (p.bmi >= 35 && !cond.includes('obesity')) cond.push('obesity');
  const banned = new Set(cond.flatMap(c => BANNED[c] || []));
  const allowed = allowedEquipment(p);
  const tier = isSenior(p) || p.level !== 'regular' ? 'easy' : 'pro';
  const has = id => {
    if (banned.has(id)) return false;
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
        if (!s) continue;
        const cands = SLOTS[s] ? (SLOTS[s][tier] || SLOTS[s].easy || SLOTS[s].pro || []) : [];
        const id = cands.find(c => has(c) && !ex.some(e => e.id === c));
        if (!id) continue;
        const d = doseFor(p, COMPOUND.has(s));
        const entry = { id, sets: d.sets, reps: d.reps, weight: 0,
          ...(d.repsMin ? { repsMin: d.repsMin } : {}),
          ...(d.prog !== routineProg ? { prog: d.prog } : {}) };
        if (id === 'cx-balance') { delete entry.reps; delete entry.repsMin; Object.assign(entry, { mode: 'time', sec: 20, prog: 'time' }); }
        if (id === '2133') { delete entry.reps; delete entry.repsMin; Object.assign(entry, { mode: 'time', sec: 30, prog: 'time' }); }
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

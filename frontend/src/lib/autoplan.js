// Automatic plan from the onboarding profile — no AI, no server, works on every instance.
//
// A plan is a split (which routines, how many a week) filled from movement slots. Each slot
// names one exercise per training setup, so the same template yields a gym, a dumbbells-at-home
// or a bodyweight plan; a slot with nothing for a setup is simply skipped. Slots are listed in
// priority order and the session length decides how many survive, so a 30-minute session keeps
// the big compound lifts and drops the accessories first.
//
// Everything here is a pure function of the profile: the caller persists the result.

import { uid } from './format.js'
import { t } from './i18n.js'
import { EXIDX } from './exercises.js'

// Setups offered in the onboarding. Keys stored in the profile.
export const SETUPS = ['gym', 'home', 'bodyweight']

// [gym, home (dumbbells + bench), bodyweight] — null when the setup has nothing sensible.
const SLOT = {
  squat: ['0043', '1760', '1685'],   // barbell full squat · dumbbell goblet squat · squat to overhead reach
  hinge: ['0085', '1459', '3013'],   // romanian deadlift (barbell / dumbbell) · glute bridge on floor
  legs2: ['0739', '0336', '1460'],   // 45° leg press · dumbbell lunge · walking lunge
  legcurl: ['0586', '0431', '2368'], // lying leg curl · dumbbell step-up · split squats
  legext: ['0585', null, null],      // leg extension
  calf: ['0605', '0417', '1373'],    // standing calf raise (machine / dumbbell / bodyweight)
  hpush: ['0025', '0289', '0662'],   // bench press (barbell / dumbbell) · push-up
  ipush: ['0314', '0314', '0493'],   // dumbbell incline bench press · incline push-up
  vpush: ['0426', '0405', null],     // standing overhead press · seated dumbbell shoulder press
  hpull: ['0861', '0292', '0499'],   // cable seated row · one-arm dumbbell row · inverted row
  vpull: ['2330', '0375', '1326'],   // lat pulldown · dumbbell pullover · chin-up
  lateral: ['0334', '0334', null],   // dumbbell lateral raise
  rear: ['0383', '0383', null],      // dumbbell reverse fly
  biceps: ['0031', '0294', null],    // barbell curl · dumbbell curl
  triceps: ['0201', '0430', '0129'], // cable pushdown · dumbbell triceps extension · bench dip
  core: ['0274', '0274', '0274'],    // crunch floor
  core2: ['0472', '0276', '0276']    // hanging leg raise · dead bug
}
const COMPOUND = new Set(['squat', 'hinge', 'legs2', 'hpush', 'ipush', 'vpush', 'hpull', 'vpull'])

// Routine templates: English name (translated at build time), glyph, slots by priority.
const R = {
  fullA: ['Full body A', 'figureStrength', ['squat', 'hpush', 'hpull', 'hinge', 'lateral', 'core', 'calf']],
  fullB: ['Full body B', 'figureStrength', ['hinge', 'vpush', 'vpull', 'legs2', 'biceps', 'triceps', 'core2']],
  fullC: ['Full body C', 'figureStrength', ['legs2', 'ipush', 'hpull', 'legcurl', 'rear', 'core', 'calf']],
  upperA: ['Upper body A', 'arm', ['hpush', 'hpull', 'vpush', 'vpull', 'lateral', 'triceps', 'biceps']],
  upperB: ['Upper body B', 'arm', ['ipush', 'vpull', 'hpull', 'vpush', 'rear', 'biceps', 'triceps']],
  lowerA: ['Lower body A', 'legs', ['squat', 'hinge', 'legcurl', 'legext', 'calf', 'core', 'core2']],
  lowerB: ['Lower body B', 'legs', ['hinge', 'legs2', 'squat', 'legcurl', 'calf', 'core2', 'core']],
  push: ['Push Day', 'barbell', ['hpush', 'vpush', 'ipush', 'lateral', 'triceps', 'core', 'calf']],
  pull: ['Pull Day', 'pullup', ['vpull', 'hpull', 'rear', 'biceps', 'core2', 'hinge', 'calf']],
  legs: ['Leg Day', 'legs', ['squat', 'hinge', 'legs2', 'legcurl', 'legext', 'calf', 'core']]
}

// Which routines, in week order, for a number of training days and an experience level.
// Newcomers get full-body sessions (every muscle often, few exercises to learn).
export function splitFor(days, experience) {
  const d = Math.min(6, Math.max(2, Math.round(days) || 3))
  if (d === 2) return ['fullA', 'fullB']
  if (d === 3) return experience === 'regular' ? ['push', 'pull', 'legs'] : ['fullA', 'fullB', 'fullC']
  if (d === 4) return ['upperA', 'lowerA', 'upperB', 'lowerB']
  if (d === 5) return ['push', 'pull', 'legs', 'upperA', 'lowerA']
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs']
}

// Default weekdays (0 = Sunday) for a number of days, spread so no muscle group trains two
// days running where it can be avoided.
const DEFAULT_DAYS = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] }
export function daysFor(n, preferred) {
  const d = Math.min(6, Math.max(2, Math.round(n) || 3))
  const p = [...new Set((preferred || []).filter(x => Number.isInteger(x) && x >= 0 && x <= 6))]
  if (p.length === d) return p.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))   // Monday-first
  return DEFAULT_DAYS[d]
}

// Exercises per session by length, counting ~8–10 minutes per exercise with rest.
export function exercisesFor(sessionMin) {
  const m = Number(sessionMin) || 45
  return m <= 30 ? 4 : m <= 45 ? 5 : m <= 60 ? 6 : 7
}

// Sets, reps and progression policy for one exercise from goal + experience.
export function doseFor(goal, experience, compound) {
  const sets = experience === 'new' ? 3 : compound && experience === 'regular' ? 4 : 3
  if (goal === 'strength') return compound
    ? { sets, reps: 5, prog: 'linear' }
    : { sets: 3, reps: 10, repsMin: 8, prog: 'double' }
  if (goal === 'muscle') return { sets, reps: 12, repsMin: 8, prog: 'double' }
  if (goal === 'endurance') return { sets: Math.min(sets, 3), reps: 20, repsMin: 15, prog: 'double' }
  // fatloss / general
  return { sets, reps: 15, repsMin: 10, prog: 'double' }
}

/**
 * Build routines + week assignment from a profile.
 * profile: { goal, experience, daysPerWeek, preferredDays, sessionMin, setup }
 * returns { routines: [...], week: { weekday: routineId } }
 */
export function buildPlan(profile) {
  const p = profile || {}
  const col = Math.max(0, SETUPS.indexOf(p.setup))
  const perSession = exercisesFor(p.sessionMin)
  const keys = splitFor(p.daysPerWeek, p.experience)
  const days = daysFor(keys.length, p.preferredDays)

  // A split that repeats a routine (6 days = PPL twice) reuses the same routine object, so
  // progress on "Push" is one history, not two half-histories.
  const built = {}
  const routines = []
  const week = {}
  keys.forEach((k, i) => {
    if (!built[k]) {
      const [name, emoji, slots] = R[k]
      const routineProg = doseFor(p.goal, p.experience, true).prog
      const ex = []
      for (const s of slots) {
        if (ex.length >= perSession) break
        const id = SLOT[s][col]
        if (!id || !EXIDX[id] || ex.some(e => e.id === id)) continue
        const dose = doseFor(p.goal, p.experience, COMPOUND.has(s))
        // Bodyweight moves need no special case: the progression engine adds reps when there
        // is no load, whatever the policy.
        ex.push({ id, sets: dose.sets, reps: dose.reps, weight: 0,
          ...(dose.repsMin ? { repsMin: dose.repsMin } : {}),
          ...(dose.prog !== routineProg ? { prog: dose.prog } : {}) })
      }
      built[k] = { id: uid(), name: t(name), emoji, prog: routineProg, auto: true, ex }
      routines.push(built[k])
    }
    week[days[i]] = built[k].id
  })
  return { routines, week }
}

// Week / month progress summaries for Home — the "what did my training get me" view.
// Pure functions over the state object S; everything is derived from logged workouts and
// weigh-ins, nothing is stored.

import { isoOf, weekKey } from './format.js'
import { setsDone, lastBW } from './history.js'
import { bestSetOf } from './onerm.js'

// MET for general resistance training (Compendium of Physical Activities, "weight lifting,
// moderate/vigorous effort" ≈ 3.5–6). A single middle value: the figure is shown as an
// estimate, never as a measurement.
export const STRENGTH_MET = 5

const LB = 0.45359237
export const kgOf = (w, unit) => (unit === 'lb' ? w * LB : w)

// Minutes a finished workout lasted (0 when it has no timestamps, e.g. an import).
export function workoutMinutes(w) {
  return w.start && w.end && w.end > w.start ? (w.end - w.start) / 60000 : 0
}

// Estimated kcal for a list of workouts: MET × body weight (kg) × hours.
export function estimateKcal(workouts, bwKg) {
  if (!(bwKg > 0)) return 0
  const min = workouts.reduce((a, w) => a + workoutMinutes(w), 0)
  return Math.round(STRENGTH_MET * bwKg * (min / 60))
}

function totals(ws) {
  return {
    count: ws.length,
    sets: ws.reduce((a, w) => a + setsDone(w), 0),
    volume: ws.reduce((a, w) => a + (w.vol || 0), 0),
    minutes: Math.round(ws.reduce((a, w) => a + workoutMinutes(w), 0)),
    prs: ws.reduce((a, w) => a + ((w.prs && w.prs.length) || 0), 0)
  }
}

// Percent change a → b, null when there is nothing to compare against.
export const pctChange = (prev, cur) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null)

// Planned sessions per week from the weekly schedule.
export const plannedPerWeek = S => Object.keys(S.week || {}).filter(k => S.week[k]).length

/** This week (Monday-based) vs last week. `today` is an ISO date. */
export function weekSummary(S, today) {
  const cur = weekKey(today)
  const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 7)
  const prev = weekKey(isoOf(d))
  const now = totals(S.workouts.filter(w => weekKey(w.d) === cur))
  const before = totals(S.workouts.filter(w => weekKey(w.d) === prev))
  const bw = lastBW(S)
  const kg = bw ? kgOf(bw.w, S.unit) : 0
  return {
    ...now,
    planned: plannedPerWeek(S),
    kcal: estimateKcal(S.workouts.filter(w => weekKey(w.d) === cur), kg),
    volumeChange: pctChange(before.volume, now.volume),
    prev: before
  }
}

// Best estimated 1RM per exercise over a list of workouts.
function bestE1RM(ws) {
  const best = {}
  ws.forEach(w => w.entries.forEach(e => {
    const b = bestSetOf(e)
    if (b && b.est > (best[e.id] || 0)) best[e.id] = b.est
  }))
  return best
}

/** Calendar month of `today` vs the month before. */
export function monthSummary(S, today) {
  const ym = today.slice(0, 7)
  const d = new Date(today.slice(0, 7) + '-15T12:00:00'); d.setMonth(d.getMonth() - 1)
  const pym = isoOf(d).slice(0, 7)
  const inMonth = S.workouts.filter(w => w.d.slice(0, 7) === ym)
  const now = totals(inMonth)
  const before = totals(S.workouts.filter(w => w.d.slice(0, 7) === pym))

  // Body weight: last weigh-in of the month against the last one before it started.
  const bwIn = S.bodyweight.filter(b => b.d.slice(0, 7) === ym)
  const bwBefore = S.bodyweight.filter(b => b.d < ym + '-01')
  const from = bwBefore.length ? bwBefore[bwBefore.length - 1] : bwIn[0]
  const to = bwIn.length ? bwIn[bwIn.length - 1] : null
  const bwChange = from && to && from !== to ? Math.round((to.w - from.w) * 10) / 10 : null

  // Biggest strength gain: best e1RM this month vs best ever before the month started.
  const earlier = bestE1RM(S.workouts.filter(w => w.d < ym + '-01'))
  const thisMonth = bestE1RM(inMonth)
  let topGain = null
  for (const id of Object.keys(thisMonth)) {
    if (!(earlier[id] > 0)) continue
    const gain = Math.round((thisMonth[id] - earlier[id]) * 10) / 10
    if (gain > 0 && (!topGain || gain > topGain.gain)) topGain = { id, gain }
  }

  const bw = lastBW(S)
  return {
    ...now,
    kcal: estimateKcal(inMonth, bw ? kgOf(bw.w, S.unit) : 0),
    volumeChange: pctChange(before.volume, now.volume),
    countChange: now.count - before.count,
    bwChange,
    topGain,
    prev: before
  }
}

// Age in whole years from a birth year (the onboarding asks only the year).
export const ageOf = (birthYear, today) => {
  const y = Number(birthYear)
  return y > 1900 ? Number(today.slice(0, 4)) - y : null
}

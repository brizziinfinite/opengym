import { describe, it, expect } from 'vitest'
import { buildPlan, splitFor, daysFor, exercisesFor, doseFor } from './autoplan.js'
import { EXIDX } from './exercises.js'

const base = { goal: 'muscle', experience: 'new', daysPerWeek: 3, preferredDays: [], sessionMin: 45, setup: 'gym' }

describe('autoplan', () => {
  it('uses full-body sessions for newcomers and PPL for regulars on 3 days', () => {
    expect(splitFor(3, 'new')).toEqual(['fullA', 'fullB', 'fullC'])
    expect(splitFor(3, 'regular')).toEqual(['push', 'pull', 'legs'])
  })

  it('assigns one routine per training day, on the chosen days when they match', () => {
    const { routines, week } = buildPlan({ ...base, preferredDays: [2, 4, 6] })
    expect(Object.keys(week).map(Number).sort()).toEqual([2, 4, 6])
    expect(routines).toHaveLength(3)
    Object.values(week).forEach(id => expect(routines.some(r => r.id === id)).toBe(true))
  })

  it('falls back to spread-out days when the preferred ones do not match the count', () => {
    expect(daysFor(3, [1])).toEqual([1, 3, 5])
    expect(daysFor(4, [])).toEqual([1, 2, 4, 5])
  })

  it('reuses routines when the split repeats (6 days)', () => {
    const { routines, week } = buildPlan({ ...base, experience: 'regular', daysPerWeek: 6 })
    expect(routines).toHaveLength(3)
    expect(Object.keys(week)).toHaveLength(6)
  })

  it('fits the number of exercises to the session length', () => {
    expect(exercisesFor(30)).toBe(4)
    expect(exercisesFor(90)).toBe(7)
    const { routines } = buildPlan({ ...base, sessionMin: 30 })
    routines.forEach(r => expect(r.ex.length).toBeLessThanOrEqual(4))
  })

  it('only uses real exercises, and bodyweight-only plans need no equipment', () => {
    for (const setup of ['gym', 'home', 'bodyweight']) {
      for (const days of [2, 3, 4, 5, 6]) {
        const { routines } = buildPlan({ ...base, setup, daysPerWeek: days, experience: 'regular', sessionMin: 90 })
        routines.forEach(r => {
          expect(r.ex.length).toBeGreaterThanOrEqual(3)
          r.ex.forEach(e => expect(EXIDX[e.id]).toBeTruthy())
          expect(new Set(r.ex.map(e => e.id)).size).toBe(r.ex.length)
        })
        if (setup === 'bodyweight') routines.forEach(r => r.ex.forEach(e => expect(EXIDX[e.id].eq).toBe('body weight')))
      }
    }
  })

  it('doses by goal: heavy low reps for strength, ranges for hypertrophy', () => {
    expect(doseFor('strength', 'regular', true)).toEqual({ sets: 4, reps: 5, prog: 'linear' })
    expect(doseFor('muscle', 'new', true)).toMatchObject({ sets: 3, reps: 12, repsMin: 8, prog: 'double' })
    const { routines } = buildPlan({ ...base, goal: 'strength', experience: 'regular' })
    const acc = routines.flatMap(r => r.ex).find(e => e.prog === 'double')
    expect(acc).toBeTruthy()                     // accessories override the routine's linear policy
    expect(routines[0].prog).toBe('linear')
  })
})

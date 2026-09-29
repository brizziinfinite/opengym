import { describe, it, expect } from 'vitest'
import { weekSummary, monthSummary, estimateKcal, ageOf, pctChange } from './summary.js'

const set = (w, r) => ({ w, r, done: true })
const wo = (d, sets, min = 60, prs = []) => ({
  d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T10:00:00') + min * 60000, prs,
  entries: [{ id: '0025', sets }], vol: sets.reduce((a, s) => a + s.w * s.r, 0)
})
const S0 = (workouts, bodyweight = []) => ({ unit: 'kg', week: { 1: 'a', 3: 'b', 5: 'c' }, workouts, bodyweight })

describe('summary', () => {
  it('counts this week against last week', () => {
    const S = S0([wo('2026-09-21', [set(60, 10)]), wo('2026-09-28', [set(60, 10), set(60, 10)], 60, ['0025'])],
      [{ d: '2026-09-28', w: 80 }])
    const s = weekSummary(S, '2026-09-30')
    expect(s.count).toBe(1)
    expect(s.planned).toBe(3)
    expect(s.sets).toBe(2)
    expect(s.prs).toBe(1)
    expect(s.volumeChange).toBe(100)
    expect(s.kcal).toBe(400)   // 5 MET × 80 kg × 1 h
  })

  it('reports weight change and the biggest strength gain in the month', () => {
    const S = S0([wo('2026-08-20', [set(80, 5)]), wo('2026-09-10', [set(90, 5)])],
      [{ d: '2026-08-31', w: 82 }, { d: '2026-09-29', w: 80.5 }])
    const m = monthSummary(S, '2026-09-30')
    expect(m.count).toBe(1)
    expect(m.countChange).toBe(0)
    expect(m.bwChange).toBe(-1.5)
    expect(m.topGain.id).toBe('0025')
    expect(m.topGain.gain).toBeGreaterThan(0)
  })

  it('estimates nothing without a body weight', () => {
    expect(estimateKcal([wo('2026-09-28', [set(1, 1)])], 0)).toBe(0)
  })

  it('helpers', () => {
    expect(ageOf(1990, '2026-09-30')).toBe(36)
    expect(ageOf(null, '2026-09-30')).toBe(null)
    expect(pctChange(0, 10)).toBe(null)
  })
})

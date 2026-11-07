import { describe, it, expect } from 'vitest'
import { SPINNING_CLASSES, classById, durationSeconds, phaseAt, sessionElapsed, clock } from './spinning.js'

describe('spinning programs', () => {
  it('has unique program ids and usable phases', () => {
    expect(SPINNING_CLASSES).toHaveLength(4)
    expect(new Set(SPINNING_CLASSES.map(c => c.id)).size).toBe(4)
    for (const c of SPINNING_CLASSES) {
      expect(classById(c.id)).toBe(c)
      expect(durationSeconds(c)).toBeGreaterThan(0)
      expect(c.phases.every(p => p.seconds > 0 && p.rpe >= 1 && p.rpe <= 10)).toBe(true)
      expect(c.tracks.length).toBeGreaterThan(0)
    }
  })

  it('switches phases on the boundary, and clamps at the end', () => {
    const c = SPINNING_CLASSES[0]
    const first = c.phases[0].seconds
    expect(phaseAt(c, 0).index).toBe(0)
    expect(phaseAt(c, first - 1).index).toBe(0)
    expect(phaseAt(c, first).index).toBe(1)
    expect(phaseAt(c, -20).index).toBe(0)
    expect(phaseAt(c, durationSeconds(c) + 10).remaining).toBe(0)
    expect(phaseAt(null, 0)).toBeNull()
  })

  it('uses wall clock time, including after suspended tabs, and respects pauses', () => {
    expect(sessionElapsed({ elapsedSec: 50, running: true, runningSince: 1000 }, 7000)).toBe(56)
    expect(sessionElapsed({ elapsedSec: 50, running: false, runningSince: null }, 7000)).toBe(50)
    expect(sessionElapsed(null)).toBe(0)
    expect(sessionElapsed({ elapsedSec: 5, running: true, runningSince: 9000 }, 1000)).toBe(5)
  })

  it('formats seconds without rounding up', () => {
    expect(clock(59.9)).toBe('00:59')
    expect(clock(601)).toBe('10:01')
  })
})

import { describe, expect, it } from 'vitest'
import { SPINNING_CLASSES, durationSeconds } from './spinning.js'
import { SPINNING_VISUALS, visualForPhase, stageTimeline, suggestedTrackTimeline, suggestedTrackAt } from './spinning-visual.js'

describe('spinning visual coaching', () => {
  it('has six supported postures, with readable labels and unique keys', () => {
    expect(SPINNING_VISUALS).toHaveLength(6)
    expect(new Set(SPINNING_VISUALS.map(x => x.value)).size).toBe(6)
    for (const visual of SPINNING_VISUALS) {
      expect(visual.label.length).toBeGreaterThan(5)
      expect(visual.guidance.length).toBeGreaterThan(10)
    }
  })

  it('defaults existing stages conservatively and allows explicit posture selection', () => {
    expect(visualForPhase({ name: 'Aquecimento' }).value).toBe('warmup-seated')
    expect(visualForPhase({ name: 'Recuperação' }).value).toBe('recovery-seated')
    expect(visualForPhase({ name: 'Primeiras subidas' }).value).toBe('climb-seated')
    expect(visualForPhase({ name: 'Subida em pé' }).value).toBe('climb-standing')
    expect(visualForPhase({ name: 'Desafio de ritmo' }).value).toBe('tempo-seated')
    expect(visualForPhase({ name: 'Rota livre' }).value).toBe('steady-seated')
    expect(visualForPhase({ name: 'Aquecimento', visualKey: 'climb-standing' }).value).toBe('climb-standing')
    expect(visualForPhase({ name: 'Aquecimento', visualKey: 'unknown' }).value).toBe('warmup-seated')
    expect(visualForPhase(null).value).toBe('steady-seated')
  })

  it('maps every existing program to a continuous stage storyboard without changing durations', () => {
    for (const c of SPINNING_CLASSES) {
      const items = stageTimeline(c)
      expect(items).toHaveLength(c.phases.length)
      expect(items[0].start).toBe(0)
      expect(items.at(-1).end).toBe(durationSeconds(c))
      for (let i = 0; i < items.length; i++) {
        expect(items[i].visual).toBeDefined()
        expect(items[i].end).toBeGreaterThan(items[i].start)
        if (i) expect(items[i].start).toBe(items[i - 1].end)
      }
    }
    expect(stageTimeline(null)).toEqual([])
  })

  it('maps suggested songs to estimated slots without assuming Spotify playback', () => {
    for (const c of SPINNING_CLASSES) {
      const items = suggestedTrackTimeline(c)
      expect(items).toHaveLength(c.tracks.length)
      expect(items[0].start).toBe(0)
      expect(items.at(-1).end).toBe(durationSeconds(c))
      expect(suggestedTrackAt(c, 0).index).toBe(0)
      expect(suggestedTrackAt(c, durationSeconds(c) + 20).index).toBe(items.length - 1)
      expect(suggestedTrackAt(c, -10).index).toBe(0)
      for (const item of items) {
        expect(item.stage).toBeDefined()
        expect(item.visual).toBeDefined()
        expect(item.end).toBeGreaterThan(item.start)
      }
    }
    expect(suggestedTrackTimeline({ phases: [], tracks: [] })).toEqual([])
    expect(suggestedTrackAt({ phases: [], tracks: [] }, 0)).toBeNull()
  })
})

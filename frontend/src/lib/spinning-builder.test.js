import { describe, it, expect } from 'vitest'
import { GENRES, INTENSITIES, newTemplate, validateDraft } from './spinning-builder.js'
import { durationSeconds } from './spinning.js'

describe('Spinning teacher builder', () => {
  it('creates valid offline drafts at every duration and intensity', () => {
    for (const { value: genre } of GENRES) {
      for (const duration of [30,45,50,60]) {
        for (const { value: level, ceiling } of INTENSITIES) {
          const draft = newTemplate(genre, duration, level)
          expect(durationSeconds(draft)).toBe(duration * 60)
          expect(draft.phases.every(p => p.rpe <= ceiling)).toBe(true)
          expect(validateDraft(draft, duration)).toEqual([])
        }
      }
    }
  })

  it('requires exact summed duration', () => {
    const draft = newTemplate('mix', 50, 'moderate')
    draft.phases[0].seconds += 60
    expect(validateDraft(draft, 50).some(m => m.includes('exatamente'))).toBe(true)
  })

  it('accepts only Spotify/Apple Music HTTPS playlist links', () => {
    const draft = newTemplate('mix', 50, 'moderate')
    draft.playlistUrl = 'https://open.spotify.com/playlist/1'
    expect(validateDraft(draft, 50)).toEqual([])
    draft.playlistUrl = 'https://music.apple.com/br/playlist/a'
    expect(validateDraft(draft, 50)).toEqual([])
    draft.playlistUrl = 'javascript:alert(1)'
    expect(validateDraft(draft, 50).length).toBeGreaterThan(0)
    draft.playlistUrl = 'https://evil.example/playlist'
    expect(validateDraft(draft, 50).length).toBeGreaterThan(0)
  })
})

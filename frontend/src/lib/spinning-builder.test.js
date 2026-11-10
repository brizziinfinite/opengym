import { describe, it, expect } from 'vitest'
import { GENRES, INTENSITIES, AI_DURATIONS, initialBuilderSettings, newTemplate, playlistProvider, validateDraft } from './spinning-builder.js'
import { durationSeconds, SPINNING_CLASSES } from './spinning.js'

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

  it('preserves built-in real duration, music style and appropriate level when personalizing', () => {
    const styles = new Map(GENRES.map(x => [x.preset, x.value]))
    for (const preset of SPINNING_CLASSES) {
      const defaults = initialBuilderSettings(preset)
      expect(defaults.duration * 60).toBe(durationSeconds(preset))
      expect(defaults.style).toBe(styles.get(preset.id))
      const ceiling = INTENSITIES.find(x => x.value === defaults.level).ceiling
      expect(preset.phases.every(p => p.rpe <= ceiling)).toBe(true)
      expect(validateDraft(preset, defaults.duration)).toEqual([])
    }
    expect(initialBuilderSettings(null)).toEqual({ style: 'mix', duration: 50, level: 'moderate' })
    expect(AI_DURATIONS).toEqual([30, 45, 50, 60])
    expect(AI_DURATIONS.includes(53)).toBe(false)
    expect(AI_DURATIONS.includes(49)).toBe(false)
  })

  it('accepts an optional visual posture and rejects unknown identifiers', () => {
    const draft = newTemplate('mix', 50, 'moderate')
    expect(validateDraft(draft, 50)).toEqual([])
    draft.phases[0].visualKey = 'warmup-seated'
    expect(validateDraft(draft, 50)).toEqual([])
    draft.phases[0].visualKey = 'unknown-position'
    expect(validateDraft(draft, 50).some(message => message.includes('postura visual'))).toBe(true)
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
  it('recognizes only official external playlist URLs, not arbitrary external links', () => {
    expect(playlistProvider('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc')).toBe('Spotify')
    expect(playlistProvider('https://music.apple.com/br/playlist/minha-lista/pl.123')).toBe('Apple Music')
    for (const url of [
      'https://open.spotify.com/',
      'https://open.spotify.com/track/123',
      'https://open.spotify.com.evil.tld/playlist/123',
      'https://music.apple.com/br/album/123',
      'http://open.spotify.com/playlist/123',
      'javascript:alert(1)',
      'https://user:pass@open.spotify.com/playlist/123',
      'https://evil.example/playlist/123',
      'not a url'
    ]) expect(playlistProvider(url)).toBeNull()
  })

})

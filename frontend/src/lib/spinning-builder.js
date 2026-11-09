import { SPINNING_CLASSES, durationSeconds } from './spinning.js'

export const GENRES = [
  { value: 'mix', label: 'Mistura de décadas', preset: 'time-machine' },
  { value: 'dance', label: 'Dance 80/90', preset: 'dance-8090' },
  { value: 'rock', label: 'Rock Classics', preset: 'rock-classics' },
  { value: 'electronic', label: 'Eletrônico atual', preset: 'electronic' }
]
export const AI_DURATIONS = [30, 45, 50, 60]

// Built-in programs may run for 49/53 minutes and reach RPE 7. Starting their
// editor with a 50-minute or moderate-intensity assumption would make the
// untouched draft invalid and hide its real preset style.
export function initialBuilderSettings(initial) {
  return {
    style: initial?.style || GENRES.find(g => g.preset === initial?.id)?.value || 'mix',
    duration: initial ? durationSeconds(initial) / 60 : 50,
    level: initial?.level || (initial?.phases?.some(p => p.rpe > 6) ? 'challenging' : 'moderate')
  }
}

export const INTENSITIES = [
  { value: 'light', label: 'Leve', ceiling: 4 },
  { value: 'moderate', label: 'Moderada', ceiling: 6 },
  { value: 'challenging', label: 'Desafiadora, com recuperações', ceiling: 7 }
]

export function newTemplate(genre, durationMin, level) {
  const entry = GENRES.find(g => g.value === genre) || GENRES[0]
  const base = SPINNING_CLASSES.find(c => c.id === entry.preset) || SPINNING_CLASSES[0]
  const total = durationMin * 60
  const oldTotal = durationSeconds(base)
  let sum = 0
  const phases = base.phases.map((p, i) => {
    const sec = i === base.phases.length - 1 ? total - sum : Math.max(60, Math.round(total * p.seconds / oldTotal / 30) * 30)
    sum += sec
    const ceiling = INTENSITIES.find(x => x.value === level)?.ceiling || 6
    return { ...p, seconds: sec, rpe: Math.min(p.rpe, ceiling) }
  })
  return {
    title: base.title + ' — ' + durationMin + ' min',
    subtitle: base.subtitle, source: 'template',
    phases, tracks: base.tracks.map(x => x.slice()), playlistUrl: ''
  }
}

// Only official HTTPS playlist URLs can be persisted and opened outside Gyn.
// This prevents a pasted URL from becoming an arbitrary external destination.
export function playlistProvider(value) {
  if (!value || typeof value !== 'string' || value.length > 2048) return null
  try {
    const u = new URL(value.trim())
    if (u.protocol !== 'https:' || u.username || u.password) return null
    if (u.hostname === 'open.spotify.com' && /^\\/playlist\\/[a-zA-Z0-9]+\\/?$/.test(u.pathname)) return 'Spotify'
    if (u.hostname === 'music.apple.com' && /^\\/(?:[a-z]{2}\\/)?playlist\\/[^/]+\\/[^/]+\\/?$/i.test(u.pathname)) return 'Apple Music'
  } catch { /* invalid URL */ }
  return null
}

export function validateDraft(c, targetMin) {
  const errors = []
  if (!c || typeof c.title !== 'string' || !c.title.trim()) errors.push('Informe o nome da aula.')
  if (!Array.isArray(c?.phases) || c.phases.length < 3 || c.phases.length > 12) errors.push('Aula precisa de 3 a 12 etapas.')
  const total = (c?.phases || []).reduce((n, p) => n + (p.seconds || 0), 0)
  if (total !== targetMin * 60) errors.push('Soma das etapas deve ser exatamente ' + targetMin + ' minutos.')
  for (const p of c?.phases || []) {
    if (!Number.isInteger(p.seconds) || p.seconds < 60 || p.seconds > 1800) errors.push('Cada etapa deve durar entre 1 e 30 minutos.')
    const pair = String(p.rpm || '').split(/[–-]/).map(Number)
    if (pair.length !== 2 || !Number.isInteger(pair[0]) || !Number.isInteger(pair[1]) ||
        pair[0] < 55 || pair[1] > 105 || pair[1] < pair[0]) errors.push('RPM deve estar entre 55 e 105.')
    if (!Number.isInteger(p.rpe) || p.rpe < 2 || p.rpe > 8) errors.push('Esforço deve ficar de 2 a 8.')
    if (!p.name?.trim() || !p.cue?.trim()) errors.push('Todas as etapas precisam de nome e orientação.')
  }
  if (c?.playlistUrl && !playlistProvider(c.playlistUrl)) errors.push('Use um link de playlist do Spotify ou Apple Music.')
  return [...new Set(errors)]
}

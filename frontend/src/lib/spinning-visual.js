// Visual coaching is derived from the saved class stages. No Spotify timing,
// track metadata or playback is used to determine the current position.
import { durationSeconds, phaseAt } from './spinning.js'

export const SPINNING_VISUALS = [
  { value: 'warmup-seated', label: 'Aquecimento sentado', posture: 'Sentado', load: 'Leve', guidance: 'Sente-se com ombros relaxados e comece de maneira confortável.' },
  { value: 'steady-seated', label: 'Ritmo sentado', posture: 'Sentado', load: 'Confortável', guidance: 'Mantenha uma pedalada estável, com postura confortável.' },
  { value: 'climb-seated', label: 'Subida sentada', posture: 'Sentado', load: 'Moderada', guidance: 'Ajuste a resistência gradualmente e mantenha o controle da pedalada.' },
  { value: 'climb-standing', label: 'Subida em pé', posture: 'Em pé', load: 'Moderada', guidance: 'Se estiver confortável, levante-se com controle, sem forçar a cadência.' },
  { value: 'tempo-seated', label: 'Ritmo variável sentado', posture: 'Sentado', load: 'Variável', guidance: 'Siga as orientações do professor e respeite os momentos de recuperação.' },
  { value: 'recovery-seated', label: 'Recuperação sentada', posture: 'Sentado', load: 'Leve', guidance: 'Diminua a resistência e retome uma respiração confortável.' }
]

const visualMap = new Map(SPINNING_VISUALS.map(visual => [visual.value, visual]))
const DEFAULT_KEY = 'steady-seated'

export function visualForPhase(phase) {
  if (phase?.visualKey && visualMap.has(phase.visualKey)) return visualMap.get(phase.visualKey)
  // For existing classes, infer conservatively; do not assume standing or sprints
  // without an explicit mention. Existing user states require no migration.
  const name = String(phase?.name || '').toLocaleLowerCase('pt-BR')
  const cue = String(phase?.cue || '').toLocaleLowerCase('pt-BR')
  if (/recuper|desaceler|volta à calma|desaquec/.test(name)) return visualMap.get('recovery-seated')
  if (/aquec|início|inicio|prepara/.test(name)) return visualMap.get('warmup-seated')
  if (/em pé|em pe|standing|levant/.test(name) || (/pedale em pé|pedalar em pé/.test(cue) && !/não|evite/.test(cue))) return visualMap.get('climb-standing')
  if (/subid|montanh|colina/.test(name)) return visualMap.get('climb-seated')
  if (/interval|sprint|aceler|ritmo|reta|pico/.test(name)) return visualMap.get('tempo-seated')
  return visualMap.get(DEFAULT_KEY)
}

export function stageTimeline(classPlan) {
  if (!Array.isArray(classPlan?.phases)) return []
  let start = 0
  return classPlan.phases.map((stage, index) => {
    const end = start + (Number(stage.seconds) || 0)
    const item = { index, start, end, stage, visual: visualForPhase(stage) }
    start = end
    return item
  })
}

// The song list is only a suggestion: track duration/order may differ from the
// real linked playlist. Evenly divided slots are APPROXIMATIONS for displaying
// the visual storyboard, never a claim of synchronization with Spotify.
export function suggestedTrackTimeline(classPlan) {
  const tracks = Array.isArray(classPlan?.tracks) ? classPlan.tracks : []
  if (!classPlan?.phases?.length || !tracks.length) return []
  const total = durationSeconds(classPlan)
  if (!(total > 0)) return []
  return tracks.map((track, index) => {
    const start = Math.round(total * index / tracks.length)
    const end = Math.round(total * (index + 1) / tracks.length)
    const middle = phaseAt(classPlan, (start + end) / 2)
    return {
      index, start, end,
      title: Array.isArray(track) ? String(track[0] || 'Faixa sugerida') : 'Faixa sugerida',
      artist: Array.isArray(track) ? String(track[1] || '') : '',
      stage: middle?.phase || classPlan.phases[0],
      visual: visualForPhase(middle?.phase || classPlan.phases[0])
    }
  })
}

export function suggestedTrackAt(classPlan, elapsed) {
  const items = suggestedTrackTimeline(classPlan)
  if (!items.length) return null
  const total = durationSeconds(classPlan)
  const index = Math.min(items.length - 1, Math.max(0, Math.floor(Math.max(0, Math.min(Number(elapsed) || 0, total - 0.001)) / total * items.length)))
  return items[index]
}

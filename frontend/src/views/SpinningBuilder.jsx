import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { uid } from '../lib/format.js'
import { GENRES, INTENSITIES, AI_DURATIONS, initialBuilderSettings, newTemplate, validateDraft } from '../lib/spinning-builder.js'
import { clock } from '../lib/spinning.js'
import { Button, NumberField, SelectRow, TextField, TextArea, Check } from '../components/ui.jsx'

// Drafts remain local until the teacher approves them. The provider receives only
// duration, genre, and difficulty, never body weight, health history, or workout logs.
export default function SpinningBuilder({ initial = null, onSaved, onCancel }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const [style, setStyle] = useState(() => initialBuilderSettings(initial).style)
  const [duration, setDuration] = useState(() => initialBuilderSettings(initial).duration)
  const [level, setLevel] = useState(() => initialBuilderSettings(initial).level)
  const [draft, setDraft] = useState(initial ? JSON.parse(JSON.stringify(initial)) : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const consent = !!S.spinning?.aiConsent?.agreedAt
  const canAI = !!user && !!config?.coach?.enabled
  const levelCeiling = INTENSITIES.find(x => x.value === level)?.ceiling || 6
  // Preset programs have real durations (49/53 min), while AI generation accepts
  // only 30/45/50/60. Keep the source duration editable without submitting an
  // unsupported duration to the AI API.
  const durationOptions = AI_DURATIONS.includes(duration) ? AI_DURATIONS : [...AI_DURATIONS, duration].sort((a, b) => a - b)
  const aiDurationSupported = AI_DURATIONS.includes(duration)

  const edit = fn => setDraft(previous => {
    if (!previous) return previous
    const copy = JSON.parse(JSON.stringify(previous))
    fn(copy)
    return copy
  })

  function useTemplate() {
    setDraft(newTemplate(style, duration, level))
    setError('')
  }

  async function generateAI() {
    if (!canAI) return setError('A IA não está configurada nesta instalação. Use o modelo editável.')
    if (!consent) return setError('Autorize o uso de IA antes de gerar a aula.')
    if (!aiDurationSupported) return setError('Para gerar com IA, escolha 30, 45, 50 ou 60 minutos. O modelo manual permite manter a duração original.')
    setBusy(true)
    setError('')
    try {
      await useStore.getState().pushState()
      if (localStorage.getItem('gym_dirty') === '1') throw new Error('Não foi possível sincronizar a autorização para IA.')
      const result = await api('/api/spinning/generate', {
        method: 'POST', body: JSON.stringify({ duration, style, level })
      })
      let proposal = null
      // The API returns 202 immediately; polling avoids reverse-proxy timeouts.
      for (let i = 0; i < 70; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        const status = await api('/api/spinning/status?job=' + encodeURIComponent(result.job.id))
        if (status.job?.state === 'failed') throw new Error(status.job.error || 'A IA não conseguiu criar a aula.')
        if (status.job?.state === 'ready') { proposal = status.proposal; break }
      }
      if (!proposal) throw new Error('A IA demorou demais. Tente novamente.')
      setDraft({ ...proposal, playlistUrl: '' })
    } catch (e) { setError(e.message || 'Falha na geração da aula.') }
    finally { setBusy(false) }
  }

  function approve() {
    const errors = validateDraft(draft, duration)
    if (draft?.phases?.some(p => p.rpe > levelCeiling)) errors.push('A intensidade ultrapassou o nível escolhido.')
    if (errors.length) return setError(errors.join(' '))
    const item = { ...draft, style, level, id: initial?.id?.startsWith('spin-') ? initial.id : 'spin-' + uid(), createdAt: initial?.createdAt || Date.now(), updatedAt: Date.now() }
    update(s => {
      if (!s.spinning) s.spinning = { active: null, history: [] }
      if (!Array.isArray(s.spinning.classes)) s.spinning.classes = []
      const existing = s.spinning.classes.findIndex(x => x.id === item.id)
      if (existing >= 0) s.spinning.classes[existing] = item
      else s.spinning.classes.push(item)
    })
    setDraft(null)
    setError('')
    onSaved?.()
  }

  const changeSettings = (fn, value) => { fn(value); setDraft(null); setError('') }

  return <div className="card spin-builder" id="spinning-builder">
    <div className="row between" style={{ marginBottom: 12 }}>
      <h2 style={{ margin: 0 }}>{initial?.id?.startsWith('spin-') ? 'Editar aula' : initial ? 'Personalizar aula' : 'Criar aula de spinning'}</h2>
      <Button variant="ghost" size="sm" onClick={onCancel}>Fechar</Button>
    </div>
    <div className="sect-b">
      <SelectRow title="Estilo musical" sheetTitle="Escolha o estilo" value={style}
        options={GENRES} onChange={v => changeSettings(setStyle, v)} />
      <SelectRow title="Duração" value={duration} onChange={v => changeSettings(setDuration, v)}
        options={durationOptions.map(value => ({ value, label: value + ' min' }))} />
      <SelectRow title="Intensidade" value={level} onChange={v => changeSettings(setLevel, v)}
        options={INTENSITIES} />
    </div>
    <div style={{ height: 12 }} />
    <Button variant="tinted" icon="pencil" onClick={useTemplate}>Usar modelo editável</Button>
    <div style={{ height: 8 }} />
    {canAI && <>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
        <Check checked={consent} onChange={checked => update(s => {
          if (!s.spinning) s.spinning = { active: null, history: [] }
          s.spinning.aiConsent = checked ? { version: 1, agreedAt: Date.now() } : null
        })} />
        <div className="small muted">Autorizo enviar à IA somente duração, estilo e intensidade para sugerir um roteiro. Posso revogar aqui. Não são enviados dados de saúde nem histórico dos alunos.</div>
      </div>
      {!aiDurationSupported && <div className="small muted" style={{ marginBottom: 7 }}>IA disponível para 30, 45, 50 ou 60 minutos. Personalização manual mantém os {duration} minutos.</div>}
      <Button variant="primary" icon="sparkles" disabled={busy || !consent || !aiDurationSupported} onClick={generateAI}>
        {busy ? 'Gerando sugestão…' : 'Criar roteiro com IA'}
      </Button>
    </>}
    {!canAI && <div className="small muted" style={{ marginTop: 10 }}>A IA exige login e um provedor configurado no painel do Gyn. O modelo manual funciona sem IA.</div>}
    {error && <p role="alert" className="small" style={{ color: 'var(--red)', marginTop: 12 }}>{error}</p>}

    {draft && <div style={{ marginTop: 20 }}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Revisão do professor</h2>
        <span className="tag acc">{draft.source === 'ai' ? 'Sugestão IA' : 'Modelo'}</span>
      </div>
      <div className="small muted" style={{ marginBottom: 6 }}>Nome da aula</div>
      <TextField value={draft.title} maxLength={70} onChange={e => edit(c => { c.title = e.target.value })} />
      <div className="small muted" style={{ margin: '12px 0 6px' }}>Playlist externa (opcional)</div>
      <TextField value={draft.playlistUrl || ''} placeholder="https://open.spotify.com/playlist/..."
        onChange={e => edit(c => { c.playlistUrl = e.target.value })} />
      <p className="small muted">A playlist é aberta no aplicativo oficial do Spotify ou Apple Music. O professor volta ao Gyn para iniciar o roteiro; não há reprodução ou sincronização de áudio dentro do Gyn.</p>
      <div className="small muted" style={{ marginBottom: 10 }}>
        Ajuste tempo, cadência, esforço e comandos. A soma deve ser exatamente {duration} minutos.
      </div>
      {draft.phases.map((p, index) => {
        const parts = String(p.rpm).split(/[–-]/).map(Number)
        return <div className="card" key={index} style={{ marginBottom: 9, padding: 12 }}>
          <div className="small muted">Etapa {index + 1} de {draft.phases.length}</div>
          <TextField value={p.name} maxLength={70} aria-label={'Nome da etapa ' + (index + 1)}
            onChange={e => edit(c => { c.phases[index].name = e.target.value })} />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
            <label className="small muted">Minutos <NumberField decimal={false} value={Math.round(p.seconds / 60)}
              onChange={v => edit(c => { c.phases[index].seconds = Math.round(v) * 60 })} /></label>
            <label className="small muted">RPM mín <NumberField decimal={false} value={parts[0] || 65}
              onChange={v => edit(c => { c.phases[index].rpm = Math.round(v) + '–' + (parts[1] || 80) })} /></label>
            <label className="small muted">RPM máx <NumberField decimal={false} value={parts[1] || 80}
              onChange={v => edit(c => { c.phases[index].rpm = (parts[0] || 65) + '–' + Math.round(v) })} /></label>
            <label className="small muted">RPE <NumberField decimal={false} value={p.rpe}
              onChange={v => edit(c => { c.phases[index].rpe = Math.round(v) })} /></label>
          </div>
          <div className="small muted" style={{ margin: '9px 0 6px' }}>Comando do professor</div>
          <TextArea rows={2} value={p.cue} maxLength={250}
            onChange={e => edit(c => { c.phases[index].cue = e.target.value })} />
        </div>
      })}
      <div className="small muted" style={{ marginBottom: 12 }}>
        Duração atual: {clock(draft.phases.reduce((n, p) => n + p.seconds, 0))} / {clock(duration * 60)}
      </div>
      <Button variant="primary" icon="check" onClick={approve}>Aprovar e salvar aula</Button>
    </div>}
  </div>
}

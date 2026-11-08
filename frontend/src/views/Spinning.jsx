import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { beep, vibrate } from '../lib/sound.js'
import { uid } from '../lib/format.js'
import { confirmSheet } from '../sheets.jsx'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { SPINNING_CLASSES, durationSeconds, sessionElapsed, phaseAt, clock } from '../lib/spinning.js'
import SpinningBuilder from './SpinningBuilder.jsx'

// The professor opens a playlist in the provider's official app. Gyn guides the
// class independently, without streaming, playback control or track synchronization.
export default function Spinning() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [now, setNow] = useState(() => Date.now())
  const [showTracks, setShowTracks] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewMode, setViewMode] = useState('teacher')
  const [voice, setVoice] = useState(false)
  const spin = S.spinning || { active: null, history: [] }
  const active = spin.active
  const classes = [...SPINNING_CLASSES, ...(spin.classes || [])]
  const chosen = active ? classes.find(c => c.id === active.classId) : null
  const elapsed = active ? sessionElapsed(active, now) : 0
  const phase = chosen ? phaseAt(chosen, elapsed) : null
  const prevPhase = useRef(null)

  useEffect(() => {
    if (!showBuilder) return
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      document.getElementById('spinning-builder')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [showBuilder, editing?.id])

  useEffect(() => {
    if (!active?.running) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [active?.running])

  useEffect(() => {
    const currentKey = phase && active ? active.classId + ':' + phase.index : null
    if (active?.running && prevPhase.current && currentKey && prevPhase.current !== currentKey) {
      beep(S.sound, 880, 0.15)
      vibrate(100)
      if (voice && viewMode === 'teacher' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel()
          const utterance = new SpeechSynthesisUtterance(phase.phase.cue)
          utterance.lang = 'pt-BR'
          utterance.rate = 1
          window.speechSynthesis.speak(utterance)
        } catch { /* some platforms block synthesized speech */ }
      }
    }
    prevPhase.current = currentKey
  }, [active?.classId, active?.running, phase?.index, S.sound, voice, viewMode])

  function start(c) {
    if (S.active || active) return
    update(s => {
      if (!s.spinning) s.spinning = { active: null, history: [] }
      s.spinning.active = { classId: c.id, elapsedSec: 0, runningSince: Date.now(), running: true, startedAt: Date.now() }
    })
    setNow(Date.now())
  }

  function togglePause() {
    update(s => {
      const a = s.spinning?.active
      if (!a) return
      if (a.running) {
        a.elapsedSec = sessionElapsed(a, Date.now())
        a.running = false
        a.runningSince = null
      } else {
        a.running = true
        a.runningSince = Date.now()
      }
    })
    setNow(Date.now())
  }

  function finish() {
    if (!active || !chosen) return
    confirmSheet({
      title: 'Encerrar aula?',
      message: 'O tempo pedalado será salvo no histórico. A reprodução de música externa não é controlada pelo Gyn.',
      confirmText: 'Encerrar e salvar',
      onConfirm: () => {
        update(s => {
          const a = s.spinning?.active
          if (!a) return
          const c = [...SPINNING_CLASSES, ...(s.spinning?.classes || [])].find(x => x.id === a.classId)
          if (!c) { s.spinning.active = null; return }
          const seconds = Math.min(durationSeconds(c), Math.floor(sessionElapsed(a, Date.now())))
          if (seconds >= 60) {
            if (!Array.isArray(s.spinning.history)) s.spinning.history = []
            s.spinning.history.unshift({
              id: uid(), classId: c.id, title: c.title, startedAt: a.startedAt,
              endedAt: Date.now(), seconds
            })
            s.spinning.history = s.spinning.history.slice(0, 200)
          }
          s.spinning.active = null
        })
        setNow(Date.now())
      }
    })
  }

  return <div className="narrow">
    <div className="hdr">
      <div><h1>Spinning Studio</h1><div className="sub">Aulas para conduzir. Ritmo para evoluir.</div></div>
    </div>

    {!active ? <>
      {showBuilder && <SpinningBuilder key={editing?.id || 'new'} initial={editing} onSaved={() => { setShowBuilder(false); setEditing(null) }} onCancel={() => { setShowBuilder(false); setEditing(null) }} />}
      {S.active && <div className="card"><div className="small muted">Existe um treino de musculação em andamento. Encerre-o antes de iniciar uma aula de spinning.</div></div>}
      <section className="spin-hero" aria-label="Apresentação Spinning Studio">
        <div className="spin-eyebrow"><Icon name="sparkles" /> ROTEIRO + RITMO</div>
        <h2>O ritmo é seu.</h2>
        <p>Escolha uma aula, conecte a playlist do professor e conduza cada etapa com clareza.</p>
        <div className="spin-hero-footer">
          <span className="spin-hero-pill">Aulas guiadas</span>
          <span className="spin-hero-pill">Cadência e esforço</span>
          <span className="spin-hero-pill">IA com aprovação</span>
        </div>
      </section>
      <div className="spin-heading">
        <h2>Suas aulas</h2>
        <Button icon="plus" size="sm" variant="tinted" onClick={() => { setEditing(null); setShowBuilder(v => !v) }}>{showBuilder ? 'Fechar' : 'Criar aula'}</Button>
      </div>
      <div className="list spin-class-list">{classes.map(c => <article key={c.id} className="item spin-class-card">
        <div className="spin-card-head">
          <span className="spin-class-symbol"><Icon name="bike" /></span>
          <div className="spin-card-info">
            <div className="spin-card-title">{c.title}</div>
            <div className="spin-card-sub">{c.subtitle}</div>
          </div>
          <span className="spin-card-duration">{clock(durationSeconds(c))}</span>
        </div>
        <div className="spin-phase-strip" aria-hidden="true">{c.phases.map((p, i) =>
          <span key={i} style={{ flex: p.seconds }} />)}
        </div>
        <div className="spin-card-note">{c.playlistUrl ? 'Playlist pronta para abrir no Spotify' : 'Adicione sua playlist em Personalizar'}</div>
        <div className="spin-card-actions">
          <Button size="sm" icon="pencil" onClick={() => { setEditing(c); setShowBuilder(true) }} disabled={!!S.active}>{c.id.startsWith('spin-') ? 'Editar' : 'Personalizar'}</Button>
          {c.playlistUrl
            ? <a className="btn sm spin-playlist-button" href={c.playlistUrl} target="_blank" rel="noopener noreferrer" aria-label={'Abrir playlist de ' + c.title}><Icon name="link" /> Spotify</a>
            : <Button size="sm" icon="link" disabled>Sem playlist</Button>}
          <div className="spin-card-play"><Button variant="primary" icon="play" onClick={() => start(c)} disabled={!!S.active}>Iniciar aula</Button></div>
        </div>
      </article>)}</div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Como funciona</h2>
        <p className="small muted">A playlist abre no aplicativo oficial do Spotify. Volte ao Gyn e toque em Iniciar aula. Cronômetro e orientações funcionam separadamente, sem sincronizar as faixas ou controlar o áudio externo.</p>
      </div>
    </> : chosen && phase ? <>
      <section className="card spin-player-card" aria-label="Cronômetro da aula">
        <div className="spin-player-heading">
          <div><div className="big">{chosen.title}</div><div className="small muted" style={{ marginTop: 5 }}>{chosen.subtitle}</div></div>
          <span className="tag acc">{active.running ? 'Em andamento' : 'Pausada'}</span>
        </div>
        <div className="spin-time-wrap">
          <div className="spin-ring" style={{ '--progress': (100 * Math.min(elapsed, durationSeconds(chosen)) / durationSeconds(chosen)) + '%' }}>
            <div className="spin-ring-center">
              <div className="spin-ring-hint">Tempo de aula</div>
              <div className="spin-ring-time">{clock(Math.min(elapsed, durationSeconds(chosen)))}</div>
              <div className="spin-ring-total">de {clock(durationSeconds(chosen))}</div>
            </div>
          </div>
        </div>
        <div className="spin-controls">
          <Button variant="primary" icon={active.running ? 'pause' : 'play'} onClick={togglePause}>{active.running ? 'Pausar' : 'Continuar'}</Button>
          <Button icon="check" onClick={finish}>Encerrar</Button>
        </div>
      </section>
      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <div className="small muted">Visualização de aula</div>
          <div className="row" style={{ gap: 6 }}>
            <Button size="sm" variant={viewMode === "teacher" ? "tinted" : "plain"} onClick={() => setViewMode("teacher")}>Professor</Button>
            <Button size="sm" variant={viewMode === "student" ? "tinted" : "plain"} onClick={() => setViewMode("student")}>Aluno</Button>
          </div>
        </div>
        <div className="row between" style={{ flexWrap: 'wrap' }}>
          <div className="spin-stage-title">{phase.phase.name}</div>
          <span className="spin-stage-count">ETAPA {phase.index + 1} / {chosen.phases.length}</span>
        </div>
        <div className="spin-kpi-grid">
          <div className="spin-kpi">
            <div className="spin-kpi-label">Cadência sugerida</div>
            <div className="spin-kpi-value">{phase.phase.rpm}</div>
            <div className="spin-kpi-unit">RPM</div>
          </div>
          <div className="spin-kpi">
            <div className="spin-kpi-label">Esforço percebido</div>
            <div className="spin-kpi-value">{phase.phase.rpe}<span style={{ color: 'var(--label-2)', fontSize: 17 }}>/10</span></div>
            <div className="spin-kpi-unit">Escala RPE</div>
          </div>
        </div>
        <div className="small muted" style={{ marginBottom: 12 }}>Próxima mudança em <strong style={{ color: 'var(--label)', fontVariantNumeric: 'tabular-nums' }}>{clock(phase.remaining)}</strong></div>
        {viewMode === "teacher" && <div className="spin-cue">
          <div className="spin-cue-label">ORIENTAÇÃO DO PROFESSOR</div>
          <div>{phase.phase.cue}</div>
          <div style={{ marginTop: 12 }}><Button size="sm" icon="sparkles" variant={voice ? "tinted" : "plain"} onClick={() => setVoice(v => !v)}>{voice ? 'Voz automática ligada' : 'Ativar voz nas próximas etapas'}</Button></div>
          <div className="small muted" style={{ marginTop: 9 }}>A síntese de voz pode interromper o áudio externo; fica desligada por padrão.</div>
        </div>}
        {elapsed >= durationSeconds(chosen) && <p className="small">A sequência terminou. Encerre para registrar a aula.</p>}
      </div>
      {viewMode === 'teacher' && <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Sequência musical sugerida</h2>
          <Button size="sm" variant="ghost" onClick={() => setShowTracks(v => !v)}>{showTracks ? 'Ocultar' : 'Ver músicas'}</Button>
        </div>
        {showTracks && <div className="list">{chosen.tracks.map(([title, artist], i) => <div className="item" key={i}><span className="small muted">{i + 1}.</span><div className="grow"><div className="tt">{title}</div><div className="ss">{artist}</div></div></div>)}</div>}
        <div className="small muted" style={{ marginTop: 10 }}>Música tocada no aplicativo oficial do serviço. O Gyn não controla nem sincroniza a reprodução.</div>
        {chosen.playlistUrl ? <a className="btn" style={{ marginTop: 10 }} href={chosen.playlistUrl} target="_blank" rel="noopener noreferrer">Abrir playlist <Icon name="link" /></a>
          : <div className="small muted" style={{ marginTop: 8 }}>Esta aula ainda não tem uma playlist vinculada. Encerre a sessão e personalize uma cópia para adicionar o link.</div>}
      </div>}
    </> : <div className="card">Aula não encontrada. Reabra o aplicativo ou atualize o programa.</div>}

    {(spin.history || []).length > 0 && <div className="card">
      <h2>Histórico de spinning</h2>
      <div className="list">{spin.history.slice(0, 6).map(h => <div key={h.id} className="item">
        <span className="lrow-i"><Icon name="bike" /></span>
        <div className="grow"><div className="tt">{h.title}</div><div className="ss">{new Date(h.endedAt).toLocaleDateString('pt-BR')} · {clock(h.seconds)} pedalados</div></div>
      </div>)}</div>
    </div>}
  </div>
}

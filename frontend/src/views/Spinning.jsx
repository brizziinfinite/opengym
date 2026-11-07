import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { beep, vibrate } from '../lib/sound.js'
import { uid } from '../lib/format.js'
import { confirmSheet } from '../sheets.jsx'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { SPINNING_CLASSES, durationSeconds, sessionElapsed, phaseAt, clock } from '../lib/spinning.js'
import SpinningBuilder from './SpinningBuilder.jsx'

// Audio plays in the provider's official app, never in Gyn.
// The Gyn clock is started manually and does not claim track-accurate synchronization.
export default function Spinning() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [now, setNow] = useState(() => Date.now())
  const [showTracks, setShowTracks] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const spin = S.spinning || { active: null, history: [] }
  const active = spin.active
  const classes = [...SPINNING_CLASSES, ...(spin.classes || [])]
  const chosen = active ? classes.find(c => c.id === active.classId) : null
  const elapsed = active ? sessionElapsed(active, now) : 0
  const phase = chosen ? phaseAt(chosen, elapsed) : null
  const prevPhase = useRef(null)

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
    }
    prevPhase.current = currentKey
  }, [active?.classId, active?.running, phase?.index, S.sound])

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
      message: 'O tempo pedalado será salvo no histórico. A reprodução no Spotify não será interrompida pelo Gyn.',
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
      <div><h1>Spinning Studio</h1><div className="sub">Aulas guiadas por música, ritmo e resistência</div></div>
    </div>

    {!active ? <>
      {showBuilder && <SpinningBuilder onSaved={() => setShowBuilder(false)} onCancel={() => setShowBuilder(false)} />}
      {S.active && <div className="card"><div className="small muted">Existe um treino de musculação em andamento. Encerre-o antes de iniciar uma aula de spinning.</div></div>}
      <div className="card">
        <div className="row between" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Biblioteca de aulas</h2><Button icon="plus" size="sm" variant="tinted" onClick={() => setShowBuilder(v => !v)}>{showBuilder ? "Fechar editor" : "Criar aula"}</Button></div>
        <div className="row" style={{ gap: 10, marginBottom: 10 }}>
          <span className="lrow-i"><Icon name="bike" /></span>
          <div><h2 style={{ margin: 0 }}>Escolha uma aula</h2><div className="small muted">O Spotify é aberto separadamente pelo professor.</div></div>
        </div>
        <div className="list">{classes.map(c => <div key={c.id} className="item" style={{ cursor: 'default' }}>
          <span className="lrow-i"><Icon name="bike" /></span>
          <div className="grow">
            <div className="tt">{c.title}</div>
            <div className="ss">{c.subtitle} · {clock(durationSeconds(c))} · {c.tracks.length} sugestões de músicas</div>
          </div>
          <Button size="sm" variant="tinted" icon="play" onClick={() => start(c)} disabled={!!S.active}>Iniciar</Button>
        </div>)}</div>
      </div>
      <div className="card">
        <h2>Como funciona</h2>
        <p className="small muted">1. Abra sua playlist no aplicativo oficial de música. 2. Volte ao Gyn e inicie a aula. 3. Siga as orientações de RPM, esforço e resistência. O relógio é manual; não sincroniza automaticamente com as faixas.</p>
        <a className="btn" href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer">Abrir Spotify <Icon name="link" /></a>
      </div>
    </> : chosen && phase ? <>
      <div className="card" style={{ borderColor: 'var(--acc)' }}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <div><div className="big">{chosen.title}</div><div className="small muted">{chosen.subtitle}</div></div>
          <span className="tag acc">{active.running ? 'Em andamento' : 'Pausada'}</span>
        </div>
        <div className="big" style={{ fontSize: 40, fontVariantNumeric: 'tabular-nums', textAlign: 'center', margin: '10px 0' }}>{clock(Math.min(elapsed, durationSeconds(chosen)))} <span className="small muted">/ {clock(durationSeconds(chosen))}</span></div>
        <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ width: (100 * Math.min(elapsed, durationSeconds(chosen)) / durationSeconds(chosen)) + '%', height: '100%', background: 'var(--acc)' }} />
        </div>
        <div className="row" style={{ gap: 8, marginTop: 15 }}>
          <Button variant="primary" icon={active.running ? 'pause' : 'play'} onClick={togglePause}>{active.running ? 'Pausar' : 'Continuar'}</Button>
          <Button icon="check" onClick={finish}>Encerrar</Button>
        </div>
      </div>
      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>{phase.phase.name}</h2>
          <span className="tag acc">Etapa {phase.index + 1}/{chosen.phases.length}</span>
        </div>
        <div className="tiles" style={{ marginTop: 12 }}>
          <div className="tile"><div className="l">Cadência sugerida</div><div className="v" style={{ fontSize: 23 }}>{phase.phase.rpm}</div><div className="small muted">RPM</div></div>
          <div className="tile"><div className="l">Esforço percebido</div><div className="v" style={{ fontSize: 23 }}>{phase.phase.rpe}/10</div></div>
        </div>
        <div className="small muted" style={{ marginTop: 12 }}>Próxima mudança em {clock(phase.remaining)}</div>
        <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 12 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>ORIENTAÇÃO DO PROFESSOR</div>
          <div>{phase.phase.cue}</div>
        </div>
        {elapsed >= durationSeconds(chosen) && <p className="small">A sequência terminou. Encerre para registrar a aula.</p>}
      </div>
      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Sequência musical sugerida</h2>
          <Button size="sm" variant="ghost" onClick={() => setShowTracks(v => !v)}>{showTracks ? 'Ocultar' : 'Ver músicas'}</Button>
        </div>
        {showTracks && <div className="list">{chosen.tracks.map(([title, artist], i) => <div className="item" key={i}><span className="small muted">{i + 1}.</span><div className="grow"><div className="tt">{title}</div><div className="ss">{artist}</div></div></div>)}</div>}
        <div className="small muted" style={{ marginTop: 10 }}>Música tocada em aplicativo externo. O Gyn não controla nem sincroniza o Spotify.</div>
        <a className="btn" style={{ marginTop: 10 }} href={chosen.playlistUrl || "https://open.spotify.com/"} target="_blank" rel="noopener noreferrer">Abrir playlist externa <Icon name="link" /></a>
      </div>
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

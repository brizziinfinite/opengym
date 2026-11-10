import { useEffect, useId, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { beep, vibrate } from '../lib/sound.js'
import { uid } from '../lib/format.js'
import { confirmSheet } from '../sheets.jsx'
import { Button, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { SPINNING_CLASSES, durationSeconds, sessionElapsed, phaseAt, clock } from '../lib/spinning.js'
import { playlistProvider } from '../lib/spinning-builder.js'
import SpinningBuilder from './SpinningBuilder.jsx'
import SpinningIllustration from '../components/SpinningIllustration.jsx'
import { visualForPhase, stageTimeline, suggestedTrackTimeline, suggestedTrackAt } from '../lib/spinning-visual.js'

// No OAuth or streaming: a class-specific official playlist link opens in the
// provider's app, while Gyn continues timing the class independently.
function PlaylistQuickConnect({ url, onSave }) {
  const inputId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(url || '')
  const [error, setError] = useState('')
  const provider = playlistProvider(url)

  function save(e) {
    e.preventDefault()
    const next = draft.trim()
    if (!playlistProvider(next)) {
      setError('Cole um link de playlist do Spotify ou Apple Music.')
      return
    }
    onSave(next)
    setEditing(false)
    setError('')
  }

  return <div className={'spin-playlist-connect' + (editing ? ' editing' : '')}>
    {provider && <a className="btn spin-playlist-open" href={url} target="_blank" rel="noopener noreferrer" aria-label={'Abrir playlist no ' + provider}>
      <Icon name="link" /> Abrir no {provider}
    </a>}
    <Button size="sm" variant={provider ? 'plain' : 'tinted'} icon="link" onClick={() => {
      setDraft(url || '')
      setError('')
      setEditing(v => !v)
    }}>{provider ? 'Trocar playlist' : 'Conectar playlist'}</Button>
    {editing && <form className="spin-playlist-edit" onSubmit={save}>
      <label className="small muted" htmlFor={inputId}>Cole o link da playlist</label>
      <TextField id={inputId} type="url" inputMode="url" autoComplete="url"
        placeholder="https://open.spotify.com/playlist/..." value={draft}
        onChange={e => { setDraft(e.target.value); setError('') }} />
      {error && <div className="small" role="alert" style={{ color: 'var(--red)' }}>{error}</div>}
      <div className="spin-playlist-edit-actions">
        <button className="btn" type="button" onClick={() => { setEditing(false); setError('') }}>Cancelar</button>
        <button className="btn primary" type="submit">Salvar playlist</button>
      </div>
    </form>}
  </div>
}

export default function Spinning() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [now, setNow] = useState(() => Date.now())
  const [showRoadmap, setShowRoadmap] = useState(false)
  const [roadmapMode, setRoadmapMode] = useState('stages')
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
  const currentVisual = phase ? visualForPhase(phase.phase) : null
  const stages = chosen ? stageTimeline(chosen) : []
  const nextStage = phase ? stages[phase.index + 1] : null
  const songPlan = chosen ? suggestedTrackTimeline(chosen) : []
  const suggestedSong = chosen ? suggestedTrackAt(chosen, elapsed) : null
  const prevPhase = useRef(null)
  const playlistFor = c => spin.playlists?.[c.id] ?? c.playlistUrl ?? ''
  const savePlaylist = (classId, url) => update(s => {
    if (!s.spinning) s.spinning = { active: null, history: [] }
    if (!s.spinning.playlists) s.spinning.playlists = {}
    s.spinning.playlists[classId] = url
  })

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
        <div className="spin-card-note">{playlistProvider(playlistFor(c)) ? 'Playlist pronta para abrir no aplicativo de música' : 'Conecte uma playlist sem editar a aula'}</div>
        <div className="spin-card-actions">
          <Button size="sm" icon="pencil" onClick={() => { setEditing(c); setShowBuilder(true) }} disabled={!!S.active}>{c.id.startsWith('spin-') ? 'Editar' : 'Personalizar'}</Button>
          <PlaylistQuickConnect key={c.id} url={playlistFor(c)} onSave={url => savePlaylist(c.id, url)} />
          <div className="spin-card-play"><Button variant="primary" icon="play" onClick={() => start(c)} disabled={!!S.active}>Iniciar aula</Button></div>
        </div>
      </article>)}</div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Como funciona</h2>
        <p className="small muted">Conecte o link de uma playlist do Spotify ou Apple Music, abra no aplicativo oficial e volte ao Gyn. Também é possível conectá-la durante a aula. A música não é controlada nem sincronizada pelo Gyn.</p>
      </div>
    </> : chosen && phase ? <>
      <section className="spin-visual-hero" aria-label="Orientação visual da etapa atual">
        <div className="spin-visual-headline">
          <span className="spin-visual-now"><span aria-hidden="true">●</span> AGORA</span>
          <span className="spin-visual-status">{active.running ? 'Aula em andamento' : 'Aula pausada'}</span>
        </div>
        <h2>{currentVisual.label}</h2>
        <p>{phase.phase.name} · Etapa {phase.index + 1} de {chosen.phases.length}</p>
        <SpinningIllustration stage={phase.phase} />
        <div className="spin-visual-bottom">
          <span><Icon name="clock" /> {nextStage ? 'Próxima em ' + clock(phase.remaining) : 'Última etapa'}</span>
          <span><Icon name="link" /> {suggestedSong ? 'Referência ' + (suggestedSong.index + 1) + '/' + songPlan.length : 'Roteiro por etapas'}</span>
        </div>
      </section>

      <section className="card spin-visual-controls" aria-label="Controles do cronômetro">
        <div className="spin-visual-progress-head"><span>Tempo da aula</span><strong>{clock(Math.min(elapsed, durationSeconds(chosen)))} <span className="muted">/ {clock(durationSeconds(chosen))}</span></strong></div>
        <div className="spin-visual-progress" role="progressbar" aria-label="Progresso da aula" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(100 * Math.min(elapsed, durationSeconds(chosen)) / durationSeconds(chosen))}>
          <div style={{ width: Math.min(100, 100 * elapsed / durationSeconds(chosen)) + '%' }} />
        </div>
        <div className="spin-controls">
          <Button variant="primary" icon={active.running ? 'pause' : 'play'} onClick={togglePause}>{active.running ? 'Pausar' : 'Continuar'}</Button>
          <Button icon="check" onClick={finish}>Encerrar</Button>
        </div>
      </section>

      <section className="spin-visual-metrics" aria-label="Orientações de postura e cadência">
        <div className="spin-visual-metric"><span>Cadência sugerida</span><strong>{phase.phase.rpm}</strong><small>RPM</small></div>
        <div className="spin-visual-metric"><span>Esforço percebido</span><strong>{phase.phase.rpe}<small> / 10</small></strong><small>RPE</small></div>
        <div className="spin-visual-metric"><span>Postura</span><strong className="spin-visual-word">{currentVisual.posture}</strong><small>Orientação visual</small></div>
        <div className="spin-visual-metric"><span>Resistência</span><strong className="spin-visual-word">{currentVisual.load}</strong><small>Ajuste confortável</small></div>
      </section>

      <section className="spin-cue spin-visual-cue" aria-label="Orientação do professor">
        <div className="spin-visual-cue-header">
          <span className="spin-cue-label">ORIENTAÇÃO DO PROFESSOR</span>
          <div className="spin-visual-mode">
            <Button size="sm" variant={viewMode === 'teacher' ? 'tinted' : 'plain'} onClick={() => setViewMode('teacher')}>Professor</Button>
            <Button size="sm" variant={viewMode === 'student' ? 'tinted' : 'plain'} onClick={() => setViewMode('student')}>Aluno</Button>
          </div>
        </div>
        <p>{viewMode === 'teacher' ? phase.phase.cue : currentVisual.guidance}</p>
        {viewMode === 'teacher' && <>
          <Button size="sm" icon="sparkles" variant={voice ? 'tinted' : 'plain'} onClick={() => setVoice(v => !v)}>{voice ? 'Voz automática ligada' : 'Ativar voz nas próximas etapas'}</Button>
          <p className="small muted">A voz pode interromper o Spotify; permanece desligada por padrão.</p>
        </>}
      </section>

      <section className="card spin-active-music" aria-label="Playlist externa da aula">
        <div className="spin-active-music-heading"><Icon name="link" /><div><strong>Música (externa)</strong><div className="small muted">Spotify ou Apple Music · sem sincronização</div></div></div>
        <PlaylistQuickConnect key={chosen.id} url={playlistFor(chosen)} onSave={url => savePlaylist(chosen.id, url)} />
      </section>

      <section className="spin-visual-next" aria-label="Próxima etapa">
        {nextStage ? <>
          <SpinningIllustration stage={nextStage.stage} compact />
          <div className="spin-visual-next-text"><span>PRÓXIMA ETAPA</span><strong>{nextStage.visual.label}</strong><small>Em {clock(phase.remaining)} · {nextStage.stage.rpm} RPM · RPE {nextStage.stage.rpe}/10</small></div>
          <Icon name="chevronRight" />
        </> : <div className="spin-visual-next-text"><span>ETAPA FINAL</span><strong>Recupere o ritmo com calma</strong><small>Encerre para registrar a aula ao terminar.</small></div>}
      </section>

      <section className="card spin-visual-roadmap" aria-label="Roteiro visual da aula">
        <div className="spin-visual-roadmap-head">
          <div><h2>Roteiro da aula</h2><p className="small muted">Posturas e orientações para cada momento</p></div>
          <Button variant="tinted" size="sm" onClick={() => setShowRoadmap(v => !v)}>{showRoadmap ? 'Ocultar' : 'Ver roteiro'}</Button>
        </div>
        {showRoadmap && <>
          <div className="spin-visual-tabs" role="group" aria-label="Visualização do roteiro">
            <Button variant={roadmapMode === 'stages' ? 'primary' : 'plain'} onClick={() => setRoadmapMode('stages')}>Por etapa</Button>
            <Button variant={roadmapMode === 'songs' ? 'primary' : 'plain'} onClick={() => setRoadmapMode('songs')}>Música a música</Button>
          </div>
          {roadmapMode === 'songs' && <p className="small muted spin-visual-disclaimer">Faixas apenas sugeridas. Os tempos são aproximados e não correspondem à reprodução real da sua playlist no Spotify.</p>}
          <div className="spin-visual-roadmap-list">
            {roadmapMode === 'stages' ? stages.map(item => <div className={'spin-visual-roadmap-row' + (phase.index === item.index ? ' is-current' : '')} key={item.index} aria-current={phase.index === item.index ? 'step' : undefined}>
              <SpinningIllustration stage={item.stage} compact />
              <div className="spin-visual-roadmap-copy"><div className="spin-visual-roadmap-title">Etapa {item.index + 1} · {item.visual.label}</div><div className="small muted">{item.stage.name}</div><div className="spin-visual-tags"><span>{item.stage.rpm} RPM</span><span>RPE {item.stage.rpe}/10</span><span>{clock(item.end - item.start)}</span></div></div>
            </div>) : songPlan.length ? songPlan.map(song => <div className={'spin-visual-roadmap-row' + (suggestedSong?.index === song.index ? ' is-current' : '')} key={song.index} aria-current={suggestedSong?.index === song.index ? 'step' : undefined}>
              <SpinningIllustration stage={song.stage} compact />
              <div className="spin-visual-roadmap-copy"><div className="spin-visual-roadmap-title">Faixa sugerida {song.index + 1} · {song.visual.label}</div><div className="small muted">{song.title}{song.artist ? ' — ' + song.artist : ''}</div><div className="spin-visual-tags"><span>{song.stage.rpm} RPM</span><span>RPE {song.stage.rpe}/10</span><span>~{clock(song.end - song.start)}</span></div></div>
            </div>) : <p className="small muted">Esta aula ainda não tem músicas sugeridas. Consulte o roteiro por etapas.</p>}
          </div>
        </>}
      </section>
      {elapsed >= durationSeconds(chosen) && <p className="small">A sequência terminou. Encerre para registrar a aula.</p>}
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

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, nameOf } from '../lib/i18n.js'
import { DAYN, todayISO, exCount } from '../lib/format.js'
import { exOr } from '../lib/exercises.js'
import { buildPlan, splitFor, exercisesFor } from '../lib/autoplan.js'
import { glyphOf } from '../lib/glyphs.js'
import Icon from '../components/Icon.jsx'
import { Button, Segmented, NumberField } from '../components/ui.jsx'

/* First-run profile → automatic plan. The questions a coach would ask before writing a program
   (who you are, what you want, how often, where), then a plan built from them on the spot — no
   AI and no server involved, so it works on every instance. Same one-topic-per-screen shape as
   the Coach intake, and the answers are shared with it. */

// Goal / experience keys are the Coach's, so its intake starts pre-filled from these answers.
const GOALS = [
  ['fatloss', 'Lose fat', 'flame'],
  ['muscle', 'Build muscle', 'arm'],
  ['strength', 'Get stronger', 'barbell'],
  ['general', 'General fitness', 'heart'],
  ['endurance', 'Endurance', 'figureRun']
]
const EXPERIENCE = [
  ['new', 'New to lifting'],
  ['returning', 'Coming back after a break'],
  ['regular', 'Training regularly']
]
const SETUP = [
  ['gym', 'At a gym', 'Machines, barbells, cables and dumbbells', 'machine'],
  ['home', 'At home with dumbbells', 'Dumbbells and a bench', 'dumbbell'],
  ['bodyweight', 'No equipment', 'Just your body weight', 'figureStrength']
]
const SESSION_MIN = [30, 45, 60, 75]
const STEPS = ['you', 'goal', 'days', 'setup', 'review']

export default function Welcome() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editing = params.get('edit') === '1'
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const lastBw = S.bodyweight.length ? S.bodyweight[S.bodyweight.length - 1].w : null
  const [p, setP] = useState(() => ({
    sex: S.body === 'female' ? 'female' : 'male', birthYear: null, heightCm: null,
    goal: null, experience: null, daysPerWeek: 3, preferredDays: [], sessionMin: 45, setup: 'gym',
    ...(S.profile && !S.profile.skipped ? S.profile : {})
  }))
  const [weight, setWeight] = useState(lastBw)
  const [step, setStep] = useState(0)
  const set = patch => setP(v => ({ ...v, ...patch }))
  const key = STEPS[step]

  const year = Number(todayISO().slice(0, 4))
  const validYear = !p.birthYear || (p.birthYear >= year - 100 && p.birthYear <= year - 12)
  const canNext = key === 'goal' ? !!(p.goal && p.experience) : key === 'you' ? validYear : true

  const toggleDay = d => set({
    preferredDays: p.preferredDays.includes(d) ? p.preferredDays.filter(x => x !== d) : [...p.preferredDays, d]
  })

  // What the plan will look like, rebuilt live on the review step (ids regenerate on save).
  const preview = key === 'review' ? buildPlan(p) : null

  const save = withPlan => {
    const profile = { ...p, done: true, updated: Date.now() }
    delete profile.skipped
    const plan = withPlan ? buildPlan(profile) : null
    update(s => {
      s.profile = profile
      s.body = profile.sex === 'female' ? 'female' : 'male'
      if (weight > 0) {
        const iso = todayISO()
        const ex = s.bodyweight.find(b => b.d === iso)
        if (ex) { ex.w = weight; ex.t = Date.now() } else s.bodyweight.push({ d: iso, w: weight, t: Date.now() })
        s.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1))
      }
      if (plan) {
        s.routines.push(...plan.routines)
        s.week = plan.week
      }
    })
    toast(plan ? t('Your plan is ready') : t('Saved'))
    nav(plan ? '/home' : (editing ? '/settings' : '/home'), { replace: true })
  }

  const skip = () => { update(s => { s.profile = { skipped: true } }); nav('/home', { replace: true }) }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => step ? setStep(step - 1) : nav(editing ? '/settings' : '/home')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}>
        <h1>{editing ? t('My profile') : t('Welcome!')}</h1>
        <div className="sub">{t('Step {0} of {1}', step + 1, STEPS.length)}</div>
      </div>
    </div>

    <div className="row" style={{ gap: 5, marginBottom: 14 }}>
      {STEPS.map((s, i) => <div key={s} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= step ? 'var(--acc)' : 'var(--surface-3)' }} />)}
    </div>

    <div className="card">
      {key === 'you' && <>
        <h2 style={{ marginTop: 0 }}>{t('About you')}</h2>
        <div className="muted small" style={{ marginBottom: 12 }}>{t('Used to size your plan and to estimate what each workout gives you. Stays in your profile.')}</div>
        <Segmented options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]}
          value={p.sex} onChange={v => set({ sex: v })} />
        <div className="row" style={{ gap: 10, marginTop: 14 }}>
          <label style={{ flex: 1 }}><div className="muted small" style={{ marginBottom: 4 }}>{t('Year of birth')}</div>
            <NumberField className="field" decimal={false} nullable value={p.birthYear} placeholder="1990" onChange={v => set({ birthYear: v })} /></label>
          <label style={{ flex: 1 }}><div className="muted small" style={{ marginBottom: 4 }}>{t('Height (cm)')}</div>
            <NumberField className="field" decimal={false} nullable value={p.heightCm} placeholder="175" onChange={v => set({ heightCm: v })} /></label>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}><div className="muted small" style={{ marginBottom: 4 }}>{t('Weight ({0})', S.unit)}</div>
          <NumberField className="field" nullable value={weight} placeholder={S.unit === 'lb' ? '170' : '75'} onChange={setWeight} /></label>
        {!validYear && <div className="small" style={{ color: 'var(--red)', marginTop: 8 }}>{t('Check the year of birth.')}</div>}
      </>}

      {key === 'goal' && <>
        <h2 style={{ marginTop: 0 }}>{t('What are you training for?')}</h2>
        <div className="sect-b">
          {GOALS.map(([v, label, icon]) => <button key={v} className="lrow tap" onClick={() => set({ goal: v })}>
            <span className="lrow-i"><Icon name={icon} /></span>
            <span className="lrow-m"><span className="lrow-t">{t(label)}</span></span>
            {p.goal === v && <Icon name="check" className="lrow-k" />}
          </button>)}
        </div>
        <h2>{t('Where are you starting from?')}</h2>
        <div className="sect-b">
          {EXPERIENCE.map(([v, label]) => <button key={v} className="lrow tap" onClick={() => set({ experience: v })}>
            <span className="lrow-m"><span className="lrow-t">{t(label)}</span></span>
            {p.experience === v && <Icon name="check" className="lrow-k" />}
          </button>)}
        </div>
      </>}

      {key === 'days' && <>
        <h2 style={{ marginTop: 0 }}>{t('How many days a week?')}</h2>
        <Segmented options={[2, 3, 4, 5, 6].map(n => ({ value: n, label: String(n) }))}
          value={p.daysPerWeek} onChange={v => set({ daysPerWeek: v })} />
        <div className="muted small" style={{ margin: '14px 0 8px' }}>{t('Which days suit you? (optional)')}</div>
        <div className="week">
          {[1, 2, 3, 4, 5, 6, 0].map(d => <div key={d} className={'wday' + (p.preferredDays.includes(d) ? ' today' : '')}
            onClick={() => toggleDay(d)} style={{ cursor: 'pointer' }}>
            <div className="lbl">{t(DAYN[d]).slice(0, 3)}</div>
            <div className={'dot' + (p.preferredDays.includes(d) ? ' plan' : '')} />
          </div>)}
        </div>
        {p.preferredDays.length > 0 && p.preferredDays.length !== p.daysPerWeek &&
          <div className="dim small" style={{ marginTop: 8 }}>{t('Pick {0} days, or leave it empty and the days are spread over the week.', p.daysPerWeek)}</div>}
      </>}

      {key === 'setup' && <>
        <h2 style={{ marginTop: 0 }}>{t('Where do you train?')}</h2>
        <div className="sect-b">
          {SETUP.map(([v, label, sub, icon]) => <button key={v} className="lrow tap" onClick={() => set({ setup: v })}>
            <span className="lrow-i"><Icon name={icon} /></span>
            <span className="lrow-m"><span className="lrow-t">{t(label)}</span><span className="lrow-s">{t(sub)}</span></span>
            {p.setup === v && <Icon name="check" className="lrow-k" />}
          </button>)}
        </div>
        <h2>{t('How long is a session?')}</h2>
        <Segmented options={SESSION_MIN.map(n => ({ value: n, label: n + ' ' + t('min') }))}
          value={p.sessionMin} onChange={v => set({ sessionMin: v })} />
      </>}

      {key === 'review' && preview && <>
        <h2 style={{ marginTop: 0 }}>{t('Your plan')}</h2>
        <div className="muted small" style={{ marginBottom: 10 }}>
          {t('{0} workouts a week, about {1} min each, {2} per session.', splitFor(p.daysPerWeek, p.experience).length, p.sessionMin, exCount(exercisesFor(p.sessionMin)))}
        </div>
        <div className="week" style={{ marginBottom: 12 }}>
          {[1, 2, 3, 4, 5, 6, 0].map(d => {
            const r = preview.routines.find(x => x.id === preview.week[d])
            return <div key={d} className={'wday' + (r ? ' today' : '')}>
              <div className="lbl">{t(DAYN[d]).slice(0, 3)}</div>
              <div className={'dot' + (r ? ' plan' : '')} />
            </div>
          })}
        </div>
        {preview.routines.map(r => <div key={r.id} style={{ marginBottom: 12 }}>
          <div className="row" style={{ gap: 7, fontWeight: 600 }}><Icon name={glyphOf(r.emoji)} />{r.name}</div>
          {r.ex.map(e => <div key={e.id} className="small muted" style={{ marginLeft: 24, marginTop: 3 }}>
            {nameOf(exOr(e.id))} · {e.sets} × {e.repsMin ? e.repsMin + '–' + e.reps : e.reps}
          </div>)}
        </div>)}
        <div className="dim small" style={{ lineHeight: 1.5 }}>{t('Start light: the first session sets your weights, and the app raises them as you hit your reps. You can change anything in Plan.')}</div>
        {S.routines.length > 0 && <div className="small" style={{ marginTop: 10, color: 'var(--yellow)', lineHeight: 1.5 }}>
          {t('Your current routines are kept; the weekly schedule switches to the new plan.')}</div>}
      </>}
    </div>

    <div className="row" style={{ gap: 10 }}>
      {step > 0 && <Button onClick={() => setStep(step - 1)} style={{ flex: 1 }}>{t('Back')}</Button>}
      {key !== 'review'
        ? <Button variant="primary" style={{ flex: 1 }} disabled={!canNext} onClick={() => setStep(step + 1)}>{t('Next')}</Button>
        : <Button variant="primary" style={{ flex: 1 }} icon="sparkles" onClick={() => save(true)}>{t('Create my plan')}</Button>}
    </div>
    {key === 'goal' && !canNext && <div className="dim small" style={{ textAlign: 'center', marginTop: 10 }}>{t('Pick a goal and where you are starting from to continue.')}</div>}
    {key === 'review' && editing && <div style={{ marginTop: 10 }}><Button style={{ width: '100%' }} onClick={() => save(false)}>{t('Save profile only')}</Button></div>}
    {!editing && step === 0 && <div style={{ textAlign: 'center', marginTop: 14 }}>
      <button className="linkbtn dim small" onClick={skip} style={{ background: 'none', border: 0, color: 'var(--label-3)', cursor: 'pointer' }}>{t('Skip for now')}</button>
    </div>}
    <div style={{ height: 20 }} />
  </div>
}

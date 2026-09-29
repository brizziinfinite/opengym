import { useStore } from '../store/useStore.js'
import { t, nameOf } from '../lib/i18n.js'
import { fmtNum, todayISO, MONTHS_LONG, exCount } from '../lib/format.js'
import { exOr } from '../lib/exercises.js'
import { weekSummary, monthSummary } from '../lib/summary.js'
import { effectiveRoutine } from '../lib/history.js'
import Icon from './Icon.jsx'

/* What training is getting you, in the words of your own goal. Home shows it right under
   today's session: the week so far (against the plan and against last week) and the month
   (against the month before), plus one line tying the numbers to the goal from the profile. */

function Stat({ icon, value, label, tint }) {
  return <div style={{ flex: 1, minWidth: 0 }}>
    <div className="row" style={{ gap: 5, fontSize: 20, fontWeight: 600, letterSpacing: '-.02em' }}>
      <Icon name={icon} style={{ fontSize: 15, color: tint || 'var(--acc)' }} />{value}
    </div>
    <div className="dim small" style={{ marginTop: 1 }}>{label}</div>
  </div>
}

const Change = ({ pct }) => pct == null || pct === 0 ? null
  : <span className="small" style={{ fontWeight: 500, color: pct > 0 ? 'var(--green)' : 'var(--orange)' }}>
    {pct > 0 ? '+' : ''}{pct}%</span>

// One sentence that says why this week's numbers matter for the profile's goal.
function goalLine(goal, w, m, unit, hasBW) {
  switch (goal) {
    case 'fatloss': return w.kcal > 0
      ? t('≈ {0} kcal burned training this week (estimate). Strength work keeps your muscle while the fat goes.', fmtNum(w.kcal))
      : hasBW
        ? t('Strength work keeps your muscle while the fat goes — your first workout this week starts the calorie count.')
        : t('Strength work keeps your muscle while the fat goes — log your weight to see the calories you burn.')
    case 'muscle': return t('{0} sets this week. Muscle grows from steady weekly volume — keep showing up.', w.sets)
    case 'strength': return m.topGain
      ? t('Your {0} is up {1} {2} this month (estimated 1RM). Strength comes from adding a little, often.', nameOf(exOr(m.topGain.id)), fmtNum(m.topGain.gain), unit)
      : t('{0} records this month. Strength comes from adding a little, often.', m.prs)
    case 'endurance': return t('{0} minutes trained this week. Endurance builds with regular, steady work.', w.minutes)
    default: return w.count >= 2
      ? t('Health guidelines recommend strength training at least 2 days a week — done for this week.')
      : t('Health guidelines recommend strength training at least 2 days a week — {0} of 2 so far.', w.count)
  }
}

export function TodayHint() {
  const S = useStore(s => s.S)
  if (S.active) return null
  const r = effectiveRoutine(S, todayISO())
  if (r) {
    const min = S.profile?.sessionMin
    return <div className="dim small" style={{ marginTop: 8 }}>
      {exCount(r.ex.length)}{min ? ' · ' + t('about {0} min', min) : ''}
    </div>
  }
  if (!S.routines.length) return null
  return <div className="dim small" style={{ marginTop: 8 }}>{t('Rest is part of the plan — your muscles recover and grow today.')}</div>
}

export default function ProgressCards() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const w = weekSummary(S, today)
  const m = monthSummary(S, today)
  const goal = S.profile?.goal
  if (!S.workouts.length && !goal) return null
  const monthName = t(MONTHS_LONG[Number(today.slice(5, 7)) - 1])
  const left = w.planned > w.count ? w.planned - w.count : 0

  return <>
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{t('Your week')}</h2>
        <Change pct={w.volumeChange} />
      </div>
      <div className="row" style={{ gap: 10 }}>
        <Stat icon="calendar" value={w.planned ? `${w.count}/${w.planned}` : w.count} label={t('workouts')} />
        <Stat icon="dumbbell" value={w.sets} label={t('sets')} />
        <Stat icon="timer" value={w.minutes} label={t('minutes')} />
        {w.prs > 0 && <Stat icon="trophy" value={w.prs} label={t('records')} tint="var(--yellow)" />}
      </div>
      {goal && <div className="small" style={{ marginTop: 12, lineHeight: 1.45 }}>{goalLine(goal, w, m, S.unit, S.bodyweight.length > 0)}</div>}
      {left > 0 && <div className="dim small" style={{ marginTop: 6 }}>
        {t(left === 1 ? '{0} workout left this week — you can still make it.' : '{0} workouts left this week — you can still make it.', left)}</div>}
      {w.planned > 0 && left === 0 && w.count > 0 && <div className="small" style={{ marginTop: 6, color: 'var(--green)' }}>{t('Week complete — great work!')}</div>}
    </div>

    {m.count > 0 && <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{t('Your month')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {monthName}</span></h2>
        <Change pct={m.volumeChange} />
      </div>
      <div className="row" style={{ gap: 10 }}>
        <Stat icon="calendar" value={m.count} label={t('workouts')} />
        <Stat icon="timer" value={fmtNum(m.minutes / 60)} label={t('hours')} />
        {m.kcal > 0 && <Stat icon="flame" value={fmtNum(m.kcal)} label={t('kcal (est.)')} tint="var(--orange)" />}
        {m.bwChange != null && <Stat icon="scale" value={(m.bwChange > 0 ? '+' : '') + fmtNum(m.bwChange)} label={S.unit} tint="var(--teal)" />}
      </div>
      <div className="small muted" style={{ marginTop: 10, lineHeight: 1.45 }}>
        {m.countChange > 0 ? t(m.countChange === 1 ? '{0} more workout than last month.' : '{0} more workouts than last month.', m.countChange)
          : m.countChange < 0 ? t(m.countChange === -1 ? '{0} fewer workout than last month — this week is a good time to catch up.' : '{0} fewer workouts than last month — this week is a good time to catch up.', -m.countChange)
          : t('Same number of workouts as last month.')}
        {m.topGain && goal !== 'strength' && <> {t('Biggest strength gain: {0}, +{1} {2}.', nameOf(exOr(m.topGain.id)), fmtNum(m.topGain.gain), S.unit)}</>}
      </div>
    </div>}
  </>
}

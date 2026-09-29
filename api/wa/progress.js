/* Progress figures and the "why it matters" lines the assistant sends. Mirrors
 * frontend/src/lib/summary.js (kept separate: the api image does not ship frontend code). */
import { EX, isSenior } from './plan.js';

const STRENGTH_MET = 5;   // resistance training, moderate–vigorous (Compendium of Physical Activities)
const minutesOf = w => (w.start && w.end && w.end > w.start ? (w.end - w.start) / 60000 : 0);
const setsOf = w => (w.entries || []).reduce((a, e) => a + (e.sets || []).filter(s => s.done).length, 0);
const lastBW = S => (S.bodyweight || []).length ? S.bodyweight[S.bodyweight.length - 1].w : null;
const epley = (w, r) => (w > 0 && r >= 1 && r <= 12 ? (r === 1 ? w : w * (1 + r / 30)) : 0);

export function isoWeek(iso) {
  const dt = new Date(iso + 'T12:00:00Z');
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt.toISOString().slice(0, 10);   // Monday of that week
}
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function totals(ws, S) {
  const min = ws.reduce((a, w) => a + minutesOf(w), 0);
  const bw = lastBW(S);
  return {
    count: ws.length, sets: ws.reduce((a, w) => a + setsOf(w), 0), minutes: Math.round(min),
    kcal: bw ? Math.round(STRENGTH_MET * bw * (min / 60)) : 0,
    prs: ws.reduce((a, w) => a + ((w.prs || []).length), 0)
  };
}
const planned = S => Object.values(S.week || {}).filter(Boolean).length;

export function week(S, today) {
  const wk = isoWeek(today), prev = isoWeek(addDays(today, -7));
  return { ...totals((S.workouts || []).filter(w => isoWeek(w.d) === wk), S), planned: planned(S),
    prev: totals((S.workouts || []).filter(w => isoWeek(w.d) === prev), S) };
}

export function month(S, today) {
  const ym = today.slice(0, 7);
  const d = new Date(ym + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1);
  const pym = d.toISOString().slice(0, 7);
  const ws = (S.workouts || []).filter(w => w.d.slice(0, 7) === ym);
  const bwIn = (S.bodyweight || []).filter(b => b.d.slice(0, 7) === ym);
  const bwBefore = (S.bodyweight || []).filter(b => b.d < ym + '-01');
  const from = bwBefore.length ? bwBefore[bwBefore.length - 1] : bwIn[0];
  const to = bwIn[bwIn.length - 1];
  // biggest estimated-1RM gain this month vs everything before it
  const best = list => { const b = {}; list.forEach(w => (w.entries || []).forEach(e => (e.sets || []).forEach(s => { if (s.done) { const v = epley(+s.w, +s.r); if (v > (b[e.id] || 0)) b[e.id] = v; } }))); return b; };
  const before = best((S.workouts || []).filter(w => w.d < ym + '-01')), now = best(ws);
  let topGain = null;
  for (const id of Object.keys(now)) if (before[id] > 0 && now[id] - before[id] > 0.5 && (!topGain || now[id] - before[id] > topGain.gain)) topGain = { id, gain: Math.round((now[id] - before[id]) * 10) / 10 };
  return { ...totals(ws, S), prev: totals((S.workouts || []).filter(w => w.d.slice(0, 7) === pym), S),
    bwChange: from && to && from !== to ? Math.round((to.w - from.w) * 10) / 10 : null, topGain };
}

// What a routine does for everyday life — the daily "benefit" line, by its main body parts.
export function benefitOf(routine, profile) {
  const bps = (routine.ex || []).map(e => EX[e.id]?.bp || (e.id === 'cx-sitstand' ? 'upper legs' : e.id === 'cx-balance' ? 'balance' : '')).filter(Boolean);
  const count = bp => bps.filter(b => b === bp).length;
  if (profile && isSenior(profile)) {
    return bps.includes('balance')
      ? 'Pernas fortes e equilíbrio são o que mais protege contra quedas depois dos 50 — e o que te deixa levantar da cadeira, subir escada e carregar compras sem esforço.'
      : 'Cada sessão de pernas devolve autonomia: levantar, subir e caminhar ficam mais fáceis.';
  }
  const legs = count('upper legs') + count('lower legs'), upper = count('chest') + count('back') + count('shoulders') + count('upper arms');
  if (legs > upper) return 'Pernas são os maiores músculos do corpo: treinar pernas gasta mais energia, melhora o açúcar no sangue e protege joelhos e coluna.';
  if (count('back') >= count('chest') && count('back') > 0) return 'Costas fortes = postura melhor e menos dor de ficar sentado. Seu corpo agradece no fim do dia.';
  if (upper > 0) return 'Força de braços, peito e ombros é o que você usa para empurrar, carregar e levantar coisas no dia a dia.';
  return 'Treino de força 2 vezes por semana já reduz o risco de várias doenças crônicas, segundo a OMS.';
}

export function goalLine(goal, w, m) {
  switch (goal) {
    case 'fatloss': return w.kcal > 0 ? `≈ ${w.kcal} kcal gastas treinando esta semana (estimativa). Musculação preserva seus músculos enquanto a gordura vai embora.` : 'Musculação preserva seus músculos enquanto a gordura vai embora.';
    case 'muscle': return `${w.sets} séries esta semana. Músculo cresce com volume constante — continue aparecendo.`;
    case 'strength': return m.topGain ? `Seu ${EX[m.topGain.id]?.pt || 'exercício'} subiu ${String(m.topGain.gain).replace('.', ',')} kg este mês (1RM estimado).` : `${m.prs} recordes este mês. Força vem de somar um pouco, com frequência.`;
    default: return w.count >= 2 ? 'A OMS recomenda força pelo menos 2 dias por semana — meta da semana cumprida!' : `A OMS recomenda força pelo menos 2 dias por semana — ${w.count} de 2 até agora.`;
  }
}

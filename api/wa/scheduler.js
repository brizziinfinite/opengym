/* Levanta — proactive messages. Runs every 30 s; each message is sent at most once per day per
 * user (dates kept on user.wa), by the user's own clock.
 *   daily    — on a training day, at the user's time: today's workout + why it matters
 *   check-in — 3 h later, if nothing was logged: "conseguiu treinar?"
 *   weekly   — Sunday 19:00: the week in numbers
 *   monthly  — day 1, 09:00: last month vs the one before */
import { sendText } from './evolution.js';
import { dailyMessage, weeklyText, monthlyText, TZ } from './flow.js';
import { addDays } from './progress.js';
import { isSenior } from './plan.js';

const minutes = hhmm => { const [h, m] = String(hhmm || '').split(':').map(Number); return h * 60 + m; };
const inWindow = (now, target, span = 120) => { const n = minutes(now), t = minutes(target); return n >= t && n < t + span; };

export function startScheduler({ db, saveDb, readState, userNow }) {
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      for (const user of db.users) {
        const wa = user.wa;
        if (!user.phone || !wa || wa.step !== 'active' || wa.optedOut) continue;
        const now = userNow(wa.tz || TZ); if (!now) continue;
        const S = readState(user.id); if (!S) continue;
        const time = wa.profile?.time || '07:00';
        const doneToday = (S.workouts || []).some(w => w.d === now.date);
        const out = [];
        // Two weeks without a word from them: stop the daily messages, keep one "door open"
        // note a week (Sunday's summary slot) — nagging is how people block a number.
        const silentDays = wa.lastInbound ? (Date.parse(now.date) - Date.parse(wa.lastInbound.slice(0, 10))) / 86400000 : 0;
        const quiet = silentDays >= 14;
        if (quiet && now.weekday === 0 && wa.lastWeekly !== now.date && inWindow(now.hhmm, '19:00')) {
          wa.lastWeekly = now.date;
          out.push(`Oi, ${(user.name || '').split(' ')[0]}. Sem cobrança: seu plano continua aqui quando você quiser voltar. Um treino de 15 minutos já reabre o caminho. Responda *HOJE* quando estiver pronto(a). 💚`);
        }

        if (!wa.paused && !quiet) {
          const ov = S.dayPlan?.[now.date];
          const rid = ov === 'rest' ? null : (ov && S.routines?.some(r => r.id === ov) ? ov : S.week?.[now.weekday]);
          const r = rid ? (S.routines || []).find(x => x.id === rid) : null;
          if (r && !doneToday && wa.lastDaily !== now.date && inWindow(now.hhmm, time)) {
            wa.lastDaily = now.date; out.push(dailyMessage(user, S, r));
          }
          const checkAt = Math.min(minutes(time) + 180, 21 * 60 + 30);
          const checkHH = String(Math.floor(checkAt / 60)).padStart(2, '0') + ':' + String(checkAt % 60).padStart(2, '0');
          if (r && wa.lastDaily === now.date && !doneToday && wa.lastCheckin !== now.date && inWindow(now.hhmm, checkHH, 60)) {
            wa.lastCheckin = now.date; wa.awaitCheckin = true;
            out.push('Conseguiu treinar hoje? 💪\n*1* – Sim, fiz!\n*2* – Não deu hoje');
          }
        }
        if (!quiet && now.weekday === 0 && wa.lastWeekly !== now.date && inWindow(now.hhmm, '19:00') && (S.workouts || []).length) {
          wa.lastWeekly = now.date; out.push(weeklyText(user, S, now.date));
        }
        if (!quiet && now.date.endsWith('-01') && wa.lastMonthly !== now.date && inWindow(now.hhmm, '09:00') && (S.workouts || []).length) {
          wa.lastMonthly = now.date; out.push(monthlyText(user, S, addDays(now.date, -1)));
          // Functional test every 4 weeks: the numbers that show what got easier in daily life.
          if (isSenior(wa.profile || {}) || wa.profile?.level === 'sedentary') {
            wa.awaitTest = 'sitstand';
            out.push('📏 *Teste do mês* (leva 1 minuto): sente-se numa cadeira firme, braços cruzados no peito. Em *30 segundos*, quantas vezes você consegue levantar e sentar? Me responda só o número.');
          }
        }
        if (out.length) {
          saveDb();   // before sending: a crash mid-send must not repeat the message
          for (const text of out) await sendText(user.phone, text).catch(e => console.error('[wa] send failed', user.id, e.message));
        }
      }
    } finally { busy = false; }
  };
  setInterval(tick, 30000).unref();
  return tick;
}

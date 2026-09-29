/* Levanta — the WhatsApp conversation.
 *
 * A WhatsApp user is a normal user of this instance (db.users) with a `phone` and a `wa` block
 * holding the conversation step; their training lives in the same state file the web app
 * reads, so a workout logged by chat shows up in Stats and a plan edited on the web is what
 * the next daily message sends.
 *
 * Onboarding: consent (LGPD) → PAR-Q health screening → conditions → body → goal → level →
 * where you train (photos of the equipment) → days and time → plan. After that the user only
 * answers: FIZ, a free-text log, PESO 82, or nothing at all — the assistant comes to them.
 */
import crypto from 'node:crypto';
import { sendText, sendGif, mediaOf } from './evolution.js';
import { detectEquipment, parseLog, geminiConfigured } from './gemini.js';
import { buildPlan, exName, isSenior, EX } from './plan.js';
import { isYes, isNo, numbers, firstNumber, parseDays, parseTime, parseBody, parseWeight, norm, listDays, DAY_NAMES } from './text.js';
import { week, month, benefitOf, goalLine, addDays } from './progress.js';
import { nextPrescription, weeksAway } from './progression.js';

// Words that mean "stop the session and check on the person" — matched before any command,
// answered with a fixed script the model never rewrites. Sources: ACSM signs to terminate
// exercise; SAMU is 192 in Brazil.
const RED_FLAGS = /dor no peito|aperto no peito|peito apertado|falta de ar|sem ar|tontura|tonto|tonta|desmai|palpita|coracao (acelerado|disparado)|dor no braco|dor na mandibula|suor frio|visao (turva|embacada)|confus/;
const RED_FLAG_REPLY = '🛑 *Pare agora e sente-se.* Respire devagar.\n\n' +
  'Se não passar em poucos minutos, ou se for *dor ou aperto no peito, falta de ar, dor no braço ou na mandíbula, suor frio ou desmaio*: *ligue 192 (SAMU)* ou peça para alguém ligar.\n\n' +
  'Pausei seu plano. Converse com seu médico e, quando estiver tudo bem, me escreva *LIBERADO*. Estou aqui.';

export const TZ = process.env.WA_TZ || 'America/Sao_Paulo';
let D;   // injected: { db, saveDb, readState, writeState, userNow, magicLink }
export function initFlow(deps) { D = deps; }

const PARQ = [
  'Algum médico já disse que você tem problema no coração e que só deve fazer atividade física com orientação médica?',
  'Você sente dor no peito quando faz atividade física?',
  'No último mês, você sentiu dor no peito sem estar fazendo atividade física?',
  'Você perde o equilíbrio por tontura ou já desmaiou?',
  'Você tem algum problema nos ossos ou articulações que pode piorar com exercício?',
  'Você toma remédio para pressão ou para o coração?',
  'Existe algum outro motivo para você não fazer atividade física?'
];
const CONDITIONS = [
  ['hypertension', 'Pressão alta'], ['diabetes', 'Diabetes'], ['knee', 'Dor no joelho'], ['back', 'Dor na coluna/lombar'],
  ['shoulder', 'Dor no ombro'], ['osteoporosis', 'Osteoporose/osteopenia'], ['hip', 'Prótese de quadril'], ['vertigo', 'Labirintite/tontura frequente'],
  ['recent', 'Cirurgia, fratura ou infarto nos últimos 6 meses'], ['cancer', 'Câncer em tratamento'], ['pregnant', 'Estou grávida']
];
// Conditions that need a doctor's ok before any plan (ACSM 2015: metabolic/cardiac/renal disease
// in someone not already training; recent events; active treatment).
const NEEDS_CLEARANCE = ['diabetes', 'recent', 'cancer'];
const GOALS = [['fatloss', 'Perder gordura'], ['muscle', 'Ganhar massa muscular'], ['strength', 'Ficar mais forte'], ['general', 'Saúde e disposição']];
const LEVELS = [['sedentary', 'Estou parado(a) há bastante tempo'], ['returning', 'Estou voltando depois de uma pausa'], ['regular', 'Já treino com regularidade']];
const SETUPS = [['gym', 'Na academia'], ['home', 'Em casa, com halteres'], ['bodyweight', 'Sem equipamento, só com o corpo']];
const opts = list => list.map(([, l], i) => `*${i + 1}* – ${l}`).join('\n');

const photos = new Map();   // number → [{ base64, mimetype }] while collecting equipment photos
const queues = new Map();   // number → promise chain (one message at a time per person)

/* ---------------- users & state ---------------- */
function userByPhone(number) { return D.db.users.find(u => u.phone === number) || null; }
function createUser(number, name) {
  const user = { id: crypto.randomBytes(12).toString('base64url'), name: (name || 'Você').slice(0, 40), created: new Date().toISOString(), phone: number, wa: { step: 'consent', tz: TZ } };
  D.db.users.push(user); D.saveDb();
  return user;
}
const blankState = () => ({ unit: 'kg', lang: 'pt', restSec: 90, sound: true, keepAwake: true, theme: 'dark', accent: 'lime', body: 'male',
  bodyweight: [], routines: [], week: {}, dayPlan: {}, exWeights: {}, workouts: [], active: null, customEx: [], reminder: { on: false, time: '08:00', tz: null }, effort: null, coach: null, profile: null });
function load(user) { return Object.assign(blankState(), D.readState(user.id) || {}); }
function save(user, S) { S._ts = Date.now(); D.writeState(user.id, S); }
const today = user => (D.userNow(user.wa?.tz || TZ) || {}).date || new Date().toISOString().slice(0, 10);
const first = user => (user.name || '').split(' ')[0] || '';

function effectiveRoutine(S, iso) {
  const ov = S.dayPlan?.[iso];
  if (ov === 'rest') return null;
  const id = ov && S.routines.some(r => r.id === ov) ? ov : S.week?.[new Date(iso + 'T12:00:00Z').getUTCDay()];
  return id ? S.routines.find(r => r.id === id) || null : null;
}
const lastWeight = (S, id) => S.exWeights?.[id]?.w || 0;

/* ---------------- messages ---------------- */
const say = (user, text) => sendText(user.phone, text);

const kg = v => String(round1(v)).replace('.', ',') + ' kg';
const round1 = v => Math.round(v * 10) / 10;

// The plan as it reads in a message. With `S` history and a profile, each line carries today's
// prescription from the progression engine (target load / reps / seconds and why).
function workoutText(S, r, profile) {
  return r.ex.map((e, i) => {
    const name = exName(e.id, S);
    if (e.mode === 'time') {
      const p = profile ? nextPrescription(S, e, r, profile) : { kind: 'off' };
      const sec = p.sec || e.sec;
      return `${i + 1}. ${name} — ${e.sets} × ${sec}s${p.kind === 'up' ? ' ⬆️' : ''}`;
    }
    const p = profile ? nextPrescription(S, e, r, profile) : { kind: 'off' };
    const reps = p.reps || (e.repsMin ? e.repsMin + '–' + e.reps : e.reps);
    const w = p.weight != null ? p.weight : lastWeight(S, e.id);
    const load = w > 0 ? ` · *${kg(w)}*${p.kind === 'up' ? ' ⬆️' : p.kind === 'deload' ? ' ⬇️' : ''}` : (p.kind === 'first' ? ' · comece leve' : '');
    return `${i + 1}. ${name} — ${e.sets} × ${reps}${load}`;
  }).join('\n');
}

export function dailyMessage(user, S, r) {
  const p = S.profile || {};
  const wp = user.wa?.profile || {};
  const now = D.userNow(user.wa?.tz || TZ) || {};
  const h = +(now.hhmm || '08:00').slice(0, 2);
  const hi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const cue = wp.cue ? ` ${wp.cue.charAt(0).toUpperCase() + wp.cue.slice(1)}:` : '';
  const away = weeksAway(S, now.date || new Date().toISOString().slice(0, 10));
  const back = away >= 4 ? '\n\n🔁 Faz mais de um mês. Hoje conta como recomeço: metade das séries e cargas bem leves. Mudou alguma coisa na sua saúde? Se sim, me conte antes.'
    : away >= 2 ? '\n\n🔁 Ficou um tempo parado: hoje faça 2 séries de cada e uns 10 % menos carga.' : '';
  const first_ = !user.wa?.safetyShown;
  return `${hi}, ${first(user)}!${cue} hoje é dia de *${r.name}* 💪\n\n` +
    `🔥 Aquecer: 5 min de caminhada ou marcha no lugar, e a 1ª série do primeiro exercício bem leve.\n\n` +
    `${workoutText(S, r, wp)}\n\n` +
    `✅ *Por que hoje importa:* ${benefitOf(r, wp)}` +
    (p.conditions?.includes('hypertension') ? '\n\n⚠️ Solte o ar ao fazer força, nunca prenda a respiração, e pare antes de chegar no limite. Se tiver aparelho, meça a pressão antes: acima de 160/100, hoje é só caminhada leve.' : '') +
    (p.conditions?.includes('diabetes') ? '\n\n⚠️ Meça a glicemia antes: abaixo de 70, não treine (coma algo e meça de novo em 15 min). Leve uma bala.' : '') +
    back +
    (first_ ? '\n\n🛑 Se sentir dor no peito, tontura, falta de ar fora do normal ou desmaio: pare, sente-se e me avise. Em caso grave, ligue 192.' : '') +
    `\n\nQuando terminar, responda *FIZ*. Quer ver como faz um exercício? *COMO 2* (o número). Cargas: _"supino 3x10 40kg"_.`;
}

function planSummary(S, p) {
  const days = Object.keys(S.week).map(Number);
  return `*Seu plano* (${days.length}× por semana: ${listDays(days)} às ${p.time})\n\n` +
    S.routines.map(r => `*${r.name}*\n${workoutText(S, r, p)}`).join('\n\n');
}

const HELP = '*Comandos*\n' +
  '*HOJE* – treino de hoje\n*FIZ* – marcar o treino como feito\n*COMO 2* – ver como fazer o exercício 2\n*CAMINHEI 20* – registrar caminhada\n*PESO 82,5* – registrar seu peso\n' +
  '*RESUMO* – sua semana · *MÊS* – seu mês\n*PLANO* – ver o plano · *LINK* – abrir no app\n' +
  '*HORÁRIO* – mudar dias/horário · *REFAZER* – refazer o cadastro\n*PAUSAR* / *VOLTAR* – pausar lembretes\n*PARAR* – não receber mais · *APAGAR* – apagar meus dados';

/* ---------------- entry point ---------------- */
export function handleIncoming(msg) {
  const prev = queues.get(msg.number) || Promise.resolve();
  const next = prev.then(() => handle(msg)).catch(e => console.error('[wa] handle failed', msg.number, e));
  queues.set(msg.number, next);
  return next;
}

async function handle(msg) {
  let user = userByPhone(msg.number);
  if (!user) {
    user = createUser(msg.number, msg.name);
    return say(user, `Oi, ${first(user)}! 👋 Eu sou o *Levanta*, seu treinador pelo WhatsApp.\n\n` +
      'Eu monto seu treino, te lembro no horário certo e te mostro o que cada treino está fazendo por você. Você só precisa responder por aqui.\n\n' +
      'Para montar um plano seguro vou te fazer algumas perguntas, inclusive de saúde. Esses dados ficam guardados só para isso, e você pode apagar tudo quando quiser escrevendo *APAGAR*.\n\n' +
      'Podemos começar?\n*1* – Sim\n*2* – Agora não');
  }
  const t = norm(msg.text);
  const wa = user.wa || (user.wa = { step: 'active', tz: TZ });

  if (RED_FLAGS.test(t) && !/^liberad/.test(t)) {
    wa.redFlagAt = new Date().toISOString(); wa.paused = true; wa.awaitEffort = false; wa.awaitCheckin = false;
    if (wa.step === 'active') wa.step = 'paused_health';
    D.saveDb();
    return say(user, RED_FLAG_REPLY);
  }
  if (wa.step === 'paused_health') {
    if (/liberad|tudo bem|passou|estou bem|melhorei/.test(t)) { wa.step = 'active'; wa.paused = false; D.saveDb(); return say(user, 'Que bom! Plano de volta, com calma: a próxima sessão vai um pouco mais leve. Se qualquer sintoma voltar, pare e me avise. 💚'); }
    return say(user, 'Seu plano está pausado por segurança. Quando tiver falado com o médico e estiver bem, me escreva *LIBERADO*.');
  }

  // Commands that work at any step
  if (/^(parar|sair|cancelar|stop)$/.test(t)) { wa.optedOut = true; D.saveDb(); return say(user, 'Pronto, não vou mais te mandar mensagens. Se quiser voltar, é só escrever *VOLTAR*. 👋'); }
  if (/^apagar( meus dados)?$/.test(t)) { wa.confirmDelete = true; D.saveDb(); return say(user, 'Isso apaga *todo* o seu cadastro, plano e histórico, sem volta. Confirma?\n*1* – Sim, apagar tudo\n*2* – Não'); }
  if (wa.confirmDelete) {
    wa.confirmDelete = false;
    if (isYes(t)) { D.deleteUser(user.id); return sendText(msg.number, 'Seus dados foram apagados. Obrigado por ter treinado com o Levanta. Se um dia quiser voltar, é só mandar um oi. 💚'); }
    D.saveDb(); return say(user, 'Ok, nada foi apagado.');
  }
  if (wa.optedOut && /^(voltar|oi|ola)/.test(t)) { wa.optedOut = false; wa.paused = false; D.saveDb(); return say(user, 'Que bom te ver de volta! 💚 ' + (wa.step === 'active' ? 'Seus lembretes estão ligados de novo.' : 'Vamos continuar de onde paramos.')); }
  if (/^(ajuda|menu|comandos|\?)$/.test(t)) return say(user, HELP);
  if (/^refazer$/.test(t)) { wa.step = 'consent'; wa.draft = {}; D.saveDb(); return say(user, 'Vamos refazer seu cadastro. Seu histórico de treinos continua salvo.\n\nPodemos começar?\n*1* – Sim\n*2* – Agora não'); }

  if (wa.step === 'reschedule') return reschedule(user, msg);
  if (wa.step !== 'active') return onboarding(user, msg, t);
  return active(user, msg, t);
}

/* ---------------- onboarding ---------------- */
async function onboarding(user, msg, t) {
  const wa = user.wa; const d = wa.draft || (wa.draft = {});
  const next = (step, text) => { wa.step = step; D.saveDb(); return say(user, text); };

  switch (wa.step) {
    case 'consent':
      if (isNo(t)) return say(user, 'Sem problemas! Quando quiser começar, é só responder *1*.');
      if (!isYes(t)) return say(user, 'Responda *1* para começar ou *2* para deixar para depois.');
      wa.consentAt = new Date().toISOString();
      return next('parq', '*Triagem de saúde* (PAR-Q)\nResponda com os *números* das perguntas em que a resposta é *sim* (ex.: _2 5_), ou *0* se nenhuma:\n\n' +
        PARQ.map((q, i) => `*${i + 1}.* ${q}`).join('\n'));

    case 'parq': {
      if (!/\d|nenhum|nao/.test(t)) return say(user, 'Me responda com os números (ex.: _2 5_) ou *0* se nenhuma se aplica.');
      d.parq = numbers(t, 7);
      if (d.parq.length) return next('clearance', 'Obrigado pela sinceridade. 🙏 Pelas suas respostas, o recomendado é *conversar com um médico antes de começar* — é o padrão de segurança para qualquer programa de exercícios.\n\n' +
        '*1* – Já tenho liberação médica, pode seguir\n*2* – Vou falar com o médico antes (me chame quando estiver liberado(a) com *LIBERADO*)');
      return next('conditions', conditionsQ());
    }
    case 'clearance':
      if (isYes(t) || /liberad/.test(t)) { d.clearance = true; return next('conditions', conditionsQ()); }
      if (isNo(t)) return next('waiting_clearance', 'Combinado! Quando o médico liberar, me escreva *LIBERADO* e eu monto seu plano. Estou aqui. 💚');
      return say(user, 'Responda *1* se já tem liberação ou *2* para falar com o médico antes.');
    case 'waiting_clearance':
      if (/liberad/.test(t)) { d.clearance = true; return next('conditions', conditionsQ()); }
      return say(user, 'Quando o médico te liberar, é só escrever *LIBERADO*. 💚');

    case 'conditions': {
      d.conditions = numbers(t, CONDITIONS.length).map(n => CONDITIONS[n - 1][0]);
      if (d.conditions.includes('pregnant')) return next('waiting_clearance', 'Parabéns pela gestação! 💚 Na gravidez o treino precisa ser prescrito por um profissional que acompanhe você de perto, junto com o obstetra — não é algo que eu deva montar sozinho. Depois do pós-parto liberado, me escreva *LIBERADO* e seguimos.');
      if (!d.clearance && d.conditions.some(c => NEEDS_CLEARANCE.includes(c))) return next('clearance2', 'Obrigado por contar. Com essa condição, o padrão de segurança é ter o *ok do médico* antes de começar.\n\n*1* – Já tenho liberação, pode seguir\n*2* – Vou falar com o médico antes (me chame com *LIBERADO*)');
      return next('body', 'Agora me conte numa mensagem só: *idade, sexo, altura e peso*.\nEx.: _52, feminino, 1,62, 70kg_');
    }
    case 'clearance2': {
      if (isYes(t) || /liberad/.test(t)) { d.clearance = true; d.clearanceAt = new Date().toISOString(); return next('body', 'Agora me conte numa mensagem só: *idade, sexo, altura e peso*.\nEx.: _52, feminino, 1,62, 70kg_'); }
      if (isNo(t)) return next('waiting_clearance', 'Combinado! Quando o médico liberar, me escreva *LIBERADO* e eu monto seu plano. Estou aqui. 💚');
      return say(user, 'Responda *1* se já tem liberação ou *2* para falar com o médico antes.');
    }
    case 'body': {
      Object.assign(d, Object.fromEntries(Object.entries(parseBody(msg.text)).filter(([, v]) => v != null)));
      const miss = [!d.age && 'idade', !d.sex && 'sexo', !d.heightCm && 'altura', !d.weightKg && 'peso'].filter(Boolean);
      if (d.age && (d.age < 18 || d.age > 100)) { delete d.age; if (d.age !== undefined || true) { D.saveDb(); return say(user, 'Por enquanto o Levanta é para maiores de 18 anos (menores precisam do consentimento dos responsáveis, que ainda não consigo registrar por aqui).'); } }
      if (miss.length) { D.saveDb(); return say(user, `Faltou: *${miss.join(', ')}*. Pode me mandar?`); }
      return next('goal', `Anotado! Qual é o seu *objetivo* principal?\n${opts(GOALS)}`);
    }
    case 'goal': {
      const n = firstNumber(t, GOALS.length); if (!n) return say(user, `Escolha um número:\n${opts(GOALS)}`);
      d.goal = GOALS[n - 1][0];
      return next('level', `E como está sua rotina de exercícios hoje?\n${opts(LEVELS)}`);
    }
    case 'level': {
      const n = firstNumber(t, LEVELS.length); if (!n) return say(user, `Escolha um número:\n${opts(LEVELS)}`);
      d.level = LEVELS[n - 1][0];
      return next('setup', `Onde você vai treinar?\n${opts(SETUPS)}`);
    }
    case 'setup': {
      const n = firstNumber(t, SETUPS.length); if (!n) return say(user, `Escolha um número:\n${opts(SETUPS)}`);
      d.setup = SETUPS[n - 1][0];
      if (d.setup === 'gym' && geminiConfigured()) {
        photos.set(user.phone, []);
        return next('photos', '📸 Me mande *fotos dos aparelhos* da sua academia (pode mandar várias). Eu vejo o que tem e monto o treino só com o que você tem.\n\nQuando terminar, escreva *PRONTO*. Se preferir pular, escreva *PULAR* e eu considero uma academia completa.');
      }
      return next('schedule', scheduleQ());
    }
    case 'photos': {
      const list = photos.get(user.phone) || [];
      if (msg.image) {
        const media = msg.image.inlineBase64 ? { base64: msg.image.inlineBase64, mimetype: msg.image.mimetype } : await mediaOf(msg.image.id).catch(() => null);
        if (media && list.length < 12) { list.push(media); photos.set(user.phone, list); }
        return list.length === 1 ? say(user, 'Recebi! Pode mandar mais, e escreva *PRONTO* no final.') : undefined;
      }
      if (/^pular/.test(t)) { photos.delete(user.phone); return next('schedule', scheduleQ()); }
      if (/^pronto/.test(t)) {
        if (!list.length) return say(user, 'Não recebi nenhuma foto ainda. Mande as fotos ou escreva *PULAR*.');
        await say(user, 'Olhando suas fotos… 🔎');
        try { d.equipment = await detectEquipment(list); } catch (e) { console.error('[wa] detectEquipment', e); d.equipment = null; }
        photos.delete(user.phone);
        const eqPt = { 'leverage machine': 'máquinas', cable: 'polia/cabo', dumbbell: 'halteres', barbell: 'barra', 'smith machine': 'Smith', kettlebell: 'kettlebell', band: 'elásticos', 'ez barbell': 'barra W', 'stability ball': 'bola suíça', 'sled machine': 'leg press' };
        const seen = (d.equipment || []).map(e => eqPt[e] || e);
        return next('schedule', (seen.length ? `Encontrei: *${seen.join(', ')}*. Vou montar com isso. 👍\n\n` : 'Não consegui identificar os aparelhos, então vou considerar uma academia completa.\n\n') + scheduleQ());
      }
      return say(user, 'Pode mandar as fotos. Quando terminar, escreva *PRONTO* (ou *PULAR*).');
    }
    case 'schedule': {
      const days = parseDays(msg.text), time = parseTime(msg.text);
      if (days.length) d.days = days; if (time) d.time = time;
      if (!d.days?.length) { D.saveDb(); return say(user, 'Quais *dias da semana* você pode? Ex.: _seg qua sex_'); }
      if (!d.time) { D.saveDb(); return say(user, 'E que *horário*? Ex.: _7h_ ou _18:30_'); }
      if (d.days.length < 2) { d.days = null; D.saveDb(); return say(user, 'Para ter resultado, o mínimo recomendado é *2 dias por semana*. Quais dias você consegue? Ex.: _ter qui_'); }
      return next('cue', 'Última: *onde* e *depois de quê* você vai treinar? Ter isso decidido é o que mais ajuda a não pular.\nEx.: _na sala, depois do café_ ou _na academia, saindo do trabalho_');
    }
    case 'cue': {
      d.cue = String(msg.text || '').trim().slice(0, 80) || null;
      return finishOnboarding(user);
    }
    default:
      wa.step = 'consent'; D.saveDb(); return say(user, 'Vamos começar? *1* – Sim  *2* – Agora não');
  }
}
const conditionsQ = () => `Você tem alguma destas condições? Responda os números (ex.: _1 3_) ou *0* se nenhuma:\n${opts(CONDITIONS)}`;
const scheduleQ = () => 'Quase lá! Quais *dias e horário* você pode treinar?\nEx.: _seg qua sex 7h_ ou _terça e quinta 18:30_';

async function finishOnboarding(user) {
  const d = user.wa.draft;
  const bmi0 = d.heightCm ? d.weightKg / Math.pow(d.heightCm / 100, 2) : null;
  const profile = { age: d.age, sex: d.sex, heightCm: d.heightCm, bmi: bmi0 ? Math.round(bmi0 * 10) / 10 : null, goal: d.goal, level: d.level, setup: d.setup, equipment: d.equipment || null,
    days: d.days, time: d.time, cue: d.cue || null, conditions: d.conditions || [], parq: d.parq || [], clearance: !!d.clearance };
  const plan = buildPlan(profile);
  const S = load(user);
  const iso = today(user);
  // keep any previous history; the plan replaces the schedule
  S.routines = [...S.routines.filter(r => !r.auto), ...plan.routines];
  S.week = plan.week;
  S.customEx = [...(S.customEx || []).filter(c => !plan.customEx.some(x => x.id === c.id)), ...plan.customEx];
  S.body = d.sex === 'female' ? 'female' : 'male';
  const ex = S.bodyweight.find(b => b.d === iso);
  if (ex) ex.w = d.weightKg; else S.bodyweight.push({ d: iso, w: d.weightKg, t: Date.now(), src: 'wa' });
  S.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1));
  S.profile = { done: true, sex: d.sex, birthYear: +iso.slice(0, 4) - d.age, heightCm: d.heightCm,
    goal: d.goal === 'general' ? 'general' : d.goal, experience: d.level === 'regular' ? 'regular' : d.level === 'returning' ? 'returning' : 'new',
    daysPerWeek: Object.keys(plan.week).length, preferredDays: Object.keys(plan.week).map(Number), sessionMin: isSenior(profile) ? 30 : 45,
    setup: d.setup, conditions: profile.conditions, via: 'whatsapp' };
  save(user, S);
  user.wa = { ...user.wa, step: 'active', profile, draft: undefined };
  D.saveDb();
  const bmi = d.heightCm ? d.weightKg / Math.pow(d.heightCm / 100, 2) : null;
  const senior = isSenior(profile);
  const walkDays = (d.days || []).filter(x => !Object.keys(plan.week).map(Number).includes(x));
  await say(user, `Pronto, ${first(user)}! 🎉\n\n${planSummary(S, profile)}` +
    (walkDays.length ? `\n\n🚶 *Caminhada* · ${listDays(walkDays)}: ${isSenior(profile) || d.level === 'sedentary' ? '10 min' : '20 min'} em ritmo de conversa (dá para falar, não para cantar). Depois me escreva *CAMINHEI 10*.` : '') +
    (senior ? '\n\n👉 Seu plano começa pelo que mais importa agora: *pernas fortes e equilíbrio*. É isso que mantém a independência e previne quedas. Vamos aumentando aos poucos.' : '') +
    (bmi && bmi >= 30 && d.goal === 'fatloss' ? '\n\n👉 Para perder gordura, o treino ajuda muito — mas a alimentação decide. Se puder, procure também um(a) nutricionista.' : ''));
  return say(user, `*Como funciona:* nos dias de treino eu te mando o treino às *${profile.time}*. Depois é só responder *FIZ*. No domingo te mando o resumo da semana. 💚\n\n` +
    'Comece leve: a primeira sessão serve para achar suas cargas.\n\n_O Levanta dá orientação geral de exercícios e não substitui avaliação médica ou de um profissional de Educação Física (CREF)._\n\nEscreva *AJUDA* para ver os comandos.');
}

/* ---------------- after onboarding ---------------- */
async function active(user, msg, t) {
  const S = load(user);
  const iso = today(user);
  const wa = user.wa;

  if (msg.image && !t) return say(user, 'Recebi a foto! Se quiser atualizar os aparelhos da academia, escreva *REFAZER*.');
  if (wa.awaitEffort && /^[1-5]$/.test(t)) return rateEffort(user, S, iso, +t);
  const como = t.match(/^(como|video|vídeo|ver)\s*(\d{1,2})$/);
  if (como) {
    const r = effectiveRoutine(S, iso) || S.routines[0];
    const e = r?.ex[+como[2] - 1];
    if (!e) return say(user, 'Qual exercício? Escreva *COMO* e o número da lista de hoje, ex.: *COMO 2*.');
    return sendExercise(user, e.id, exName(e.id, S), S);
  }
  const walk = t.match(/^(caminhei|caminhada|andei|corri|pedalei)\s*(\d{1,3})/);
  if (walk) {
    const min = +walk[2];
    S.workouts.push({ id: crypto.randomBytes(8).toString('hex'), d: iso, start: Date.now() - min * 60000, end: Date.now(), name: 'Caminhada', bw: null, entries: [{ id: '3666', sets: [{ min, speed: 0, done: true }], target: { min } }], prs: [], src: 'wa', cardio: true });
    save(user, S);
    const wkMin = S.workouts.filter(x => x.cardio && weekKeyOf(x.d) === weekKeyOf(iso)).reduce((a, x) => a + (x.end - x.start) / 60000, 0);
    return say(user, `Caminhada de *${min} min* anotada! 🚶 Esta semana: *${Math.round(wkMin)} min* de aeróbio (meta: 150).`);
  }
  if (/^(hoje|treino|treino de hoje)$/.test(t)) {
    const r = effectiveRoutine(S, iso);
    return say(user, r ? dailyMessage(user, S, r) : `Hoje é dia de *descanso* 😌 — o músculo cresce na recuperação. Próximo treino: ${nextTraining(S, iso)}.`);
  }
  if (/^plano$/.test(t)) return say(user, planSummary(S, { time: wa.profile?.time || '—' }));
  if (/^(link|app|abrir)$/.test(t)) return say(user, `Seu acesso ao app (vale por 15 minutos): ${D.magicLink(user)}`);
  if (/^pausar$/.test(t)) { wa.paused = true; D.saveDb(); return say(user, 'Lembretes pausados. Quando quiser, escreva *VOLTAR*.'); }
  if (/^voltar$/.test(t)) { wa.paused = false; D.saveDb(); return say(user, 'Lembretes ligados de novo! 💪'); }
  if (/^(resumo|semana)$/.test(t)) return say(user, weeklyText(user, S, iso));
  if (/^(mes|mês)$/.test(t)) return say(user, monthlyText(user, S, iso));
  if (/^horario/.test(t)) { wa.step = 'reschedule'; D.saveDb(); return say(user, 'Quais *dias e horário* agora? Ex.: _seg qua sex 7h_'); }
  if (/^peso\b/.test(t) || (/^\d{2,3}([.,]\d+)?\s*kg$/.test(t))) {
    const w = parseWeight(t); if (!w) return say(user, 'Me mande assim: *PESO 82,5*');
    const e = S.bodyweight.find(b => b.d === iso);
    const prev = S.bodyweight.filter(b => b.d < iso).slice(-1)[0];
    if (e) { e.w = w; e.t = Date.now(); } else S.bodyweight.push({ d: iso, w, t: Date.now(), src: 'wa' });
    S.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1)); save(user, S);
    const diff = prev ? Math.round((w - prev.w) * 10) / 10 : null;
    return say(user, `Peso anotado: *${String(w).replace('.', ',')} kg*` + (diff ? ` (${diff > 0 ? '+' : ''}${String(diff).replace('.', ',')} kg desde ${prev.d.slice(8, 10)}/${prev.d.slice(5, 7)})` : '') + ' ✅');
  }
  if (wa.awaitCheckin && (t === '2' || /^nao/.test(t))) {
    wa.awaitCheckin = false;
    const tomorrow = addDays(iso, 1);
    const r = effectiveRoutine(S, iso);
    if (r && !effectiveRoutine(S, tomorrow)) { S.dayPlan[tomorrow] = r.id; save(user, S); D.saveDb(); return say(user, `Tudo bem, acontece! Passei o *${r.name}* para amanhã (${DAY_NAMES[new Date(tomorrow + 'T12:00:00Z').getUTCDay()]}). Mesmo horário. 💪`); }
    D.saveDb(); return say(user, 'Tudo bem, acontece! Amanhã a gente segue. Se sobrar 15 minutos hoje, só os 2 primeiros exercícios já valem. 💪');
  }
  // "fiz" / "1" after the check-in / free-text log
  if (/^(fiz|feito|treinei|1|done|terminei)\b/.test(t) || /\d+\s*x\s*\d+/.test(t)) return logWorkout(user, S, iso, msg.text, t);

  return say(user, 'Não entendi 🤔 Escreva *AJUDA* para ver o que posso fazer.');
}

function nextTraining(S, iso) {
  for (let i = 1; i <= 7; i++) { const d = addDays(iso, i); const r = effectiveRoutine(S, d); if (r) return `${DAY_NAMES[new Date(d + 'T12:00:00Z').getUTCDay()]} (${r.name})`; }
  return 'nenhum agendado';
}

// The animation + the first instruction steps for one exercise.
async function sendExercise(user, id, name, S) {
  const ex = EX[id];
  const custom = (S.customEx || []).find(c => c.id === id);
  const steps = custom?.desc ? custom.desc : (ex ? (D.instructions(id) || []).slice(0, 4).map((x, i) => `${i + 1}. ${x}`).join('\n') : '');
  if (ex?.gif) return sendGif(user.phone, `${D.origin}/gif/${ex.gif}`, `*${name}*\n${steps}`);
  return say(user, `*${name}*\n${steps || 'Faça devagar, com controle, e pare se sentir dor.'}`);
}

const weekKeyOf = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

async function logWorkout(user, S, iso, raw, t) {
  const r = effectiveRoutine(S, iso) || S.routines.find(x => x.id === S.workouts[S.workouts.length - 1]?.routineId) || S.routines[0];
  if (!r) return say(user, 'Você ainda não tem um plano. Escreva *REFAZER* para montar.');
  if (S.workouts.some(w => w.d === iso && w.src === 'wa' && w.routineId === r.id) && !/\d+\s*x\s*\d+/.test(t)) return say(user, 'Já anotei seu treino de hoje! ✅ Descanse bem.');
  let parsed = null;
  if (/\d+\s*x\s*\d+|\d+\s*kg/.test(t) && geminiConfigured()) {
    try { parsed = await parseLog(raw, r.ex.map(e => ({ id: e.id, name: exName(e.id, S) }))); } catch (e) { console.error('[wa] parseLog', e); }
  }
  const minutes = S.profile?.sessionMin || 45;
  const entries = r.ex.map(e => {
    const logged = parsed?.exercises?.find(x => x.id === e.id);
    if (logged) return { id: e.id, sets: logged.sets.map(s => ({ w: s.w, r: s.r, done: true })), target: { reps: e.reps, sets: e.sets } };
    if (e.mode === 'time') return { id: e.id, sets: Array.from({ length: e.sets }, () => ({ sec: e.sec, w: 0, done: true })), target: { sec: e.sec, sets: e.sets } };
    const w = lastWeight(S, e.id);
    // No numbers: stored as done but `unknown` — the progression engine will not treat it as
    // a success, so a plain FIZ never raises the load by itself.
    return { id: e.id, sets: Array.from({ length: e.sets }, () => ({ w, r: e.reps, done: true })), target: { reps: e.reps, sets: e.sets }, unknown: true };
  });
  const end = Date.now();
  // PRs: heavier than anything logged before for that exercise
  const prs = entries.filter(e => { const mx = Math.max(0, ...e.sets.map(s => s.w || 0)); return mx > 0 && mx > lastWeight(S, e.id); }).map(e => e.id);
  const w = { id: crypto.randomBytes(8).toString('hex'), d: iso, start: end - minutes * 60000, end, routineId: r.id, name: r.name, bw: null, entries, prs, src: 'wa' };
  w.vol = entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + (s.w || 0) * (s.r || 0), 0), 0);
  // replace an earlier chat log of the same session (a detailed log after a plain "FIZ")
  S.workouts = S.workouts.filter(x => !(x.d === iso && x.src === 'wa' && x.routineId === r.id));
  S.workouts.push(w);
  entries.forEach(e => { const mx = Math.max(0, ...e.sets.map(s => s.w || 0)); if (mx > 0 && mx > lastWeight(S, e.id)) S.exWeights[e.id] = { w: mx, d: iso }; });
  save(user, S);
  user.wa.awaitCheckin = false; user.wa.awaitEffort = w.id; user.wa.safetyShown = true; D.saveDb();
  return say(user, `Boa, ${first(user)}! 🔥 *${r.name}* anotado.` +
    (prs.length ? `\n🏆 Recorde em: ${prs.map(id => exName(id, S)).join(', ')}!` : '') +
    `\n\nDe *1 a 5*, quanto foi difícil?\n*1* muito fácil · *2* fácil · *3* no ponto · *4* difícil · *5* no limite`);
}

// The effort rating after a session: stored on every entry of that workout, and it is what
// moves the load when the person logged no numbers (see progression.js).
async function rateEffort(user, S, iso, n) {
  const w = S.workouts.find(x => x.id === user.wa.awaitEffort);
  user.wa.awaitEffort = false;
  if (!w) { D.saveDb(); return say(user, 'Anotado!'); }
  w.effort = n; w.entries.forEach(e => { e.effort = n; });
  save(user, S); D.saveDb();
  const wk = week(S, iso);
  const left = Math.max(0, wk.planned - wk.count);
  const senior = isSenior(user.wa.profile || {});
  const line = n <= 2 ? (senior && (S.workouts.length < 12) ? 'Ótimo. Nas primeiras semanas a meta é ficar no *3*, então subimos só um pouquinho.' : 'Estava fácil: na próxima sessão subo a carga. ⬆️')
    : n === 3 ? 'No ponto. É exatamente aí que o corpo evolui com segurança.'
    : n === 4 ? 'Difícil mas feito. Mantemos a carga e ganhamos folga antes de subir.'
    : 'Foi pesado. Na próxima sessão eu reduzo 10 % — recuar um passo para avançar dois.';
  return say(user, `${line}\n\nSemana: *${wk.count}${wk.planned ? '/' + wk.planned : ''}* treinos${left ? ` — faltam ${left}` : ' — semana completa! 🎉'}.\n` +
    goalLine(S.profile?.goal, wk, month(S, iso)));
}

export function weeklyText(user, S, iso) {
  const w = week(S, iso), m = month(S, iso);
  const diff = w.prev.count ? w.count - w.prev.count : null;
  return `📊 *Sua semana, ${first(user)}*\n\n` +
    `Treinos: *${w.count}${w.planned ? '/' + w.planned : ''}*${diff != null && diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff} vs semana passada)` : ''}\n` +
    `Séries: *${w.sets}* · Tempo: *${w.minutes} min*` + (w.kcal ? ` · ≈ *${w.kcal} kcal*` : '') + (w.prs ? `\n🏆 Recordes: *${w.prs}*` : '') +
    `\n\n${goalLine(S.profile?.goal, w, m)}\n\n` +
    (w.count >= w.planned && w.planned ? 'Semana completa. Isso é consistência — e é ela que traz resultado. 💚' : w.count ? 'Cada treino conta. Semana que vem a gente fecha tudo! 💪' : 'Semana difícil acontece. Amanhã é um novo começo — até 15 minutos já fazem diferença. 💚');
}

export function monthlyText(user, S, iso) {
  const m = month(S, iso);
  const lines = [`🗓️ *Seu mês, ${first(user)}*`, '', `Treinos: *${m.count}*${m.prev.count ? ` (mês anterior: ${m.prev.count})` : ''}`, `Tempo treinando: *${(m.minutes / 60).toFixed(1).replace('.', ',')} h*` + (m.kcal ? ` · ≈ *${m.kcal} kcal*` : '')];
  if (m.bwChange != null) lines.push(`Peso: *${m.bwChange > 0 ? '+' : ''}${String(m.bwChange).replace('.', ',')} kg*`);
  if (m.topGain) lines.push(`Maior ganho de força: *${EX[m.topGain.id]?.pt || 'exercício'}* +${String(m.topGain.gain).replace('.', ',')} kg (1RM estimado)`);
  lines.push('', m.count >= m.prev.count ? 'Você está evoluindo. Continue no ritmo! 🚀' : 'Mês que vem é a chance de voltar ao ritmo. Estou aqui. 💚');
  return lines.join('\n');
}

/* ---------------- reschedule (reuses the parsers) ---------------- */
export async function reschedule(user, msg) {
  const days = parseDays(msg.text), time = parseTime(msg.text);
  if (!days.length && !time) return say(user, 'Me mande os dias e/ou horário. Ex.: _seg qua sex 7h_');
  const p = user.wa.profile || {};
  if (time) p.time = time;
  if (days.length >= 2) {
    p.days = days;
    const S = load(user);
    const plan = buildPlan(p);
    S.routines = [...S.routines.filter(r => !r.auto), ...plan.routines];
    S.week = plan.week; save(user, S);
  }
  user.wa.profile = p; user.wa.step = 'active'; D.saveDb();
  return say(user, `Atualizado! Treinos: *${listDays(p.days || [])}* às *${p.time}*. 👍`);
}

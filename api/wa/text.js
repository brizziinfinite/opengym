/* Parsing of free Portuguese replies — numbers, days, times, body data. Pure functions, no I/O.
 * The assistant asks for numbered options first; these parsers make "sim", "seg qua sex 7h" or
 * "52 anos, mulher, 1,62, 70kg" work too, so people can answer the way they talk. */

export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export const isYes = s => /^(1|sim|s|ok|claro|pode|bora|yes|isso|aceito|concordo)\b/.test(norm(s));
export const isNo = s => /^(2|nao|n|no|nunca)\b/.test(norm(s));

// All option numbers in a reply ("2 e 5", "2,5", "25" when options are single digits).
export function numbers(s, max = 9) {
  const t = norm(s);
  if (/^(0|nenhum|nenhuma|nao|nada)\b/.test(t)) return [];
  const out = new Set();
  for (const m of t.matchAll(/\d+/g)) {
    const n = +m[0];
    if (n >= 1 && n <= max) out.add(n);
    else if (m[0].length > 1 && [...m[0]].every(c => +c >= 1 && +c <= max)) [...m[0]].forEach(c => out.add(+c));
  }
  return [...out].sort((a, b) => a - b);
}
export const firstNumber = (s, max = 9) => numbers(s, max)[0] || null;

const DAY_WORDS = [
  [0, /\bdom(ingo)?s?\b/], [1, /\bseg(unda)?s?(-feira)?\b/], [2, /\bter(ca)?s?(-feira)?\b/],
  [3, /\bqua(rta)?s?(-feira)?\b/], [4, /\bqui(nta)?s?(-feira)?\b/], [5, /\bsex(ta)?s?(-feira)?\b/],
  [6, /\bsab(ado)?s?\b/]
];
/** Weekdays (0 = Sunday) named in a reply. Understands ranges ("seg a sex") and "todo dia". */
export function parseDays(s) {
  const t = norm(s);
  if (/todo(s)? (os )?dia|diariamente/.test(t)) return [1, 2, 3, 4, 5, 6];
  if (/fim de semana|final de semana/.test(t)) return [0, 6];
  const range = t.match(/\b(dom|seg|ter|qua|qui|sex|sab)\w*\s*(?:a|ate|-)\s*(dom|seg|ter|qua|qui|sex|sab)\w*/);
  if (range) {
    const idx = w => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].indexOf(w);
    let a = idx(range[1]), b = idx(range[2]); const out = [];
    for (let i = 0; i < 7 && out.length < 7; i++) { out.push(a); if (a === b) break; a = (a + 1) % 7; }
    return out;
  }
  const days = DAY_WORDS.filter(([, re]) => re.test(t)).map(([d]) => d);
  return days;
}

/** "7h", "7:30", "18h30", "às 6 da manhã", "8 da noite" → "HH:MM" or null. */
export function parseTime(s) {
  const t = norm(s);
  const m = t.match(/\b(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?\b/) || t.match(/\bas\s+(\d{1,2})\b/) || t.match(/\b(\d{1,2})\s+da\s+(manha|tarde|noite)\b/);
  if (!m) return null;
  let h = +m[1], min = m[2] && /^\d{2}$/.test(m[2]) ? +m[2] : 0;
  if (/\b(tarde|noite)\b/.test(t) && h < 12) h += 12;
  if (h > 23 || min > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

/** "52, feminino, 1,62, 70kg" / "tenho 40 anos homem 180cm 90 kg" → partial body data. */
export function parseBody(s) {
  const t = norm(s).replace(/(\d),(\d)/g, '$1.$2');
  const out = {};
  if (/\b(fem|feminino|mulher|f)\b/.test(t)) out.sex = 'female';
  else if (/\b(masc|masculino|homem|m)\b/.test(t)) out.sex = 'male';
  let rest = t;
  const h = rest.match(/\b([12]\.\d{2})\s*m?\b/) || rest.match(/\b(1\d{2}|2[0-2]\d)\s*cm\b/);
  if (h) { const v = +h[1]; out.heightCm = v < 3 ? Math.round(v * 100) : v; rest = rest.replace(h[0], ' '); }
  const w = rest.match(/\b(\d{2,3}(?:\.\d)?)\s*(kg|quilos?|kilos?)\b/);
  if (w) { out.weightKg = +w[1]; rest = rest.replace(w[0], ' '); }
  const a = rest.match(/\b(\d{2})\s*anos\b/) || rest.match(/\b(1[2-9]|[2-9]\d)\b/);
  if (a) { out.age = +a[1]; rest = rest.replace(a[0], ' '); }
  if (!out.weightKg) { const w2 = rest.match(/\b(\d{2,3}(?:\.\d)?)\b/); if (w2 && +w2[1] >= 30 && +w2[1] <= 300) out.weightKg = +w2[1]; }
  if (!out.heightCm) { const h2 = rest.match(/\b(1[4-9]\d|2[0-2]\d)\b/); if (h2) out.heightCm = +h2[1]; }
  return out;
}

/** "peso 82,5" / "82.5kg" → kg or null. */
export function parseWeight(s) {
  const t = norm(s).replace(/(\d),(\d)/g, '$1.$2');
  const m = t.match(/\b(\d{2,3}(?:\.\d{1,2})?)\b/);
  const v = m ? +m[1] : NaN;
  return v >= 25 && v <= 350 ? v : null;
}

export const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const listDays = ds => {
  const n = [...ds].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_SHORT[d]);
  return n.length > 1 ? n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1] : (n[0] || '');
};

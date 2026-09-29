/* Evolution API (WhatsApp) client — the only module that talks to WhatsApp.
 * Env: EVOLUTION_URL (https://evo.example.com), EVOLUTION_INSTANCE, EVOLUTION_APIKEY.
 * Swapping to the official Cloud API later means replacing this file only. */

const BASE = (process.env.EVOLUTION_URL || '').replace(/\/+$/, '');
const INSTANCE = process.env.EVOLUTION_INSTANCE || '';
const KEY = process.env.EVOLUTION_APIKEY || '';

export const evolutionConfigured = () => !!(BASE && INSTANCE && KEY);

async function call(path, body) {
  const res = await fetch(`${BASE}${path}/${encodeURIComponent(INSTANCE)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`evolution ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json().catch(() => ({}));
}

// number: digits only, with country code (5518999999999)
export async function sendText(number, text) {
  if (!evolutionConfigured()) { console.log('[wa:dry-run]', number, '\n' + text); return; }
  // a short "typing…" delay reads as a person, not a blast
  await call('/message/sendText', { number, text, delay: 800 });
}

// Media of an incoming message, as { base64, mimetype } — used for equipment photos.
export async function mediaOf(messageKeyId) {
  const r = await call('/chat/getBase64FromMediaMessage', { message: { key: { id: messageKeyId } }, convertToMp4: false });
  return r && r.base64 ? { base64: r.base64, mimetype: r.mimetype || 'image/jpeg' } : null;
}

/* Normalise a webhook call (event messages.upsert) into what the assistant needs, or null for
 * anything that is not a new message from a person: our own sends, groups, status broadcasts. */
export function parseWebhook(body) {
  const ev = String(body?.event || '').toLowerCase().replace(/_/g, '.');
  if (ev !== 'messages.upsert') return null;
  const d = Array.isArray(body.data) ? body.data[0] : body.data;
  const key = d?.key || {};
  const jid = key.remoteJid || '';
  if (key.fromMe || !jid.endsWith('@s.whatsapp.net')) return null;
  const m = d.message || {};
  const text = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.buttonsResponseMessage?.selectedDisplayText || m.listResponseMessage?.title || '';
  const image = m.imageMessage ? { id: key.id, inlineBase64: m.base64 || d.base64 || null, mimetype: m.imageMessage.mimetype || 'image/jpeg' } : null;
  return { number: jid.split('@')[0], name: d.pushName || '', text: String(text).trim(), image, msgId: key.id };
}

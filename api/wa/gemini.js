/* Gemini (Google AI) client — reads equipment photos and free-text workout logs.
 * Env: GEMINI_API_KEY, GEMINI_MODEL (default gemini-2.5-flash).
 * Everything returns structured JSON validated against fixed vocabularies here: model output is
 * data, never trusted as-is. */
import { EQUIPMENT_KEYS } from './plan.js';

const KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const geminiConfigured = () => !!KEY;

async function generate(parts, schema) {
  if (!KEY) throw new Error('GEMINI_API_KEY not set');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1 }
    })
  });
  if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const txt = j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
  return JSON.parse(txt);
}

/** Equipment categories visible in gym photos → subset of the library's `eq` values. */
export async function detectEquipment(images) {
  const vocab = EQUIPMENT_KEYS.filter(k => k !== 'custom');
  const out = await generate([
    { text: 'These are photos of the gym equipment a person has access to. List which of these equipment categories are visible (only from this list): ' + vocab.join(', ') + '. "leverage machine" = any plate-loaded or selectorized machine (leg press, chest press, leg curl…). "cable" = cable/pulley station. Answer JSON.' },
    ...images.map(im => ({ inline_data: { mime_type: im.mimetype, data: im.base64 } }))
  ], { type: 'object', properties: { equipment: { type: 'array', items: { type: 'string' } } }, required: ['equipment'] });
  return (out.equipment || []).filter(e => vocab.includes(e));
}

/** Free text like "fiz supino 3x10 com 40kg e leg 3x12 80" → sets per planned exercise. */
export async function parseLog(text, planned) {
  const list = planned.map(p => `${p.id}: ${p.name}`).join('\n');
  const out = await generate([{ text:
    'A person logged a workout in Portuguese on WhatsApp. Map it to the planned exercises below (use their ids; ignore anything that does not match). ' +
    'For each exercise return the sets as {reps, weight_kg}. "3x10 com 40" = 3 sets of 10 reps at 40 kg. If no weight is given use 0. If the text only says they did everything as planned, return done_as_planned=true.\n\nPlanned:\n' + list + '\n\nMessage:\n' + text }],
  { type: 'object', properties: {
      done_as_planned: { type: 'boolean' },
      exercises: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string' }, sets: { type: 'array', items: { type: 'object', properties: { reps: { type: 'integer' }, weight_kg: { type: 'number' } }, required: ['reps'] } } }, required: ['id', 'sets'] } }
    }, required: ['done_as_planned'] });
  const ids = new Set(planned.map(p => p.id));
  return {
    doneAsPlanned: !!out.done_as_planned,
    exercises: (out.exercises || []).filter(e => ids.has(e.id)).map(e => ({
      id: e.id,
      sets: (e.sets || []).slice(0, 12).map(s => ({ r: Math.max(0, Math.min(100, Math.round(+s.reps || 0))), w: Math.max(0, Math.min(1000, +s.weight_kg || 0)) })).filter(s => s.r > 0)
    })).filter(e => e.sets.length)
  };
}

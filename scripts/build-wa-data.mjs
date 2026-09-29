#!/usr/bin/env node
/* Generates api/wa/exercises.json — what the WhatsApp assistant needs to talk about exercises:
 * the pt-BR name (frontend/src/names/pt.js), the English name as a fallback, and the taxonomy
 * fields plans are built from. Same arrangement as api/coach/library.json: generated from the
 * frontend's data and committed, so the api image never reaches into frontend/.
 *
 *   node scripts/build-wa-data.mjs           # write
 *   node scripts/build-wa-data.mjs --check   # fail if stale
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { EXDB } = await import(pathToFileURL(join(root, 'frontend/src/lib/exercises-data.js')).href)
const { default: PT } = await import(pathToFileURL(join(root, 'frontend/src/names/pt.js')).href)
const out = join(root, 'api/wa/exercises.json')
const data = Object.fromEntries(EXDB.map(e => [e.id, { pt: PT[e.id] || e.n, en: e.n, eq: e.eq, bp: e.bp, tg: e.tg, gif: e.gif }]))
const json = JSON.stringify(data) + '\n'
if (process.argv.includes('--check')) {
  let cur = null; try { cur = readFileSync(out, 'utf8') } catch {}
  if (cur !== json) { console.error('api/wa/exercises.json is out of date — run: node scripts/build-wa-data.mjs'); process.exit(1) }
  console.log('api/wa/exercises.json in sync.')
} else { writeFileSync(out, json); console.log(`Wrote ${out} (${EXDB.length} exercises, ${(json.length / 1024).toFixed(0)} KB)`) }

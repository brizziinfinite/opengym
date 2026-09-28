#!/usr/bin/env node
// Builds the pt-BR exercise name pack (frontend/src/names/pt.js). Same flow as
// translate-instructions-pt.mjs: split the English names into batches, translate them
// outside this script, merge them back.
//
//   node scripts/translate-names-pt.mjs extract   # EXDB → scripts/.names-pt/batch-XX.json
//   node scripts/translate-names-pt.mjs merge     # out-XX.json → frontend/src/names/pt.js
//   node scripts/translate-names-pt.mjs verify    # compare names/pt.js against EXDB
//
// batch-XX.json holds { id, n, eq, bp } (eq/bp only as context); out-XX.json is an array of
// { id, n } with the same ids in the same order.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const BATCH = 340
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = join(root, 'scripts', '.names-pt')
const outFile = join(root, 'frontend', 'src', 'names', 'pt.js')
const pad = n => String(n).padStart(2, '0')

const { EXDB } = await import(pathToFileURL(join(root, 'frontend', 'src', 'lib', 'exercises-data.js')).href)
const ids = new Set(EXDB.map(e => e.id))

function divergences(dict) {
  const out = []
  for (const id of ids) {
    const n = dict[id]
    if (typeof n !== 'string' || !n.trim()) out.push(`${id}: missing`)
  }
  for (const id of Object.keys(dict)) if (!ids.has(id)) out.push(`${id}: not in EXDB`)
  return out
}

const cmd = process.argv[2]

if (cmd === 'extract') {
  mkdirSync(workDir, { recursive: true })
  let n = 0
  for (let i = 0; i < EXDB.length; i += BATCH) {
    const batch = EXDB.slice(i, i + BATCH).map(e => ({ id: e.id, n: e.n, eq: e.eq, bp: e.bp }))
    writeFileSync(join(workDir, `batch-${pad(++n)}.json`), JSON.stringify(batch, null, 1) + '\n')
  }
  console.log(`${EXDB.length} names → ${n} batches in ${workDir}`)
} else if (cmd === 'merge') {
  const batches = readdirSync(workDir).filter(f => /^batch-\d+\.json$/.test(f)).sort()
  const dict = {}
  const problems = []
  for (const b of batches) {
    const o = b.replace('batch-', 'out-')
    if (!existsSync(join(workDir, o))) { problems.push(`${o}: missing`); continue }
    for (const { id, n } of JSON.parse(readFileSync(join(workDir, o), 'utf8'))) dict[id] = n
  }
  problems.push(...divergences(dict))
  if (problems.length) {
    console.error(problems.join('\n'))
    console.error(`${problems.length} divergences — names/pt.js not written`)
    process.exit(1)
  }
  const sorted = Object.fromEntries(Object.keys(dict).sort().map(k => [k, dict[k]]))
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, '// generated — pt-BR\nexport default ' + JSON.stringify(sorted) + '\n')
  console.log(`${Object.keys(sorted).length} names → ${outFile}`)
} else if (cmd === 'verify') {
  const { default: dict } = await import(pathToFileURL(outFile).href)
  const problems = divergences(dict)
  if (problems.length) console.error(problems.join('\n'))
  console.log(`${Object.keys(dict).length} ids in names/pt.js, ${ids.size} in EXDB — ${problems.length} divergences`)
  process.exit(problems.length ? 1 : 0)
} else {
  console.error('usage: translate-names-pt.mjs extract | merge | verify')
  process.exit(1)
}

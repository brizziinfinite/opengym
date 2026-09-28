#!/usr/bin/env node
// Builds the pt-BR exercise instruction pack (frontend/src/instr/pt.js). The upstream dataset
// has no Portuguese, so the English steps are split into batches, translated outside this
// script, and merged back.
//
//   node scripts/translate-instructions-pt.mjs extract   # EXDB → scripts/.instr-pt/batch-XX.json
//   node scripts/translate-instructions-pt.mjs merge     # out-XX.json → frontend/src/instr/pt.js
//   node scripts/translate-instructions-pt.mjs verify    # compare pt.js against EXDB, print divergences
//
// batch-XX.json / out-XX.json are arrays of { id, st: [steps] }; each out file must hold the
// same ids, and the same number of steps per id, as its batch.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const BATCH = 100
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = join(root, 'scripts', '.instr-pt')
const outFile = join(root, 'frontend', 'src', 'instr', 'pt.js')
const pad = n => String(n).padStart(2, '0')

const { EXDB } = await import(pathToFileURL(join(root, 'frontend', 'src', 'lib', 'exercises-data.js')).href)
const english = new Map(EXDB.map(e => [e.id, e.st || []]))

// Mismatches between a { id: [steps] } map and the English source.
function divergences(dict) {
  const out = []
  for (const [id, st] of english) {
    const tr = dict[id]
    if (!Array.isArray(tr)) out.push(`${id}: missing`)
    else if (tr.length !== st.length) out.push(`${id}: ${tr.length} steps, English has ${st.length}`)
    else if (tr.some(s => typeof s !== 'string' || !s.trim())) out.push(`${id}: empty step`)
  }
  for (const id of Object.keys(dict)) if (!english.has(id)) out.push(`${id}: not in EXDB`)
  return out
}

const cmd = process.argv[2]

if (cmd === 'extract') {
  mkdirSync(workDir, { recursive: true })
  let n = 0
  for (let i = 0; i < EXDB.length; i += BATCH) {
    const batch = EXDB.slice(i, i + BATCH).map(e => ({ id: e.id, st: e.st || [] }))
    writeFileSync(join(workDir, `batch-${pad(++n)}.json`), JSON.stringify(batch, null, 1) + '\n')
  }
  console.log(`${EXDB.length} exercises → ${n} batches in ${workDir}`)
} else if (cmd === 'merge') {
  const batches = readdirSync(workDir).filter(f => /^batch-\d+\.json$/.test(f)).sort()
  const dict = {}
  const problems = []
  for (const b of batches) {
    const o = b.replace('batch-', 'out-')
    if (!existsSync(join(workDir, o))) { problems.push(`${o}: missing`); continue }
    for (const { id, st } of JSON.parse(readFileSync(join(workDir, o), 'utf8'))) dict[id] = st
  }
  problems.push(...divergences(dict))
  if (problems.length) {
    console.error(problems.join('\n'))
    console.error(`${problems.length} divergences — pt.js not written`)
    process.exit(1)
  }
  const sorted = Object.fromEntries(Object.keys(dict).sort().map(k => [k, dict[k]]))
  writeFileSync(outFile, '// generated — pt-BR\nexport default ' + JSON.stringify(sorted) + '\n')
  console.log(`${Object.keys(sorted).length} exercises → ${outFile}`)
} else if (cmd === 'verify') {
  const { default: dict } = await import(pathToFileURL(outFile).href)
  const problems = divergences(dict)
  if (problems.length) console.error(problems.join('\n'))
  console.log(`${Object.keys(dict).length} ids in pt.js, ${english.size} in EXDB — ${problems.length} divergences`)
  process.exit(problems.length ? 1 : 0)
} else {
  console.error('usage: translate-instructions-pt.mjs extract | merge | verify')
  process.exit(1)
}

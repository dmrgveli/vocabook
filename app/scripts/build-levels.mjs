#!/usr/bin/env node
// Builds public/bnc-coca-levels.json from Paul Nation's BNC/COCA word family lists.
//
// Source: BNC_COCA_25000.zip from
//   https://www.wgtn.ac.nz/lals/resources/paul-nations-resources/vocabulary-analysis-programs
// Licence: CC BY-SA 4.0 (Paul Nation's resources page). The output is a derived work
// under the same licence; the app credits it in Settings → Data sources.
//
// Usage: node scripts/build-levels.mjs <folder with basewrd1.txt … basewrd34.txt>
//
// Input format (Range): a family head at the start of a line, its members on the
// following lines indented with a tab, each followed by " 0".
// Output: { source, url, license, levels: [list1, …, list25], compounds }, where each
// list is "head member member;head member;…" in lower case. Lists 31 (proper nouns),
// 32 (marginal words) and 34 (acronyms) are not used; 33 (transparent compounds) is
// kept so compounds can take the level of their parts.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = process.argv[2]
if (!dir) {
  console.error('Usage: node scripts/build-levels.mjs <folder with basewrd*.txt>')
  process.exit(1)
}

function readList(n) {
  const families = []
  const text = readFileSync(join(dir, `basewrd${n}.txt`), 'utf8').replace(/^﻿/, '')
  for (const line of text.split(/\r?\n/)) {
    const word = line.trim().split(/\s+/)[0]?.replace(/^﻿/, '').toLowerCase()
    if (!word || !/^\p{L}[\p{L}'\-.]*$/u.test(word)) continue
    if (/^\s/.test(line)) families.at(-1)?.push(word)
    else families.push([word])
  }
  return families
}

const levels = []
let forms = 0
for (let n = 1; n <= 25; n++) {
  const families = readList(n)
  forms += families.flat().length
  levels.push(families.map((f) => f.join(' ')).join(';'))
}
const compounds = readList(33)

const out = {
  source: 'BNC/COCA word family lists (25,000), I.S.P. Nation, Victoria University of Wellington',
  url: 'https://www.wgtn.ac.nz/lals/resources/paul-nations-resources/vocabulary-analysis-programs',
  license: 'CC BY-SA 4.0',
  levels,
  compounds: compounds.map((f) => f.join(' ')).join(';'),
}

const target = fileURLToPath(new URL('../public/bnc-coca-levels.json', import.meta.url))
writeFileSync(target, JSON.stringify(out))
console.log(`${levels.length} levels, ${forms} forms, ${compounds.length} compound families → ${target}`)

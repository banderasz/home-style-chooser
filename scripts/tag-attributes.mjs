#!/usr/bin/env node
// Adds the plain-adjective axis to the catalog by matching each photo's caption against
// the attribute lexicon. No API calls — it only reads text already in the catalog.
//
//   node scripts/tag-attributes.mjs [--dry] [--out src/data/catalog.json]
//
// Idempotent: it recomputes `attributes` from scratch every run, so editing the lexicon
// and re-running is the normal workflow.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ATTRIBUTES, attributeMatchers, tagsFor } from './attributes.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const i = args.indexOf('--out')
const OUT = resolve(ROOT, i === -1 ? 'src/data/catalog.json' : args[i + 1])
const DRY = args.includes('--dry')

const catalog = JSON.parse(await readFile(OUT, 'utf8'))
const matchers = attributeMatchers()

const counts = new Map(ATTRIBUTES.map((a) => [a.id, 0]))
let totalTags = 0
let untagged = 0

for (const image of catalog.images) {
  // The style query that found the photo is itself evidence, so it feeds the match too.
  const text = [image.title, ...(image.styles ?? []), ...(image.rooms ?? [])].join(' ')
  // Union of what the caption says and what the query that found the photo asserted.
  const tags = [...new Set([...(image.seedAttributes ?? []), ...tagsFor(text, matchers)])]
  image.attributes = tags
  totalTags += tags.length
  if (tags.length === 0) untagged++
  for (const t of tags) counts.set(t, counts.get(t) + 1)
}

const n = catalog.images.length
console.log(`${n} photos · ${(totalTags / n).toFixed(1)} attributes each · ${untagged} untagged`)

const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
const byGroup = new Map()
for (const attr of ATTRIBUTES) {
  if (!byGroup.has(attr.group)) byGroup.set(attr.group, [])
  byGroup.get(attr.group).push([attr.id, counts.get(attr.id)])
}
for (const [group, entries] of byGroup) {
  const line = entries
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => `${id}=${c}`)
    .join('  ')
  console.log(`  ${group.padEnd(10)} ${line}`)
}

const thin = sorted.filter(([, c]) => c < 6)
if (thin.length) {
  console.log(`\nthin attributes (<6 photos): ${thin.map(([id, c]) => `${id}=${c}`).join(', ')}`)
  console.log('harvest more for these with: npm run harvest -- --axis attributes')
}

if (DRY) {
  console.log('\n--dry: catalog not written')
} else {
  await writeFile(OUT, JSON.stringify(catalog, null, 2))
  console.log(`\nwrote ${OUT}`)
}

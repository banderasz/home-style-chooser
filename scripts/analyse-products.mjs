#!/usr/bin/env node
// Finds what goes with what in the product catalog, and writes the result to
// src/data/affinity.json for the recommender to read.
//
//   node scripts/analyse-products.mjs           # report + write
//   node scripts/analyse-products.mjs --report  # report only
//
// The problem it solves: a swipe session is short and the tag space is wide. Someone who
// liked three rattan things has told you nothing directly about jute, or about wool, or
// about the beige linen sofa two cards ahead — yet those are obviously related, and a
// recommender that can't see it will keep asking about rattan and nothing else.
//
// So: measure which tags actually co-occur in the catalog, more than chance would
// explain, and let a preference for one lend partial credit to its neighbours.
//
// The measure is lift — observed co-occurrence over what independence predicts:
//
//     lift(a, b) = P(a and b) / (P(a) * P(b))
//
// 1.0 means the two tags are unrelated. Above 1 they attract, below 1 they repel; both
// directions are useful, because "you liked white, so you probably don't want the black
// one" is as good a recommendation as its opposite.
//
// Two guards on what gets written. Support: a pair seen fewer than MIN_SUPPORT times has
// a lift that is mostly noise — two products sharing a quirk is a coincidence, not a
// pattern. And self-implication: a tag never counts as its own neighbour.

import { writeFile, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const REPORT_ONLY = args.includes('report') || args.includes('--report')

const IN = resolve(ROOT, flag('in', 'src/data/products.json'))
const OUT = resolve(ROOT, flag('out', 'src/data/affinity.json'))

/** Pairs rarer than this are coincidence, not structure. */
const MIN_SUPPORT = Number(flag('min-support', 20))
/** A tag on fewer than this many products can't support a stable rate either. */
const MIN_TAG = Number(flag('min-tag', 25))
/** How far from 1.0 a lift must be before it is worth storing. */
const MIN_LIFT = 1.6
const MAX_LIFT_INVERSE = 0.6
/** Neighbours kept per tag. Beyond a handful the tail is all near-1.0 noise. */
const TOP_N = Number(flag('top', 8))

// Tags are namespaced so the recommender can tell a colour from an adjective that
// happens to share its name (`blue` is both).
export const NS = { colours: 'c', materials: 'm', attributes: 'a', categories: 'k' }

const tagsOf = (p) => [
  ...p.colours.map((t) => `c:${t}`),
  ...p.materials.map((t) => `m:${t}`),
  ...(p.attributes ?? []).map((t) => `a:${t}`),
  ...p.categories.map((t) => `k:${t}`),
]

/** IKEA's product name is its series: every POÄNG is one design family. */
const seriesOf = (p) => (p.name ?? '').split('/')[0].trim()

async function main() {
  const file = JSON.parse(await readFile(IN, 'utf8'))

  // One row per distinct item. The same sofa sold in Austria and Hungary is one design,
  // and counting it twice would inflate every co-occurrence it takes part in.
  const seenItems = new Set()
  const rows = []
  const seriesIndex = new Map()
  for (const p of file.products) {
    if (seenItems.has(p.itemNoGlobal)) continue
    seenItems.add(p.itemNoGlobal)
    rows.push(tagsOf(p))
    const series = seriesOf(p)
    if (series) {
      if (!seriesIndex.has(series)) seriesIndex.set(series, new Set())
      for (const c of p.categories) seriesIndex.get(series).add(c)
    }
  }
  const N = rows.length
  if (N === 0) throw new Error('no products — run npm run harvest-products first')

  const count = new Map()
  for (const row of rows) for (const t of new Set(row)) count.set(t, (count.get(t) ?? 0) + 1)

  const pairs = new Map()
  for (const row of rows) {
    const ts = [...new Set(row)].filter((t) => (count.get(t) ?? 0) >= MIN_TAG).sort()
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const key = `${ts[i]}|${ts[j]}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
  }

  const edges = []
  for (const [key, n] of pairs) {
    if (n < MIN_SUPPORT) continue
    const [a, b] = key.split('|')
    const expected = (count.get(a) * count.get(b)) / N
    const lift = n / expected
    if (lift < MIN_LIFT && lift > MAX_LIFT_INVERSE) continue
    edges.push({ a, b, n, lift })
  }

  // Adjacency, both directions, strongest first.
  const neighbours = new Map()
  const push = (from, to, lift) => {
    if (!neighbours.has(from)) neighbours.set(from, [])
    neighbours.get(from).push({ tag: to, lift: Math.round(lift * 100) / 100 })
  }
  for (const e of edges) {
    push(e.a, e.b, e.lift)
    push(e.b, e.a, e.lift)
  }
  for (const [, list] of neighbours) {
    // Sort by distance from 1 so a strong repulsion isn't crowded out by a weak
    // attraction — knowing what someone won't want is worth as much as the reverse.
    list.sort((x, y) => Math.abs(Math.log(y.lift)) - Math.abs(Math.log(x.lift)))
    list.splice(TOP_N)
  }

  // --- Report
  const log = (s) => process.stdout.write(`${s}\n`)
  log(`${N} distinct items, ${count.size} tags, ${edges.length} edges above the cut\n`)

  const byLift = [...edges].sort((x, y) => y.lift - x.lift)
  log('GOES TOGETHER')
  for (const e of byLift.slice(0, 14))
    log(`  ${e.lift.toFixed(1).padStart(5)}x  ${e.a.padEnd(22)} + ${e.b.padEnd(22)} ${e.n}`)

  const repel = byLift.filter((e) => e.lift < 1).reverse()
  log(`\nRARELY TOGETHER (${repel.length})`)
  for (const e of repel.slice(0, 8))
    log(`  ${e.lift.toFixed(2).padStart(5)}x  ${e.a.padEnd(22)} + ${e.b.padEnd(22)} ${e.n}`)

  const spanning = [...seriesIndex].filter(([, cats]) => cats.size > 1)
  log(
    `\nSERIES  ${seriesIndex.size} distinct, ${spanning.length} spanning more than one category`,
  )
  for (const [name, cats] of spanning.sort((a, b) => b[1].size - a[1].size).slice(0, 8))
    log(`  ${name.padEnd(16)} ${[...cats].join(', ')}`)

  const orphans = [...count]
    .filter(([t, n]) => n >= MIN_TAG && !neighbours.has(t))
    .map(([t]) => t)
  if (orphans.length)
    log(`\nno neighbours (scored on their own): ${orphans.join(', ')}`)

  if (REPORT_ONLY) return

  await writeFile(
    OUT,
    `${JSON.stringify(
      {
        generatedBy: 'scripts/analyse-products.mjs',
        items: N,
        minSupport: MIN_SUPPORT,
        neighbours: Object.fromEntries([...neighbours].sort()),
        /** series -> the categories it covers, for cross-category recommendations. */
        series: Object.fromEntries(
          spanning.sort().map(([name, cats]) => [name, [...cats].sort()]),
        ),
      },
      null,
      1,
    )}\n`,
  )
  log(`\nwrote ${OUT.replace(`${ROOT}/`, '')}`)
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`)
  process.exit(1)
})

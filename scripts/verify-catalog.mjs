#!/usr/bin/env node
// Drops catalog entries whose image URL no longer resolves, so the quiz never shows a
// broken card. Rewrites the catalog in place and prints what was removed.
//
//   node scripts/verify-catalog.mjs [--out src/data/catalog.json]

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STYLES } from './taxonomy.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const i = args.indexOf('--out')
const OUT = resolve(ROOT, i === -1 ? 'src/data/catalog.json' : args[i + 1])

// Pexels' CDN throttles hard. At 12 concurrent requests it answers 429 in bulk, and an
// earlier version of this script read that as "dead" and deleted 1478 perfectly good
// photos in one run. Go slow, and never delete on an answer that isn't a clear 404.
const CONCURRENCY = 4
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 'alive' | 'dead' | 'unknown'. Only a definitive not-found answer counts as dead —
 * throttling, server errors and network failures are 'unknown' and the photo is kept.
 * A false negative costs one broken card; a false positive costs a photo forever.
 */
async function alive(url, attempt = 0) {
  let res
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'HomeStyleChooser/0.1', Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    return 'unknown' // timeout or network error: no evidence either way
  }

  if (res.status === 429 || res.status >= 500) {
    if (attempt < 3) {
      await sleep(2000 * 2 ** attempt)
      return alive(url, attempt + 1)
    }
    return 'unknown'
  }
  if (res.status === 404 || res.status === 410) return 'dead'
  if (!res.ok && res.status !== 206) return 'unknown'

  const type = res.headers.get('content-type') ?? ''
  // A 200 that isn't an image is a placeholder or an error page: genuinely unusable.
  return type.startsWith('image/') ? 'alive' : 'dead'
}

async function main() {
  const catalog = JSON.parse(await readFile(OUT, 'utf8'))
  const images = catalog.images
  const dead = new Set()
  let checked = 0
  let unknown = 0

  const queue = [...images]
  const worker = async () => {
    for (;;) {
      const item = queue.shift()
      if (!item) return
      const verdict = await alive(item.url)
      checked++
      if (verdict === 'dead') {
        dead.add(item.url)
        process.stderr.write(`  dead: ${item.url}\n`)
      } else if (verdict === 'unknown') {
        unknown++
      }
      if (checked % 25 === 0) process.stderr.write(`  ${checked}/${images.length}\n`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // A run that couldn't get a straight answer for much of the catalog is a throttled run,
  // not a catalog full of dead links. Bail rather than delete on bad evidence.
  if (unknown > images.length * 0.1) {
    process.stderr.write(
      `\n${unknown}/${images.length} URLs gave no clear answer (throttled?) — ` +
        `refusing to delete anything. Re-run later.\n`,
    )
    return
  }

  catalog.images = images.filter((im) => !dead.has(im.url))
  // Dropping images invalidates the resume markers for the queries that found them.
  if (dead.size) delete catalog.completedQueries

  await writeFile(OUT, JSON.stringify(catalog, null, 2))

  const perStyle = Object.fromEntries(
    STYLES.map((s) => [s.id, catalog.images.filter((im) => im.styles.includes(s.id)).length]),
  )
  process.stderr.write(
    `\nkept ${catalog.images.length}/${images.length}` +
      (unknown ? ` (${unknown} inconclusive, kept)` : '') +
      '\n',
  )
  process.stderr.write(`per style: ${JSON.stringify(perStyle, null, 2)}\n`)

  const thin = Object.entries(perStyle).filter(([, n]) => n < 8)
  if (thin.length) {
    process.stderr.write(`\nWARNING thin styles (<8 images): ${thin.map(([k, n]) => `${k}=${n}`).join(', ')}\n`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

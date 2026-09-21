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

const CONCURRENCY = 12

async function alive(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'HomeStyleChooser/0.1', Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok && res.status !== 206) return false
    const type = res.headers.get('content-type') ?? ''
    return type.startsWith('image/')
  } catch {
    return false
  }
}

async function main() {
  const catalog = JSON.parse(await readFile(OUT, 'utf8'))
  const images = catalog.images
  const good = []
  let checked = 0

  const queue = [...images]
  const worker = async () => {
    for (;;) {
      const item = queue.shift()
      if (!item) return
      const ok = await alive(item.url)
      checked++
      if (ok) good.push(item)
      else process.stderr.write(`  dead: ${item.url}\n`)
      if (checked % 25 === 0) process.stderr.write(`  ${checked}/${images.length}\n`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // Preserve original ordering — the workers finish out of order.
  const keep = new Set(good.map((g) => g.url))
  catalog.images = images.filter((im) => keep.has(im.url))
  // Dropping images invalidates the resume markers for the queries that found them.
  delete catalog.completedQueries

  await writeFile(OUT, JSON.stringify(catalog, null, 2))

  const perStyle = Object.fromEntries(
    STYLES.map((s) => [s.id, catalog.images.filter((im) => im.styles.includes(s.id)).length]),
  )
  process.stderr.write(`\nkept ${catalog.images.length}/${images.length}\n`)
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

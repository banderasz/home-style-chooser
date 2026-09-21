#!/usr/bin/env node
// Prototype: can we tell "a full room is visible" from the pixels?
//
//   node scripts/roominess.mjs [--limit 400]
//
// A wide room shot and a close-up of a faucet differ in measurable ways:
//
//   edgeDensity   rooms are busy everywhere — furniture, frames, skirting, windows.
//                 A close-up is mostly one smooth surface.
//   flatFraction  how much of the frame has almost no detail. High = close-up or a
//                 blown-out wall.
//   centreBias    edge energy in the middle vs the border. A close-up puts its subject
//                 centre-frame with blurred surroundings; a room fills the frame.
//   longLines     rooms are architecture: long straight runs where wall meets floor,
//                 ceiling, door frames, worktops. Objects rarely have them.
//
// Validation: captions give weak labels ("close-up of…" vs "spacious living room with…").
// If the metrics can't separate those two groups, the idea is dead and we should say so
// rather than ship a filter that silently drops good photos.

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flagOf = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const LIMIT = Number(flagOf('limit', 400))
const CONCURRENCY = 12

const W = 96 // analysis resolution; enough for structure, cheap to compute

/** Decode, convert to grayscale, and downscale by box-sampling to W x H. */
function grayscale(buffer) {
  const { data, width, height } = jpeg.decode(buffer, { useTArray: true })
  const H = Math.max(1, Math.round((W * height) / width))
  const out = new Float64Array(W * H)
  const sx = width / W
  const sy = height / H
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0
      let n = 0
      for (let j = Math.floor(y * sy); j < Math.min(height, (y + 1) * sy); j++) {
        for (let i = Math.floor(x * sx); i < Math.min(width, (x + 1) * sx); i++) {
          const p = (j * width + i) * 4
          sum += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
          n++
        }
      }
      out[y * W + x] = n ? sum / n : 0
    }
  }
  return { gray: out, w: W, h: H }
}

function metrics({ gray, w, h }) {
  const gx = new Float64Array(w * h)
  const gy = new Float64Array(w * h)
  const mag = new Float64Array(w * h)

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      // Sobel
      const a = gray[i - w - 1]
      const b = gray[i - w]
      const c = gray[i - w + 1]
      const d = gray[i - 1]
      const f = gray[i + 1]
      const g = gray[i + w - 1]
      const hh = gray[i + w]
      const k = gray[i + w + 1]
      gx[i] = a + 2 * d + g - (c + 2 * f + k)
      gy[i] = a + 2 * b + c - (g + 2 * hh + k)
      mag[i] = Math.hypot(gx[i], gy[i])
    }
  }

  let total = 0
  let flat = 0
  let n = 0
  let centre = 0
  let centreN = 0
  let border = 0
  let borderN = 0
  const cx0 = w * 0.25
  const cx1 = w * 0.75
  const cy0 = h * 0.25
  const cy1 = h * 0.75

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const m = mag[y * w + x]
      total += m
      if (m < 24) flat++
      n++
      if (x > cx0 && x < cx1 && y > cy0 && y < cy1) {
        centre += m
        centreN++
      } else {
        border += m
        borderN++
      }
    }
  }

  // Long straight runs: consecutive pixels whose gradient is strong and consistently
  // oriented. Walls, worktops and ceilings produce them; a cushion does not.
  const isEdge = (i) => mag[i] > 40
  const horizontal = (i) => Math.abs(gy[i]) > Math.abs(gx[i]) * 1.8
  const vertical = (i) => Math.abs(gx[i]) > Math.abs(gy[i]) * 1.8

  let longLines = 0
  const MIN_RUN = Math.round(w * 0.22)
  for (let y = 1; y < h - 1; y++) {
    let run = 0
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (isEdge(i) && horizontal(i)) run++
      else {
        if (run >= MIN_RUN) longLines++
        run = 0
      }
    }
    if (run >= MIN_RUN) longLines++
  }
  for (let x = 1; x < w - 1; x++) {
    let run = 0
    for (let y = 1; y < h - 1; y++) {
      const i = y * w + x
      if (isEdge(i) && vertical(i)) run++
      else {
        if (run >= MIN_RUN) longLines++
        run = 0
      }
    }
    if (run >= MIN_RUN) longLines++
  }

  const centreAvg = centreN ? centre / centreN : 0
  const borderAvg = borderN ? border / borderN : 1
  return {
    edgeDensity: Math.round((total / n) * 100) / 100,
    flatFraction: Math.round((flat / n) * 1000) / 1000,
    centreBias: Math.round((centreAvg / Math.max(1, borderAvg)) * 100) / 100,
    longLines,
  }
}

async function measure(image) {
  try {
    const res = await fetch(image.thumbnail, {
      headers: { 'User-Agent': 'HomeStyleChooser/0.1' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('jpeg') && !type.includes('jpg')) return null
    return metrics(grayscale(Buffer.from(await res.arrayBuffer())))
  } catch {
    return null
  }
}

// Weak labels from the captions, used only to check whether the metrics separate.
const CLOSEUP =
  /\b(close[- ]?up|detail of|macro|a mug|coffee cup|vase|bouquet|texture of|still life|faucet|towel|pillow arrangement|book|candle|plant in a pot)\b/i
const FULLROOM =
  /\b(spacious|open plan|open-plan|interior of|view of the|living room with|bedroom with|kitchen with|featuring a sofa|furnished|room featuring)\b/i

const catalog = JSON.parse(await readFile(resolve(ROOT, 'src/data/catalog.json'), 'utf8'))
const labelled = catalog.images
  .map((i) => ({
    image: i,
    label: CLOSEUP.test(i.title) ? 'closeup' : FULLROOM.test(i.title) ? 'fullroom' : null,
  }))
  .filter((x) => x.label)
  .slice(0, LIMIT)

console.log(
  `measuring ${labelled.length} weakly-labelled photos ` +
    `(${labelled.filter((l) => l.label === 'fullroom').length} full-room, ` +
    `${labelled.filter((l) => l.label === 'closeup').length} close-up)\n`,
)

const results = []
const queue = [...labelled]
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const item = queue.shift()
      if (!item) return
      const m = await measure(item.image)
      if (m) results.push({ ...item, ...m })
    }
  }),
)

const mean = (rows, key) => rows.reduce((a, r) => a + r[key], 0) / (rows.length || 1)
const full = results.filter((r) => r.label === 'fullroom')
const close = results.filter((r) => r.label === 'closeup')

console.log(`${'metric'.padEnd(14)} ${'full-room'.padStart(10)} ${'close-up'.padStart(10)}  separation`)
for (const key of ['edgeDensity', 'flatFraction', 'centreBias', 'longLines']) {
  const a = mean(full, key)
  const b = mean(close, key)
  // Standardised mean difference: how many pooled SDs apart the two groups are.
  const sd = (rows) => {
    const m = mean(rows, key)
    return Math.sqrt(rows.reduce((s, r) => s + (r[key] - m) ** 2, 0) / (rows.length || 1))
  }
  const pooled = Math.sqrt((sd(full) ** 2 + sd(close) ** 2) / 2) || 1
  const d = (a - b) / pooled
  console.log(
    `${key.padEnd(14)} ${a.toFixed(2).padStart(10)} ${b.toFixed(2).padStart(10)}  d=${d.toFixed(2)}`,
  )
}

// centreBias and longLines showed no separation (d=0.23 and d=0.04), so the score uses
// only the two that did. Room photos are busy and have little flat area.
const score = (r) => r.edgeDensity / 100 - r.flatFraction
for (const r of results) r.score = score(r)

// Plain accuracy is meaningless here — the classes are ~14:1, so "always say full-room"
// already scores 93%. What matters operationally: at a threshold that keeps almost all
// genuine room photos, how many close-ups does it remove?
console.log('\noperating points (threshold chosen to keep N% of full-room photos):')
console.log(`${'keep full'.padEnd(12)} ${'drop close-up'.padStart(14)} ${'threshold'.padStart(11)}`)
const fullScores = full.map((r) => r.score).sort((a, b) => a - b)
for (const keep of [0.99, 0.97, 0.95, 0.9, 0.8]) {
  const cut = fullScores[Math.floor((1 - keep) * fullScores.length)]
  const dropped = close.filter((r) => r.score < cut).length
  console.log(
    `${(keep * 100).toFixed(0).padEnd(12)}% ${((dropped / close.length) * 100).toFixed(0).padStart(13)}% ${cut.toFixed(3).padStart(11)}`,
  )
}

const auc = (() => {
  // Probability a random full-room photo scores above a random close-up.
  let wins = 0
  for (const f of full) for (const c of close) wins += f.score > c.score ? 1 : f.score === c.score ? 0.5 : 0
  return wins / (full.length * close.length)
})()
console.log(`\nAUC: ${auc.toFixed(3)}  (0.5 = useless, 1.0 = perfect)`)

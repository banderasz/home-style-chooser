#!/usr/bin/env node
// Removes photos that are bad *as quiz cards*, for two different reasons:
//
//   1. Greyscale / heavily desaturated shots. A black-and-white photo of a room says
//      nothing about its palette, so every colour adjective it carries is noise. This is
//      measured from the pixels, not the caption — most filtered photos aren't labelled.
//   2. Captions that describe something other than a room: people, close-up product
//      shots, building exteriors, commercial interiors.
//   3. Captions that never mention a room at all — Flickr noise like "Gauze" or
//      "N1_02146", and product/texture shots from the adjective queries.
//   4. Close-ups the caption doesn't admit to, caught from the pixels by the roominess
//      score in scripts/roominess.mjs. Most bad photos are mislabelled rather than
//      labelled "close-up of", so the caption rules above can't see them.
//   5. Photos flagged with the app's Ignore button enough times to hit the threshold in
//      src/data/ignored.json. Those already drop out of the deck at runtime; this makes
//      the removal permanent and shrinks the bundle.
//
//   node scripts/prune-catalog.mjs                 # dry run: report only
//   node scripts/prune-catalog.mjs --apply         # actually remove them
//   node scripts/prune-catalog.mjs --report        # saturation + roominess histograms
//   node scripts/prune-catalog.mjs --limit 150     # sample, for a quick look
//   node scripts/prune-catalog.mjs --min-roominess 0.164   # stricter close-up cut
//   node scripts/prune-catalog.mjs --keep-closeups         # skip the roominess cut
//
// Both measurements are cached in the catalog as `saturation` and `roominess`, so
// re-runs are instant.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import { roominessOf, roominessScore, ROOMINESS_CUT } from './roominess.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const OUT = resolve(ROOT, flag('out', 'src/data/catalog.json'))
const APPLY = args.includes('--apply')
const REPORT = args.includes('--report')
const LIMIT = Number(flag('limit', 0))
const CONCURRENCY = 12
// Where to cut the roominess score. The default operating point and the table it was
// read from live in scripts/roominess.mjs; re-run that script to re-derive them.
const MIN_ROOMINESS = Number(flag('min-roominess', ROOMINESS_CUT))
const KEEP_CLOSEUPS = args.includes('--keep-closeups')

// Tuned against the histogram --report prints; see README.
// A black-and-white *filter* drives saturation to essentially zero. An all-white or
// greige room only reaches ~0.03-0.12, so anything above this cut is a real colour photo
// of a neutral room and must be kept — the histogram from --report shows the two groups.
const GREY_MEAN = 0.03
const GREY_COLOURFUL = 0.08 // ...and almost no pixel is meaningfully coloured

const CAPTION_REJECTS = [
  // A room with a person in it is a photo of the person.
  // 'lady' (lady palm, Lady Justice), 'model' (model home), 'hands' (hand-crafted) and
  // 'family' (family room) all produced false positives on real interiors — left out.
  ['people', /\b(woman|women|man|men|people|person|girl|boy|child|children|couple|portrait|selfie)\b/i],
  // Close-ups and product shots: no room visible to judge.
  ['closeup', /\b(close[- ]?up|detail of|macro|a mug|coffee cup|cup of|bouquet|vase of|still life|texture of)\b/i],
  // Outside the house.
  ['exterior', /\b(facade|exterior|street|backyard|swimming pool|driveway|rooftop|building from)\b/i],
  // Commercial spaces aren't home design.
  ['commercial', /\b(hotel|motel|restaurant|cafe|café|bar|shop|store|museum|church|showroom|office building|hospital|classroom|airbnb listing)\b/i],
]

/**
 * A caption that never names a room or a home is almost never a usable card: it is
 * either Flickr noise ("Gauze", "N1_02146") or a product/texture shot the adjective
 * queries dragged in ("Vintage wallpaper with vertical stripes").
 */
const ROOM_WORD =
  /\b(interior|room|kitchen|bathroom|bedroom|living|dining|office|study|home|house|apartment|flat|loft|villa|cabin|cottage|indoor|decor|furnish|lounge|hallway|nursery|closet|pantry)\w*\b/i

function captionReject(title) {
  for (const [reason, re] of CAPTION_REJECTS) if (re.test(title)) return reason
  if (!ROOM_WORD.test(title)) return 'not a room'
  return null
}

/** Mean HSV saturation and the fraction of meaningfully coloured pixels. */
function saturationOf({ data, width, height }) {
  // Sample a grid rather than every pixel — a thumbnail is already plenty of signal.
  const step = Math.max(1, Math.floor((width * height) / 4000))
  let total = 0
  let colourful = 0
  let n = 0
  for (let p = 0; p < width * height; p += step) {
    const i = p * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    // Near-black pixels have unstable saturation; skip them.
    if (max < 25) continue
    const s = (max - min) / max
    total += s
    if (s > 0.2) colourful++
    n++
  }
  if (n === 0) return null
  return { mean: total / n, colourful: colourful / n }
}

async function measure(image) {
  if (typeof image.saturation === 'number' && typeof image.roominess === 'number') return image
  try {
    const res = await fetch(image.thumbnail, {
      headers: { 'User-Agent': 'HomeStyleChooser/0.1' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return image
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('jpeg') && !type.includes('jpg')) return image // only JPEG is decodable here
    // One decode feeds both measurements — colour for the greyscale cut, structure for
    // the close-up cut.
    const decoded = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true })
    const stats = saturationOf(decoded)
    if (stats) {
      image.saturation = Math.round(stats.mean * 1000) / 1000
      image.colourful = Math.round(stats.colourful * 1000) / 1000
    }
    image.roominess = Math.round(roominessScore(roominessOf(decoded)) * 1000) / 1000
  } catch {
    // Unreachable or undecodable: leave it unmeasured rather than guessing.
  }
  return image
}

const IGNORED = resolve(ROOT, 'src/data/ignored.json')
// Rejected URLs are remembered so a later harvest doesn't fetch them all over again.
// Not imported by the app, so it never reaches the bundle.
const REJECTED = resolve(ROOT, 'src/data/rejected.json')
let retiredByVote = new Set()
let ignoredFile = null
try {
  ignoredFile = JSON.parse(await readFile(IGNORED, 'utf8'))
  const threshold = ignoredFile.threshold ?? 3
  retiredByVote = new Set(
    Object.entries(ignoredFile.votes ?? {})
      .filter(([, n]) => n >= threshold)
      .map(([id]) => id),
  )
} catch {
  // No ignore file yet — nothing voted out.
}

const catalog = JSON.parse(await readFile(OUT, 'utf8'))
const images = LIMIT ? catalog.images.slice(0, LIMIT) : catalog.images

let done = 0
const queue = [...images]
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const img = queue.shift()
      if (!img) return
      await measure(img)
      if (++done % 100 === 0) process.stderr.write(`  measured ${done}/${images.length}\n`)
    }
  }),
)

const measured = images.filter((i) => typeof i.saturation === 'number')
const scored = images.filter((i) => typeof i.roominess === 'number')

if (REPORT) {
  const buckets = new Map()
  for (const i of measured) {
    const b = (Math.floor(i.saturation * 20) / 20).toFixed(2)
    buckets.set(b, (buckets.get(b) ?? 0) + 1)
  }
  console.log(`saturation histogram (${measured.length} measured):`)
  for (const [b, c] of [...buckets].sort()) {
    console.log(`  ${b}  ${'#'.repeat(Math.ceil(c / 4))} ${c}`)
  }
  console.log('\nlowest-saturation photos:')
  for (const i of [...measured].sort((a, b) => a.saturation - b.saturation).slice(0, 12)) {
    console.log(`  sat=${i.saturation} col=${i.colourful}  ${i.title.slice(0, 62)}`)
  }

  const rBuckets = new Map()
  for (const i of scored) {
    const b = (Math.floor(i.roominess * 10) / 10).toFixed(1)
    rBuckets.set(b, (rBuckets.get(b) ?? 0) + 1)
  }
  console.log(`\nroominess histogram (${scored.length} scored, cut at ${MIN_ROOMINESS}):`)
  for (const [b, c] of [...rBuckets].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${b.padStart(5)}  ${'#'.repeat(Math.ceil(c / 4))} ${c}`)
  }
  console.log('\nleast roomy photos:')
  for (const i of [...scored].sort((a, b) => a.roominess - b.roominess).slice(0, 12)) {
    console.log(`  room=${String(i.roominess).padStart(6)}  ${i.title.slice(0, 62)}`)
  }
}

const grey = measured.filter((i) => i.saturation < GREY_MEAN && i.colourful < GREY_COLOURFUL)
const captionBad = new Map()
for (const i of images) {
  const reason = captionReject(i.title)
  if (reason) captionBad.set(i.id, reason)
}

// Unscored photos are kept: a thumbnail that wouldn't decode is no evidence either way.
const closeups = KEEP_CLOSEUPS ? [] : scored.filter((i) => i.roominess < MIN_ROOMINESS)

const greyIds = new Set(grey.map((i) => i.id))
const votedOut = images.filter((i) => retiredByVote.has(i.id))
const dropIds = new Set([
  ...greyIds,
  ...captionBad.keys(),
  ...closeups.map((i) => i.id),
  ...votedOut.map((i) => i.id),
])

console.log(`\n${images.length} photos · ${measured.length} measured · ${scored.length} scored`)
console.log(`  greyscale/filtered: ${grey.length}`)
const byReason = new Map()
for (const r of captionBad.values()) byReason.set(r, (byReason.get(r) ?? 0) + 1)
for (const [r, c] of byReason) console.log(`  caption "${r}": ${c}`)
console.log(
  KEEP_CLOSEUPS
    ? '  close-up (roominess): skipped (--keep-closeups)'
    : `  close-up (roominess < ${MIN_ROOMINESS}): ${closeups.length}`,
)
console.log(`  flagged via Ignore button: ${votedOut.length}`)
console.log(`  total to drop: ${dropIds.size} (${((dropIds.size / images.length) * 100).toFixed(1)}%)`)

console.log('\nexamples:')
for (const i of grey.slice(0, 5)) console.log(`  [grey ${i.saturation}] ${i.title.slice(0, 64)}`)
for (const [id, reason] of [...captionBad].slice(0, 8)) {
  const i = images.find((x) => x.id === id)
  console.log(`  [${reason}] ${i.title.slice(0, 64)}`)
}
for (const i of [...closeups].sort((a, b) => a.roominess - b.roominess).slice(0, 8)) {
  console.log(`  [close-up ${i.roominess}] ${i.title.slice(0, 64)}`)
}

if (APPLY) {
  const before = catalog.images.length
  catalog.images = catalog.images.filter((i) => !dropIds.has(i.id))
  // Dropping photos frees their queries to run again and refill the gap.
  delete catalog.completedQueries
  await writeFile(OUT, JSON.stringify(catalog, null, 2))

  // Remember what was dropped. Pruning clears the resume markers so the gaps refill,
  // and without this the next harvest would fetch these same photos straight back.
  let rejected = []
  try {
    rejected = JSON.parse(await readFile(REJECTED, 'utf8')).urls ?? []
  } catch {
    // First prune — no file yet.
  }
  const urls = new Set(rejected)
  for (const i of images) if (dropIds.has(i.id)) urls.add(i.url)
  await writeFile(REJECTED, `${JSON.stringify({ urls: [...urls] }, null, 2)}\n`)
  console.log(`remembered ${urls.size} rejected URLs; harvest will skip them`)

  // The votes have been acted on; clear them so the file doesn't grow forever.
  if (ignoredFile && votedOut.length > 0) {
    for (const i of votedOut) delete ignoredFile.votes[i.id]
    await writeFile(IGNORED, `${JSON.stringify(ignoredFile, null, 2)}\n`)
  }
  console.log(`\nremoved ${before - catalog.images.length}; ${catalog.images.length} remain`)
  console.log('re-run `npm run harvest` to refill, then `npm run tag`')
} else {
  // Even on a dry run, keep the measurements so the next run is instant.
  await writeFile(OUT, JSON.stringify(catalog, null, 2))
  console.log('\ndry run — nothing removed. Re-run with --apply to remove.')
}

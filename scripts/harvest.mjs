#!/usr/bin/env node
// Builds the tagged interior-photo catalog at src/data/catalog.json.
//
//   PEXELS_API_KEY=xxx   node scripts/harvest.mjs --provider pexels
//   UNSPLASH_ACCESS_KEY=xxx node scripts/harvest.mjs --provider unsplash
//   OPENVERSE_TOKEN=xxx  node scripts/harvest.mjs --provider openverse
//
// One search per (style x room) pair; every photo inherits the style and room of the
// query that found it, which is where the quiz's tags come from.
//
// The run is resumable: results are flushed after every query and completed queries are
// skipped on the next run, so a rate-limited or interrupted harvest can just be re-run.

import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STYLES, ROOMS, ROOM_QUERY_SUFFIX } from './taxonomy.mjs'
import { ATTRIBUTES } from './attributes.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)

// Keep more photos per request: the request count is what the quota limits, not the
// photos. 10 per query keeps a full run inside one Pexels window.
const PER_QUERY = Number(flag('per', 10))
// Phrasings used per adjective. 1 keeps the whole run (23x6 styles + 45 adjectives =
// 183 queries) under the Pexels free tier's 200/hour; 2 adds variety across two windows.
const ATTR_QUERIES = Number(flag('attr-queries', 1))
// Minimum width/height. 1.4 keeps 3:2 and 16:9 room shots, drops square detail crops.
const MIN_ASPECT = Number(flag('min-aspect', 1.4))
// Restrict the style axis to certain rooms, e.g. --rooms living,kitchen,bedroom to
// deepen the rooms people actually judge a home by.
const ONLY_ROOMS = (flag('rooms', '') || '').split(',').filter(Boolean)
const OUT = resolve(ROOT, flag('out', 'src/data/catalog.json'))
const PROVIDER = flag('provider', process.env.PEXELS_API_KEY ? 'pexels' : 'openverse')
const RESET = has('reset')
// styles     — one query per (style x room)
// attributes — queries per adjective, for the plain-adjective axis
// both       — the default; already-completed queries are skipped either way
const AXIS = flag('axis', 'both')
// Drop everything a given style contributed and re-run its queries — for replacing
// photos harvested from a worse provider without resetting the whole catalog.
const REFRESH = (flag('refresh', '') || '').split(',').filter(Boolean)
// Sleep through a rate-limit window instead of stopping. Pexels' window is an hour.
const WAIT_OUT = has('wait')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Providers report their quota in response headers; the most recent values land here so
// the runner can report how much budget is left and when it comes back.
const quota = { remaining: null, limit: null, resetAt: null }

function readQuota(headers) {
  const remaining = headers.get('x-ratelimit-remaining')
  const limit = headers.get('x-ratelimit-limit')
  const reset = headers.get('x-ratelimit-reset')
  if (remaining !== null) quota.remaining = Number(remaining)
  if (limit !== null) quota.limit = Number(limit)
  // Pexels sends a UTC epoch in seconds; others send seconds-from-now.
  if (reset !== null) {
    const n = Number(reset)
    quota.resetAt = n > 1e9 ? n * 1000 : Date.now() + n * 1000
  }
}

const untilReset = () => (quota.resetAt ? Math.max(0, quota.resetAt - Date.now()) : null)

function describeReset() {
  const ms = untilReset()
  if (ms === null) return 'unknown'
  const mins = Math.ceil(ms / 60000)
  const at = new Date(quota.resetAt).toLocaleTimeString()
  return `${at} (${mins} min)`
}

/** Thrown when the provider's quota is exhausted, so the runner can stop cleanly. */
class QuotaExhausted extends Error {
  constructor() {
    super(`quota exhausted — resets at ${describeReset()}`)
    this.name = 'QuotaExhausted'
  }
}

// ---------------------------------------------------------------------------
// Providers. Each returns a normalised list of candidate photos for one query.
// ---------------------------------------------------------------------------

async function getJson(url, headers, attempt = 0) {
  let res
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
  } catch (err) {
    if (attempt < 2) {
      await sleep(2000 * (attempt + 1))
      return getJson(url, headers, attempt + 1)
    }
    throw err
  }
  readQuota(res.headers)

  if (res.status === 429) {
    // Not every 429 is the hourly quota. Pexels also short-throttles bursts and says so
    // with Retry-After (seconds) and no reset header — that one is worth sleeping off
    // in place, otherwise a whole run stops for a three-second hiccup.
    const retryAfter = Number(res.headers.get('retry-after'))
    if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 120 && attempt < 5) {
      await sleep(retryAfter * 1000 + 500)
      return getJson(url, headers, attempt + 1)
    }

    // Pexels' window is hourly. Short exponential backoff just burns minutes against
    // it, so either wait out the real window (--wait) or stop and resume later.
    const ms = untilReset()
    if (WAIT_OUT && ms !== null && ms < 70 * 60 * 1000) {
      process.stderr.write(`  quota exhausted — sleeping until ${describeReset()}\n`)
      await sleep(ms + 5000)
      return getJson(url, headers, attempt + 1)
    }
    if (ms === null && attempt < 2) {
      // No reset header (Openverse): fall back to a short backoff.
      const wait = 15000 * (attempt + 1)
      process.stderr.write(`  rate limited, waiting ${wait / 1000}s\n`)
      await sleep(wait)
      return getJson(url, headers, attempt + 1)
    }
    throw new QuotaExhausted()
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

const providers = {
  pexels: {
    requiredEnv: 'PEXELS_API_KEY',
    delay: 400,
    async search(query, limit) {
      const url = new URL('https://api.pexels.com/v1/search')
      url.searchParams.set('query', query)
      url.searchParams.set('per_page', String(limit * 3))
      url.searchParams.set('orientation', 'landscape')
      url.searchParams.set('size', 'medium')
      const body = await getJson(url, { Authorization: process.env.PEXELS_API_KEY })
      return (body.photos ?? [])
        // A whole room is a wide frame. Anything near-square is a detail crop.
        .filter((p) => !p.width || !p.height || p.width / p.height >= MIN_ASPECT)
        .map((p) => ({
        id: `pexels-${p.id}`,
        url: p.src.large2x ?? p.src.large,
        thumbnail: p.src.medium ?? p.src.small,
        title: p.alt || query,
        creator: p.photographer ?? 'Unknown',
        creatorUrl: p.photographer_url ?? null,
        source: p.url ?? null,
        license: 'Pexels License',
        licenseUrl: 'https://www.pexels.com/license/',
      }))
    },
  },

  unsplash: {
    requiredEnv: 'UNSPLASH_ACCESS_KEY',
    delay: 1200, // demo keys allow 50 requests/hour
    async search(query, limit) {
      const url = new URL('https://api.unsplash.com/search/photos')
      url.searchParams.set('query', query)
      url.searchParams.set('per_page', String(Math.min(30, limit * 3)))
      url.searchParams.set('orientation', 'landscape')
      url.searchParams.set('content_filter', 'high')
      const body = await getJson(url, {
        Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
        'Accept-Version': 'v1',
      })
      return (body.results ?? []).map((p) => ({
        id: `unsplash-${p.id}`,
        url: `${p.urls.raw}&w=1200&q=80&fm=jpg&fit=crop`,
        thumbnail: `${p.urls.raw}&w=320&q=70&fm=jpg&fit=crop`,
        title: p.alt_description || p.description || query,
        creator: p.user?.name ?? 'Unknown',
        creatorUrl: p.user?.links?.html ?? null,
        source: p.links?.html ?? null,
        license: 'Unsplash License',
        licenseUrl: 'https://unsplash.com/license',
      }))
    },
  },

  // Works without a key only for a handful of requests per hour before Cloudflare
  // starts challenging; set OPENVERSE_TOKEN for a real harvest.
  openverse: {
    requiredEnv: null,
    delay: 900,
    async search(query, limit) {
      const url = new URL('https://api.openverse.org/v1/images/')
      url.searchParams.set('q', query)
      // Anonymous clients are capped at 20 per page; asking for more returns 401.
      const pageSize = process.env.OPENVERSE_TOKEN ? limit * 3 : Math.min(20, limit * 3)
      url.searchParams.set('page_size', String(pageSize))
      url.searchParams.set('mature', 'false')
      url.searchParams.set('aspect_ratio', 'wide')
      url.searchParams.set('size', 'medium,large')
      const headers = { 'User-Agent': 'HomeStyleChooser/0.1 (catalog build script)' }
      if (process.env.OPENVERSE_TOKEN) {
        headers.Authorization = `Bearer ${process.env.OPENVERSE_TOKEN}`
      }
      const body = await getJson(url, headers)
      return (body.results ?? []).map((p) => ({
        id: `openverse-${p.id}`,
        url: p.url,
        thumbnail: p.thumbnail ?? p.url,
        title: p.title ?? query,
        creator: p.creator ?? 'Unknown',
        creatorUrl: p.creator_url ?? null,
        source: p.foreign_landing_url ?? null,
        license: p.license ? `CC ${p.license.toUpperCase()} ${p.license_version ?? ''}`.trim() : 'unknown',
        licenseUrl: p.license_url ?? null,
      }))
    },
  },
}

// ---------------------------------------------------------------------------

// Reject obvious non-photographs that slip into CC search results.
const REJECT =
  /\b(floor ?plan|blueprint|drawing|sketch|wireframe|logo|map|diagram|chart|book cover|advert|poster|stamp|coin)\b/i

const usable = (item) =>
  Boolean(item?.url) && /^https:\/\//.test(item.url) && !REJECT.test(item.title ?? '')

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)

/** Folds a query's tags into a photo already in the catalog, without duplicates. */
function mergeTags(image, tags) {
  for (const field of ['styles', 'rooms']) {
    for (const id of tags[field]) if (!image[field].includes(id)) image[field].push(id)
  }
  image.seedAttributes ??= []
  for (const id of tags.attributes) {
    if (!image.seedAttributes.includes(id)) image.seedAttributes.push(id)
  }
}

/** URLs a previous prune threw out — never fetch them back. */
async function loadRejected() {
  try {
    const parsed = JSON.parse(await readFile(resolve(ROOT, 'src/data/rejected.json'), 'utf8'))
    return new Set(parsed.urls ?? [])
  } catch {
    return new Set()
  }
}

async function loadExisting() {
  if (RESET) return { images: [], completed: [] }
  try {
    const parsed = JSON.parse(await readFile(OUT, 'utf8'))
    return { images: parsed.images ?? [], completed: parsed.completedQueries ?? [] }
  } catch {
    return { images: [], completed: [] }
  }
}

async function main() {
  const provider = providers[PROVIDER]
  if (!provider) {
    throw new Error(`unknown provider "${PROVIDER}" — use pexels, unsplash or openverse`)
  }
  if (provider.requiredEnv && !process.env[provider.requiredEnv]) {
    throw new Error(`${PROVIDER} needs ${provider.requiredEnv} in the environment`)
  }

  const existing = await loadExisting()
  const rejected = await loadRejected()
  if (rejected.size > 0) {
    process.stderr.write(`skipping ${rejected.size} previously rejected photos\n`)
  }
  const byUrl = new Map(existing.images.map((i) => [i.url, i]))
  const completed = new Set(existing.completed)

  if (REFRESH.length > 0) {
    let dropped = 0
    for (const [url, img] of byUrl) {
      if (!img.styles.some((s) => REFRESH.includes(s))) continue
      img.styles = img.styles.filter((s) => !REFRESH.includes(s))
      // A photo that other styles or the adjective axis still vouch for stays.
      if (img.styles.length === 0 && (img.seedAttributes ?? []).length === 0) {
        byUrl.delete(url)
        dropped++
      }
    }
    for (const key of [...completed]) {
      if (REFRESH.includes(key.split('|')[0])) completed.delete(key)
    }
    process.stderr.write(`refresh: dropped ${dropped} photos for ${REFRESH.join(', ')}\n`)
  }

  const jobs = []
  let n = 0
  if (AXIS === 'styles' || AXIS === 'both') {
    const rooms = ONLY_ROOMS.length > 0 ? ROOMS.filter((r) => ONLY_ROOMS.includes(r.id)) : ROOMS
    if (ONLY_ROOMS.length > 0) {
      process.stderr.write(`rooms limited to: ${rooms.map((r) => r.id).join(', ')}\n`)
    }
    for (const style of STYLES) {
      for (const room of rooms) {
        // Rotate phrasings so the catalog isn't all one wording's results.
        const phrase = style.queries[n % style.queries.length]
        jobs.push({
          // The key embeds the query text, so changing the phrasing makes it a new job
          // rather than one the resume logic considers already done.
          key: `${style.id}|${room.id}|${ROOM_QUERY_SUFFIX}`,
          tags: { styles: [style.id], rooms: [room.id], attributes: [] },
          q: `${phrase} ${room.queries[0]} ${ROOM_QUERY_SUFFIX}`,
        })
        n++
      }
    }
  }
  if (AXIS === 'attributes' || AXIS === 'both') {
    for (const attr of ATTRIBUTES) {
      attr.queries.slice(0, ATTR_QUERIES).forEach((phrase, qi) => {
        // Anchor every adjective query to a home interior. Without it the search happily
        // returns wallpaper swatches, turntables and staircases for "vintage" or
        // "patterned" — objects that carry the adjective but aren't rooms.
        const q = /\b(interior|room|kitchen|bathroom|bedroom|apartment)\b/i.test(phrase)
          ? `${phrase} home`
          : `${phrase} home interior`
        // Attribute photos aren't tied to one room; the lexicon pass fills in the rest.
        jobs.push({
          key: `attr:${attr.id}|${qi}`,
          tags: { styles: [], rooms: [], attributes: [attr.id] },
          q,
        })
      })
    }
  }

  const pending = jobs.filter((j) => !completed.has(j.key))
  process.stderr.write(
    `provider=${PROVIDER}  ${pending.length} queries to run (${completed.size} already done)\n`,
  )
  if (PROVIDER === 'pexels' && pending.length > 200) {
    process.stderr.write(
      `  note: the Pexels free tier allows 200 requests/hour, so this needs more than\n` +
        `  one window. Add --wait to sleep through it, or just re-run to resume.\n`,
    )
  }

  const flush = async () => {
    await mkdir(dirname(OUT), { recursive: true })
    await writeFile(
      OUT,
      JSON.stringify(
        {
          generatedBy: 'scripts/harvest.mjs',
          provider: PROVIDER,
          completedQueries: [...completed],
          images: [...byUrl.values()],
        },
        null,
        2,
      ),
    )
  }

  let done = 0
  let stoppedEarly = null
  for (const job of pending) {
    done++
    process.stderr.write(`[${done}/${pending.length}] ${job.q}\n`)

    let results
    try {
      results = await provider.search(job.q, PER_QUERY)
    } catch (err) {
      if (err instanceof QuotaExhausted) {
        stoppedEarly = { done, remaining: pending.length - done + 1 }
        process.stderr.write(`\n  ${err.message}\n`)
        break
      }
      process.stderr.write(`  failed: ${err.message}\n`)
      // Give up on the whole run once the provider starts refusing — the next run
      // resumes from here rather than burning the remaining quota on errors.
      if (/401|403/i.test(err.message)) {
        process.stderr.write('  stopping; re-run later to resume\n')
        break
      }
      continue
    }

    let kept = 0
    for (const item of results) {
      if (kept >= PER_QUERY) break
      if (!usable(item)) continue
      if (rejected.has(item.url)) continue

      const seen = byUrl.get(item.url)
      if (seen) {
        // Same photo found by another query — merge tags rather than duplicate it.
        mergeTags(seen, job.tags)
        continue
      }

      byUrl.set(item.url, {
        ...item,
        title: clean(item.title) || job.q,
        styles: [...job.tags.styles],
        rooms: [...job.tags.rooms],
        // Attributes the *query* asserts. scripts/tag-attributes.mjs unions these with
        // what it reads from the caption, so re-tagging never loses them.
        seedAttributes: [...job.tags.attributes],
      })
      kept++
    }

    completed.add(job.key)
    await flush()
    if (quota.remaining !== null && quota.remaining % 25 === 0 && quota.remaining > 0) {
      process.stderr.write(`  (${quota.remaining} requests left this window)\n`)
    }
    await sleep(provider.delay)
  }

  await flush()

  const images = [...byUrl.values()]
  const perStyle = Object.fromEntries(
    STYLES.map((s) => [s.id, images.filter((i) => i.styles.includes(s.id)).length]),
  )
  process.stderr.write(`\nwrote ${images.length} images to ${OUT}\n`)
  process.stderr.write(`per style: ${JSON.stringify(perStyle)}\n`)

  if (stoppedEarly) {
    process.stderr.write(
      `\nstopped after ${stoppedEarly.done} of ${pending.length} queries; ` +
        `${stoppedEarly.remaining} still to run.\n` +
        `Quota resets at ${describeReset()}. Re-run the same command to resume,\n` +
        `or add --wait to have it sleep through the window automatically.\n`,
    )
  } else if (quota.remaining !== null) {
    process.stderr.write(`\n${quota.remaining} requests left this window\n`)
  }

  const thin = Object.entries(perStyle).filter(([, c]) => c < 8)
  if (thin.length) {
    process.stderr.write(
      `\nthin styles (<8 images): ${thin.map(([k, c]) => `${k}=${c}`).join(', ')}\n` +
        `re-run to resume, or raise --per\n`,
    )
  }
}

main().catch((err) => {
  console.error(String(err.message ?? err))
  process.exit(1)
})

#!/usr/bin/env node
// Builds the buyable-product catalog at src/data/products.json.
//
//   node scripts/harvest-products.mjs              # everything, both markets
//   node scripts/harvest-products.mjs --dry        # counts per query, writes nothing
//   node scripts/harvest-products.mjs --category armchair --market at
//
// No API key: IKEA's own storefront search backend answers unauthenticated.
//
//   GET sik.search.blue.cdtapps.com/{market}/{lang}/search-result-page?q=…&size=…
//
// `size` is not capped at a page — asking for 240 returns all 228 matches in one
// response — so there is no pagination to write.
//
// Three passes, in this order:
//
//   1. Reference pass (gb/en), once per category. Supplies the English descriptive text,
//      which lets the existing caption lexicon in attributes.mjs tag adjectives with no
//      German or Hungarian word list to maintain. Also the English colour name, which is
//      the variant's own ("Kilanda light beige") rather than the range's.
//   2. Market pass (at/de, hu/hu). Price, link, localised name — and the MATERIAL facet,
//      queried per value in that market. Joined to the reference pass on `itemNoGlobal`,
//      which is the same number everywhere.
//   3. Text fallback. Anything the passes above missed is parsed from the product's own
//      design text. Lower recall, but better than an untagged card.
//
// Resumable in the same way as harvest.mjs: results flush after every query and
// completed query keys are recorded, so an interrupted run just gets re-run.

import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  PRODUCT_CATEGORIES,
  MATERIALS,
  COLOURS,
  MARKETS,
  REFERENCE_MARKET,
  IKEA_MATERIAL_BY_ID,
} from './product-taxonomy.mjs'
import { attributeMatchers, tagsFor } from './attributes.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)

const OUT = resolve(ROOT, flag('out', 'src/data/products.json'))
const PER_QUERY = Number(flag('per', 200))
const ONLY_CATEGORIES = (flag('category', '') || '').split(',').filter(Boolean)
const ONLY_MARKETS = (flag('market', '') || '').split(',').filter(Boolean)
const RESET = has('reset')
const DRY = has('dry')
// Skip the per-facet queries and tag colour/material from text alone. Turns a ~10 minute
// run into a ~1 minute one at the cost of recall — useful while iterating on terms.
const NO_FACETS = has('no-facets')
// Politeness delay between requests. This is someone else's storefront.
const DELAY = Number(flag('delay', 400))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SEARCH = 'https://sik.search.blue.cdtapps.com'
const UA = 'Mozilla/5.0 (compatible; home-style-chooser/0.1; catalog build)'

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function search(marketPath, query, { size = PER_QUERY, filters = {} } = {}, attempt = 0) {
  const params = new URLSearchParams({ q: query, size: String(size) })
  for (const [k, v] of Object.entries(filters)) params.set(k, v)
  const url = `${SEARCH}/${marketPath}/search-result-page?${params}`

  let res
  try {
    res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    })
  } catch (err) {
    if (attempt < 2) {
      await sleep(2000 * (attempt + 1))
      return search(marketPath, query, { size, filters }, attempt + 1)
    }
    throw err
  }

  if (res.status === 429 || res.status >= 500) {
    if (attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 5000 * (attempt + 1)
      process.stderr.write(`  ${res.status} — backing off ${Math.round(wait / 1000)}s\n`)
      await sleep(wait)
      return search(marketPath, query, { size, filters }, attempt + 1)
    }
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${query}`)

  const body = await res.json()
  const products = body?.searchResultPage?.products
  return {
    items: (products?.main?.items ?? []).map((i) => i.product).filter(Boolean),
    filters: products?.filters ?? [],
    total: products?.main?.max ?? 0,
  }
}

/** Facet values actually present for this query, so we never probe an empty one. */
const facetValues = (filters, id) =>
  (filters.find((f) => f.id === id)?.values ?? []).filter((v) => v.count > 0)

// ---------------------------------------------------------------------------
// Normalising one IKEA product
// ---------------------------------------------------------------------------

const imageOfType = (product, type) =>
  (product.allProductImage ?? []).find((i) => i.type === type)

/**
 * The card image. A CONTEXT_PRODUCT_IMAGE is the product styled in a real room, which is
 * both a far better style signal than a cutout and visually consistent with the room
 * photos the rest of the app swipes. Not every product has one — cutouts are the
 * fallback, and `imageIsContext` records which you got so the UI can frame it
 * differently.
 */
function pickImage(product) {
  const context =
    imageOfType(product, 'CONTEXT_PRODUCT_IMAGE') ??
    imageOfType(product, 'FUNCTIONAL_PRODUCT_IMAGE')
  const cutout = product.mainImageUrl ?? imageOfType(product, 'MAIN_PRODUCT_IMAGE')?.url ?? null
  return { image: context?.url ?? cutout, imageIsContext: Boolean(context), cutout }
}

/**
 * The English prose that describes *the product*. IKEA's alt text is richly descriptive —
 * "A GLOSTAD sofa, dark grey, modern design, compact shape, with a sturdy metal frame" —
 * which is exactly what the adjective lexicon wants to read.
 *
 * But only on the MAIN image. The context and functional shots describe the whole staged
 * set: "Modern living room with GLOSTAD sofa, botanical prints, black coffee table" and
 * "…glass coffee table, and plants". Reading those tagged a plain grey sofa `glass`,
 * `plants`, `wood` and `artsy` — the room's adjectives, attributed to the product. Same
 * contamination the colour pass hit, and the same fix: read only what is about the thing.
 */
const describe = (product) =>
  [
    product.typeName,
    product.validDesignText,
    imageOfType(product, 'MAIN_PRODUCT_IMAGE')?.altText,
  ]
    .filter(Boolean)
    .join('. ')

const priceOf = (product) => {
  const p = product.salesPrice
  if (!p || typeof p.numeral !== 'number') return null
  return { amount: p.numeral, currency: p.currencyCode ?? null }
}

const ratingOf = (product) =>
  typeof product.ratingValue === 'number'
    ? { value: product.ratingValue, count: product.ratingCount ?? 0 }
    : null

// Plain substring matching does not survive contact with this data. "Gunnared beige"
// contains "red"; "Kelinge" contains "linge". attributes.mjs hit the same wall and solved
// it with letter-boundary lookarounds, which is the right answer here too — except that
// German and Hungarian build colour names by compounding, so a strict left boundary would
// then miss "hellbeige", "dunkelgrau", "elfenbeinweiß" and "graugrün". Hence an optional
// prefix: a modifier, or another colour, may precede the word, but nothing else may.
const LETTER = 'a-zäöüßáéíóöőúüű'
const COMPOUND_PREFIXES = [
  'hell', 'dunkel', 'licht', 'mittel', 'elfenbein',
  'grau', 'blau', 'grün', 'gruen', 'rot', 'gelb', 'braun', 'schwarz', 'weiß', 'weiss',
  'világos', 'sötét',
]

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Longest-first so "dark brown" wins over "brown" where both would match. */
const alternation = (words) =>
  [...words].sort((a, b) => b.length - a.length).map(escape).join('|')

/**
 * Colours use a closed prefix list because their words are short and collide easily.
 * Material words don't have that problem — they are long and specific — but German
 * compounds them without limit ("Birkenfurnier", "Massivholz", "Kiefernholz"), which no
 * fixed prefix list can keep up with. So materials get a right-boundary-only rule, which
 * a compound's final element always satisfies. It is only safe because the words are
 * long: anything under four letters ("fa", Hungarian for wood) keeps both boundaries.
 */
const LOOSE_LEFT_MIN = 4

function compileMatcher(entry, local, mode) {
  const words = [...entry.match, ...(local ? (entry.matchLocal ?? []) : [])]
  if (words.length === 0) return null
  const loose = mode === 'suffix' ? words.filter((w) => w.length >= LOOSE_LEFT_MIN) : []
  const strict = words.filter((w) => !loose.includes(w))

  const parts = []
  if (strict.length)
    parts.push(
      `(?<![${LETTER}])(?:${alternation(COMPOUND_PREFIXES)})?(?:${alternation(strict)})(?![${LETTER}])`,
    )
  if (loose.length) parts.push(`(?:${alternation(loose)})(?![${LETTER}])`)
  return new RegExp(parts.join('|'), 'i')
}

/** table -> compiled matchers, built once per (table, local) pair. */
const matcherCache = new Map()
function matchersFor(table, local) {
  const isColour = table === COLOURS
  const key = `${isColour ? 'c' : 'm'}${local ? 'L' : ''}`
  let compiled = matcherCache.get(key)
  if (!compiled) {
    const mode = isColour ? 'strict' : 'suffix'
    compiled = table.map((entry) => [entry.id, compileMatcher(entry, local, mode)])
    matcherCache.set(key, compiled)
  }
  return compiled
}

/**
 * Colour/material ids matched out of free text. `local` adds the German and Hungarian
 * word lists, for products that never appeared in the English reference pass.
 */
function tagsFromText(text, table, { local = false } = {}) {
  const hay = text ?? ''
  if (!hay) return []
  return matchersFor(table, local)
    .filter(([, re]) => re && re.test(hay))
    .map(([id]) => id)
}

/**
 * Adjectives that can only describe a room, which the lexicon nonetheless finds in
 * product copy — a mirror's alt text mentions a view, a lamp's mentions warm light. They
 * are about the photograph, not the thing, so they never reach a product record. Mirrors
 * `appliesTo: 'room'` in src/data/taxonomy.ts.
 */
const ROOM_ONLY = new Set([
  'bright',
  'daylight',
  'warmlight',
  'view',
  'spacious',
  'concrete',
  'brick',
  'tile',
])

// ---------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------

/**
 * gb/en, once per category. Returns `itemNoGlobal -> {colours, materials, attributes}`
 * plus a drift report on `filterClass`.
 */
async function referencePass(category, matchers, log) {
  const base = await search(REFERENCE_MARKET.path, category.q.en)
  await sleep(DELAY)

  const byItem = new Map()
  for (const p of base.items) {
    if (!p.itemNoGlobal) continue
    byItem.set(p.itemNoGlobal, {
      // The variant's own colour, in English. This is the good one — see COLOURS.
      colours: new Set(tagsFromText(p.validDesignText, COLOURS)),
      attributes: tagsFor(describe(p), matchers),
      filterClass: p.filterClass ?? null,
      text: describe(p),
    })
  }

  // Drift check: if a query stops returning the classes it used to, the term is wrong
  // (a mistranslation, or IKEA renamed something). Report, never silently drop.
  const classes = [...byItem.values()].map((e) => e.filterClass).filter(Boolean)
  const onTarget = classes.filter((c) => category.expect.includes(c)).length
  if (classes.length > 0 && onTarget / classes.length < 0.5) {
    const seen = [...new Set(classes)].slice(0, 4).join(', ')
    log(`  ! "${category.q.en}" drifted: expected ${category.expect.join('/')}, got ${seen}`)
  }

  return { byItem, total: base.total }
}

/**
 * Which products in this market carry which material, read from the market's own
 * MATERIAL facet.
 *
 * This used to run against gb/en and join by item number, on the reasoning that material
 * is a property of the product rather than the market. True in principle, useless in
 * practice: Austria and Hungary stock different fabric variants, so most of the join
 * missed, and the fallback saw design texts like "Knisa dark grey" — a fabric *name*,
 * matching no material word. Sofas came out 32% tagged while the facet itself had
 * Fabric 82, Leather 33, Coated fabric 32, Velvet 20 sitting right there.
 *
 * So it asks each market directly. Costs one query per material value per category per
 * market; the facet ids are market-independent even though their labels are not.
 */
async function materialPass(market, category, filters) {
  const byItem = new Map()
  if (NO_FACETS) return byItem

  for (const value of facetValues(filters, 'MATERIAL')) {
    const ours = IKEA_MATERIAL_BY_ID.get(String(value.id))
    if (!ours) continue // an IKEA facet value we chose not to model
    const hit = await search(market.path, category.q[market.lang], {
      filters: { 'f-materials': String(value.id) },
    })
    for (const p of hit.items) {
      if (!p.itemNoGlobal) continue
      if (!byItem.has(p.itemNoGlobal)) byItem.set(p.itemNoGlobal, new Set())
      byItem.get(p.itemNoGlobal).add(ours)
    }
    await sleep(DELAY)
  }
  return byItem
}

/** One market, one category. Returns catalog-shaped entries. */
async function marketPass(market, category, reference) {
  const { items, total, filters } = await search(market.path, category.q[market.lang])
  await sleep(DELAY)

  const materialsByItem = await materialPass(market, category, filters)

  const out = []
  for (const p of items) {
    const { image, imageIsContext, cutout } = pickImage(p)
    if (!image || !p.pipUrl || !p.itemNoGlobal) continue

    const ref = reference.byItem.get(p.itemNoGlobal)
    // Only the design text is read for colour: the alt text describes the whole staged
    // room, so "two beige chairs, grey rug, black side table" tags a beige chair three
    // colours. English first where the reference pass saw it, else the local wording.
    const colours = ref?.colours.size
      ? [...ref.colours]
      : tagsFromText(p.validDesignText, COLOURS, { local: true })

    // Facet first — it is the retailer asserting the fact. Text is the backstop for
    // products the facet queries didn't reach.
    const facetMaterials = materialsByItem.get(p.itemNoGlobal)
    const materials = facetMaterials?.size
      ? [...facetMaterials]
      : tagsFromText(describe(p), MATERIALS, { local: true })

    // The adjective axis is deliberately English-only. A product missing from the
    // reference pass gets no adjectives rather than adjectives matched against German or
    // Hungarian by a lexicon that doesn't speak either — a wrong tag is worse than none.
    //
    // It is also deliberately *only* what the text said. An earlier version also wrote
    // the adjective each material and colour implies (rattan -> `rattan`, green ->
    // `greenery`) so that every tagged product had adjectives. That turned out to be
    // self-defeating: it made the adjective axis 70% a restatement of the other two, so
    // the catalog's strongest "correlations" were things like ceramic/stone and
    // black/monochrome — one signal counted twice, which a recommender would read as
    // corroboration. Adjectives now add information or they stay empty.
    const attributes = (ref ? ref.attributes : []).filter((a) => !ROOM_ONLY.has(a))

    out.push({
      id: `ikea-${market.id}-${p.itemNoGlobal}`,
      itemNoGlobal: p.itemNoGlobal,
      retailer: 'ikea',
      market: market.id,
      name: p.name ?? '',
      typeLabel: p.typeName ?? '',
      url: p.pipUrl,
      image,
      imageIsContext,
      cutout,
      price: priceOf(p),
      rating: ratingOf(p),
      categories: [category.id],
      materials,
      colours,
      attributes,
    })
  }
  return { out, total }
}

/**
 * Fold a product found by a second query into the one already recorded.
 *
 * Categories genuinely overlap — Hungarian "kisasztal" (side table) returns most of what
 * "dohányzóasztal" (coffee table) does, and a shoe cabinet is also a base cabinet. An
 * earlier version just overwrote by id, so whichever query ran last won and the first
 * category silently lost nearly all its products: HU coffee tables came out at 2 when the
 * query itself returns 96. A product that is two things should be tagged as both, which
 * is also what the scorer expects — it splits category evidence 1/k.
 *
 * Everything else takes the first non-empty value. The passes agree on price and image
 * for a given market, so there is nothing to reconcile there.
 */
function merge(existing, fresh) {
  if (!existing) return fresh
  const union = (a, b) => [...new Set([...(a ?? []), ...(b ?? [])])]
  return {
    ...existing,
    categories: union(existing.categories, fresh.categories),
    materials: union(existing.materials, fresh.materials),
    colours: union(existing.colours, fresh.colours),
    attributes: union(existing.attributes, fresh.attributes),
  }
}

// ---------------------------------------------------------------------------
// Catalog file
// ---------------------------------------------------------------------------

async function loadExisting() {
  if (RESET) return { products: [], completed: new Set() }
  try {
    const raw = JSON.parse(await readFile(OUT, 'utf8'))
    return {
      products: Array.isArray(raw.products) ? raw.products : [],
      completed: new Set(raw.completedQueries ?? []),
    }
  } catch {
    return { products: [], completed: new Set() }
  }
}

async function flush(byId, completed) {
  if (DRY) return
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(
    OUT,
    `${JSON.stringify(
      {
        generatedBy: 'scripts/harvest-products.mjs',
        retailer: 'ikea',
        completedQueries: [...completed].sort(),
        products: [...byId.values()],
      },
      null,
      2,
    )}\n`,
  )
}

// ---------------------------------------------------------------------------

async function main() {
  const log = (s) => process.stdout.write(`${s}\n`)
  const matchers = attributeMatchers()

  const categories = PRODUCT_CATEGORIES.filter(
    (c) => ONLY_CATEGORIES.length === 0 || ONLY_CATEGORIES.includes(c.id),
  )
  const markets = MARKETS.filter((m) => ONLY_MARKETS.length === 0 || ONLY_MARKETS.includes(m.id))
  if (categories.length === 0) throw new Error(`no category matches --category ${ONLY_CATEGORIES}`)
  if (markets.length === 0) throw new Error(`no market matches --market ${ONLY_MARKETS}`)

  const { products, completed } = await loadExisting()
  const byId = new Map(products.map((p) => [p.id, p]))

  log(
    `${categories.length} categories x ${markets.length} markets` +
      `${NO_FACETS ? ' (no facet pass)' : ''}${DRY ? ' — dry run' : ''}`,
  )

  for (const category of categories) {
    const pending = markets.filter((m) => !completed.has(`${category.id}|${m.id}`))
    if (pending.length === 0) {
      log(`${category.id.padEnd(14)} skipped (already harvested)`)
      continue
    }

    const reference = await referencePass(category, matchers, log)
    const tagged = [...reference.byItem.values()].filter((e) => e.colours.size > 0).length

    for (const market of pending) {
      const { out, total } = await marketPass(market, category, reference, matchers)
      for (const entry of out) byId.set(entry.id, merge(byId.get(entry.id), entry))
      completed.add(`${category.id}|${market.id}`)
      log(
        `${category.id.padEnd(14)} ${market.id}  ${String(out.length).padStart(3)} kept` +
          ` / ${String(total).padStart(4)} matched` +
          `   ref ${reference.byItem.size} (${tagged} coloured)`,
      )
      await flush(byId, completed)
    }
  }

  // Coverage report — the numbers worth looking at before trusting the catalog.
  const all = [...byId.values()]
  const share = (n) => `${Math.round((100 * n) / (all.length || 1))}%`
  log(`\n${all.length} products in ${OUT.replace(`${ROOT}/`, '')}`)
  log(`  with a colour     ${share(all.filter((p) => p.colours.length).length)}`)
  log(`  with a material   ${share(all.filter((p) => p.materials.length).length)}`)
  log(`  with an adjective ${share(all.filter((p) => p.attributes.length).length)}`)
  log(`  context image     ${share(all.filter((p) => p.imageIsContext).length)}`)

  const thin = PRODUCT_CATEGORIES.map((c) => [
    c.id,
    all.filter((p) => p.categories.includes(c.id)).length,
  ]).filter(([, n]) => n < 10)
  if (thin.length) log(`  thin categories: ${thin.map(([id, n]) => `${id}(${n})`).join(', ')}`)
}

// Only harvest when run as a script. Exported so the merge rule above — the one that
// silently cost a whole category last time it was wrong — can be asserted in the tests.
export { merge }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`)
    process.exit(1)
  })
}

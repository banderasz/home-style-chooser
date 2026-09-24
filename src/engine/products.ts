// Product mode: swipe buyable furniture, end with a shopping list.
//
// The queue policy is `infinite.ts` instantiated at `Product` — seeded shuffle, one
// verdict per item, editable afterwards. Only the scoring is new, and only because the
// axes are: a product has a category, a material and a colour where a room photo has a
// style and a room.
//
// Everything here goes through `rankTags` from quiz.ts, so a product's scores use the
// same Laplace-smoothed rate and confidence discount as the quiz's. That matters for the
// results screen: "you liked 4 of 5 rattan things" should not outrank "you liked 30 of 34
// wooden ones" in either mode, and it doesn't, because it's the same function.

import type { Product } from '../data/products'
import { PRODUCT_ATTRIBUTE_IDS } from '../data/taxonomy'
import {
  COLOURS,
  MATERIALS,
  PRODUCT_CATEGORIES,
  type Colour,
} from '../data/product-taxonomy'
import { createInfinite, type InfiniteState } from './infinite'
import { rankTags, type TagEvidence, type TagScore } from './quiz'

export type ProductState = InfiniteState<Product>

export type ProductAxis = 'categories' | 'materials' | 'colours' | 'attributes'

/**
 * Same reasoning as the room axes' splits in quiz.ts. Category is effectively single-
 * valued (a thing is a sofa), so the divisor never bites. Materials and colours are
 * genuinely plural — an oak-and-steel desk is both — so they damp like attributes do
 * rather than splitting a vote in half.
 */
const SPLIT: Record<ProductAxis, (k: number) => number> = {
  categories: (k) => 1 / k,
  materials: (k) => 1 / Math.sqrt(k),
  colours: (k) => 1 / Math.sqrt(k),
  attributes: (k) => 1 / Math.sqrt(k),
}

const byId = new WeakMap<Product[], Map<string, Product>>()

function indexOf(pool: Product[]): Map<string, Product> {
  let index = byId.get(pool)
  if (!index) {
    index = new Map(pool.map((p) => [p.id, p]))
    byId.set(pool, index)
  }
  return index
}

function evidenceFor(state: ProductState, axis: ProductAxis): TagEvidence[] {
  const index = indexOf(state.pool)
  const out: TagEvidence[] = []
  for (const answer of state.answers) {
    const product = index.get(answer.imageId)
    if (!product) continue
    // Every answer in this mode is phase 1 — there are no phases — so weight is flat.
    out.push({ tags: product[axis] ?? [], verdict: answer.verdict, weight: 1 })
  }
  return out
}

export function scoreProductTags(
  state: ProductState,
  axis: ProductAxis,
  universe?: string[],
): TagScore[] {
  return rankTags(evidenceFor(state, axis), SPLIT[axis], universe)
}

/** Scored over the full universe, so a category you disliked still shows a low bar. */
export const scoreCategories = (state: ProductState) =>
  scoreProductTags(
    state,
    'categories',
    PRODUCT_CATEGORIES.map((c) => c.id),
  ).filter((t) => t.seen > 0)

export const scoreMaterials = (state: ProductState) =>
  scoreProductTags(
    state,
    'materials',
    MATERIALS.map((m) => m.id),
  ).filter((t) => t.seen > 0)

export const scoreColours = (state: ProductState) =>
  scoreProductTags(
    state,
    'colours',
    COLOURS.map((c) => c.id),
  ).filter((t) => t.seen > 0)

/**
 * Adjectives, restricted to those an object can express. Scoring `spacious` off a swipe
 * on a table lamp would be noise dressed as a finding.
 */
export const scoreProductAttributes = (state: ProductState) =>
  scoreProductTags(state, 'attributes', PRODUCT_ATTRIBUTE_IDS).filter((t) => t.seen > 0)

export interface ToneScore {
  tone: Colour['tone']
  seen: number
  liked: number
  rate: number
}

/**
 * Warm / cool / neutral. Twelve colour bars say less than this one line does — most
 * people have a temperature preference long before they have a favourite colour.
 */
export function scoreTones(state: ProductState): ToneScore[] {
  const index = indexOf(state.pool)
  const tally = new Map<string, { seen: number; liked: number }>()

  for (const answer of state.answers) {
    const product = index.get(answer.imageId)
    if (!product) continue
    const tones = new Set(
      product.colours.map((id) => COLOURS.find((c) => c.id === id)?.tone).filter(Boolean),
    )
    for (const tone of tones) {
      const entry = tally.get(tone as string) ?? { seen: 0, liked: 0 }
      entry.seen += 1
      if (answer.verdict === 'like') entry.liked += 1
      tally.set(tone as string, entry)
    }
  }

  return [...tally.entries()]
    .map(([tone, { seen, liked }]) => ({
      tone: tone as Colour['tone'],
      seen,
      liked,
      rate: (liked + 1) / (seen + 2),
    }))
    .sort((a, b) => b.rate - a.rate)
}

/** Everything liked, in the order judged — the shopping list. */
export function likedProducts(state: ProductState): Product[] {
  const index = indexOf(state.pool)
  return state.answers
    .filter((a) => a.verdict === 'like')
    .map((a) => index.get(a.imageId))
    .filter((p): p is Product => Boolean(p))
}

/**
 * What the liked products would cost together. Only meaningful within one market, so
 * mixed currencies are reported separately rather than silently added up.
 */
export function likedTotal(state: ProductState): { currency: string; amount: number }[] {
  const totals = new Map<string, number>()
  for (const product of likedProducts(state)) {
    if (!product.price?.currency) continue
    totals.set(
      product.price.currency,
      (totals.get(product.price.currency) ?? 0) + product.price.amount,
    )
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }))
}

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

export interface Affinity {
  items: number
  /** Namespaced tag -> tags it co-occurs with unusually often (or unusually rarely). */
  neighbours: Record<string, { tag: string; lift: number }[]>
  series: Record<string, string[]>
}

export interface Recommendation {
  product: Product
  score: number
  /** The tags that earned it the score, strongest first — the "because you liked…" line. */
  reasons: { tag: string; axis: ProductAxis; direct: boolean }[]
}

const NS: Record<ProductAxis, string> = {
  colours: 'c',
  materials: 'm',
  attributes: 'a',
  categories: 'k',
}

/** A rate of 0.5 is "no opinion"; this converts one into a signed preference. */
const preference = (score: TagScore) => (score.rate - 0.5) * score.confidence

/**
 * What we believe about every tag, after a session. Tags the user actually saw get their
 * measured rate. Tags they never saw are *inferred* from the catalog's co-occurrence
 * structure: someone who liked rattan things has said something about jute, because in
 * this catalog those two travel together.
 *
 * Inference is deliberately damped by INFERRED_TRUST. A borrowed opinion should never
 * outrank a measured one, or the recommender starts confidently arguing with the user.
 */
const INFERRED_TRUST = 0.45

function beliefs(state: ProductState, affinity: Affinity | null) {
  const direct = new Map<string, number>()
  for (const axis of ['colours', 'materials', 'attributes', 'categories'] as ProductAxis[]) {
    for (const score of scoreProductTags(state, axis)) {
      if (score.seen > 0) direct.set(`${NS[axis]}:${score.tagId}`, preference(score))
    }
  }

  const inferred = new Map<string, number>()
  if (affinity) {
    for (const [tag, list] of Object.entries(affinity.neighbours)) {
      if (direct.has(tag)) continue
      let weight = 0
      let total = 0
      for (const { tag: other, lift } of list) {
        const known = direct.get(other)
        if (known === undefined) continue
        // A lift below 1 means the two repel, so the neighbour's opinion arrives
        // inverted: disliking black is mild evidence *for* white.
        const sign = lift >= 1 ? 1 : -1
        const w = Math.abs(Math.log(lift))
        total += w * sign * known
        weight += w
      }
      if (weight > 0) inferred.set(tag, (total / weight) * INFERRED_TRUST)
    }
  }

  return { direct, inferred }
}

/**
 * Rank products the session hasn't judged yet.
 *
 * `diversity` is not a nicety. Scoring alone returns the same beige oak thing thirty
 * times, because the tags that won are on all thirty — a list that is simultaneously
 * perfectly targeted and completely useless. Each result therefore discounts the tags
 * already spent by the results above it.
 */
export function recommend(
  state: ProductState,
  affinity: Affinity | null,
  count = 12,
  { diversity = 0.55 }: { diversity?: number } = {},
): Recommendation[] {
  const { direct, inferred } = beliefs(state, affinity)
  if (direct.size === 0) return []

  const judged = new Set([...state.answers.map((a) => a.imageId), ...state.skipped])
  const likedSeries = new Set(
    likedProducts(state).map((p) => p.name.split('/')[0].trim()).filter(Boolean),
  )

  const scored = state.pool
    .filter((p) => !judged.has(p.id))
    .map((product) => {
      const reasons: Recommendation['reasons'] = []
      let total = 0
      let n = 0

      for (const axis of ['colours', 'materials', 'attributes', 'categories'] as ProductAxis[]) {
        for (const id of product[axis] ?? []) {
          const key = `${NS[axis]}:${id}`
          const value = direct.get(key) ?? inferred.get(key)
          if (value === undefined) continue
          total += value
          n++
          if (Math.abs(value) > 0.02)
            reasons.push({ tag: id, axis, direct: direct.has(key) })
        }
      }
      if (n === 0) return null

      // Mean, not sum — otherwise a product with six tags beats a better one with three
      // purely by being more thoroughly described.
      let score = total / n
      // Another thing from a series you already liked is a genuinely strong signal, and
      // the one bit of cross-category transfer the catalog supports outright.
      if (likedSeries.has(product.name.split('/')[0].trim())) score += 0.12

      reasons.sort((a, b) => Number(b.direct) - Number(a.direct))
      return { product, score, reasons: reasons.slice(0, 4) }
    })
    .filter((r): r is Recommendation => r !== null && r.score > 0)
    .sort((a, b) => b.score - a.score)

  // Greedy diverse selection over the top of the ranking. Repeating a category, a colour
  // or a series costs the next candidate that shares it. The increment is large relative
  // to typical score gaps on purpose: near the top of the ranking, dozens of products are
  // separated by hundredths, and a timid penalty just reorders three picture frames.
  const REPEAT_COST = 0.12

  const facets = (r: Recommendation) => [
    `k:${r.product.categories[0]}`,
    `s:${r.product.name.split('/')[0].trim()}`,
    ...r.product.colours.map((c) => `c:${c}`),
  ]

  const out: Recommendation[] = []
  const spent = new Map<string, number>()
  const pool = scored.slice(0, Math.max(count * 20, 200))

  while (out.length < count && pool.length > 0) {
    let bestAt = 0
    let bestValue = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const penalty = facets(pool[i]).reduce((sum, k) => sum + (spent.get(k) ?? 0), 0)
      const value = pool[i].score - diversity * penalty
      if (value > bestValue) {
        bestValue = value
        bestAt = i
      }
    }
    const [picked] = pool.splice(bestAt, 1)
    out.push(picked)
    for (const k of facets(picked)) spent.set(k, (spent.get(k) ?? 0) + REPEAT_COST)
  }
  return out
}

/**
 * Order the deck so products matching a finished quiz's adjective profile come first.
 *
 * The swipe order is still seeded and stable — this only re-sorts within the shuffle, by
 * how many liked adjectives a product carries. Without a quiz result it is a no-op and
 * the deck stays a plain shuffle, which is the right default: with no evidence, any
 * ordering is a guess dressed up as personalisation.
 */
export function createProductDeck(
  pool: Product[],
  seed?: number,
  preferredAttributes: string[] = [],
): ProductState {
  const base = createInfinite(pool, seed)
  if (preferredAttributes.length === 0) return base

  const wanted = new Set(preferredAttributes)
  const index = indexOf(pool)
  const affinity = (id: string) =>
    (index.get(id)?.attributes ?? []).filter((a) => wanted.has(a)).length

  // A stable sort on a shuffled list: products with equal affinity keep their shuffled
  // order, so two runs with the same seed still produce the same deck.
  return { ...base, queue: [...base.queue].sort((a, b) => affinity(b) - affinity(a)) }
}

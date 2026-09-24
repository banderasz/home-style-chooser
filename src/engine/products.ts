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
import { attributeLabel, PRODUCT_ATTRIBUTE_IDS } from '../data/taxonomy'
import {
  COLOURS,
  MATERIALS,
  PRODUCT_CATEGORIES,
  categoryLabel,
  colourLabel,
  materialLabel,
  type Colour,
} from '../data/product-taxonomy'
import { createInfinite, type InfiniteState } from './infinite'
import {
  mulberry32,
  rankTags,
  shuffled,
  type TagEvidence,
  type TagScore,
  type Verdict,
} from './quiz'

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

export interface TagBreakdown {
  tagId: string
  label: string
  seen: number
  liked: number
  /** Liked over seen. Raw, not smoothed — see `summary()`. */
  rate: number
}

export interface Summary {
  judged: number
  liked: number
  skipped: number
  likeRate: number
  categories: TagBreakdown[]
  colours: TagBreakdown[]
  materials: TagBreakdown[]
  attributes: TagBreakdown[]
}

/**
 * A plain tally of what you saw and what you said yes to, per tag.
 *
 * Deliberately *not* the smoothed `rate` the scorers produce. Those exist to rank tags
 * against each other, which needs a prior so that one lucky swipe can't top the table.
 * This is a different job: reporting what actually happened. "4 of 5" should read as 80%,
 * not as the 71% a Laplace prior would report, because here the counts are shown next to
 * it and a number that disagrees with its own arithmetic just looks broken.
 */
export function summary(state: ProductState): Summary {
  const index = indexOf(state.pool)

  const axis = (name: ProductAxis, label: (id: string) => string): TagBreakdown[] => {
    const tally = new Map<string, { seen: number; liked: number }>()
    for (const answer of state.answers) {
      const product = index.get(answer.imageId)
      if (!product) continue
      for (const id of new Set(product[name] ?? [])) {
        const entry = tally.get(id) ?? { seen: 0, liked: 0 }
        entry.seen += 1
        if (answer.verdict === 'like') entry.liked += 1
        tally.set(id, entry)
      }
    }
    return [...tally]
      .map(([tagId, { seen, liked }]) => ({
        tagId,
        label: label(tagId),
        seen,
        liked,
        rate: seen === 0 ? 0 : liked / seen,
      }))
      .sort((a, b) => b.seen - a.seen || b.rate - a.rate)
  }

  const liked = state.answers.filter((a) => a.verdict === 'like').length
  return {
    judged: state.answers.length,
    liked,
    skipped: state.skipped.length,
    likeRate: state.answers.length === 0 ? 0 : liked / state.answers.length,
    categories: axis('categories', categoryLabel),
    colours: axis('colours', colourLabel),
    materials: axis('materials', materialLabel),
    attributes: axis('attributes', attributeLabel),
  }
}

/** Everything judged or skipped, most recent first — the history screen's list. */
export function productHistory(
  state: ProductState,
): { product: Product; verdict: Verdict | 'skipped' }[] {
  const index = indexOf(state.pool)
  const out: { product: Product; verdict: Verdict | 'skipped' }[] = []
  for (let i = state.answers.length - 1; i >= 0; i--) {
    const product = index.get(state.answers[i].imageId)
    if (product) out.push({ product, verdict: state.answers[i].verdict })
  }
  // Skips carry no timestamp, so they sit after the judged ones rather than pretending
  // to a position in the order.
  for (let i = state.skipped.length - 1; i >= 0; i--) {
    const product = index.get(state.skipped[i])
    if (product) out.push({ product, verdict: 'skipped' })
  }
  return out
}

/** Put a skipped product back in the deck, unjudged. */
export function unskip(state: ProductState, productId: string): ProductState {
  if (!state.skipped.includes(productId)) return state
  const skipped = state.skipped.filter((id) => id !== productId)
  const back = state.queue.indexOf(productId)
  return {
    ...state,
    skipped,
    cursor: back === -1 ? state.cursor : Math.min(state.cursor, back),
  }
}

/** Put every skipped product back at once. */
export function unskipAll(state: ProductState): ProductState {
  if (state.skipped.length === 0) return state
  const earliest = state.skipped.reduce((min, id) => {
    const at = state.queue.indexOf(id)
    return at === -1 ? min : Math.min(min, at)
  }, state.cursor)
  return { ...state, skipped: [], cursor: earliest }
}

export interface DeckOptions {
  /**
   * Only serve these categories. An empty list means all of them — "I've deselected
   * everything" and "I haven't chosen" want the same behaviour, which is to show you the
   * catalog rather than an empty deck.
   */
  categories?: string[]
  /** Adjectives a finished quiz found you liked, used to bias the order. */
  preferredAttributes?: string[]
}

/**
 * Build the swipe queue.
 *
 * The category filter narrows the **queue**, never the pool. That distinction matters:
 * verdicts are keyed by product id and the statistics run over the pool, so filtering
 * down to lamps and back out again leaves every earlier verdict intact and still counted.
 * Filtering the pool instead would drop them on the next reload, because `fromSaved`
 * discards answers naming products the pool no longer has.
 *
 * Preferred attributes then re-sort within the shuffle — stably, so the same seed gives
 * the same deck. Without a quiz result it is a no-op, which is the right default: with no
 * evidence, any ordering is a guess dressed up as personalisation.
 */
export function createProductDeck(
  pool: Product[],
  seed?: number,
  { categories = [], preferredAttributes = [] }: DeckOptions = {},
): ProductState {
  const base = createInfinite(pool, seed)
  return applyDeckOptions(base, { categories, preferredAttributes })
}

/**
 * Re-filter and re-order an existing deck, keeping every verdict. Used when the category
 * selection changes mid-session.
 */
export function applyDeckOptions(
  state: ProductState,
  { categories = [], preferredAttributes = [] }: DeckOptions = {},
): ProductState {
  const index = indexOf(state.pool)
  // Rebuild from the seed rather than from the current queue, so repeatedly narrowing and
  // widening the filter can't progressively lose products.
  let queue = shuffled(state.pool, mulberry32(state.seed)).map((p) => p.id)

  if (categories.length > 0) {
    const wanted = new Set(categories)
    queue = queue.filter((id) =>
      (index.get(id)?.categories ?? []).some((c) => wanted.has(c)),
    )
  }

  if (preferredAttributes.length > 0) {
    const liked = new Set(preferredAttributes)
    const affinity = (id: string) =>
      (index.get(id)?.attributes ?? []).filter((a) => liked.has(a)).length
    queue = [...queue].sort((a, b) => affinity(b) - affinity(a))
  }

  const judged = new Set([...state.answers.map((a) => a.imageId), ...state.skipped])
  let cursor = 0
  while (cursor < queue.length && judged.has(queue[cursor])) cursor++

  return { ...state, queue, cursor }
}

/** How many products each category offers, for the picker. */
export function categoryCounts(pool: Product[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of pool) {
    for (const c of p.categories) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return counts
}

/** Products left to judge, within the current category selection. */
export function remainingInDeck(state: ProductState): number {
  const judged = new Set([...state.answers.map((a) => a.imageId), ...state.skipped])
  return state.queue.filter((id) => !judged.has(id)).length
}

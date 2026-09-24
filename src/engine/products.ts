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
import { rankTags, type TagEvidence, type TagScore, type Verdict } from './quiz'

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

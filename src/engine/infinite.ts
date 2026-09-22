// Endless deck: swipe the whole catalog for as long as you like, across as many sittings
// as you like, and edit any verdict afterwards.
//
// The two-round quiz answers "what is this stranger's style?" in three minutes. This
// answers "what do *we* actually like?" given unlimited patience. Same scoring — every
// function in quiz.ts that reads a session reads only `{pool, answers, config}`, which
// `InfiniteState` satisfies — so this module is a queue policy, not a second engine.
//
// The one invariant it enforces: at most one answer per image. That is what makes a
// verdict editable. `answers` stays an ordered list rather than a map so the history
// screen gets "most recently judged first" for free, and so scoring, `likedImages` and
// the results screen all work on it unchanged.

import type { HomeImage } from '../data/images'
import {
  DEFAULT_CONFIG,
  mulberry32,
  shuffled,
  type Answer,
  type QuizConfig,
  type Scored,
  type Verdict,
} from './quiz'

export interface InfiniteState extends Scored {
  config: QuizConfig
  pool: HomeImage[]
  /** One entry per image at most, in the order judged. Always `phase: 1`. */
  answers: Answer[]
  /** Photos dropped as unusable. Never scored, never re-served. */
  skipped: string[]
  /** The whole pool, shuffled once. Judged cards are stepped over, not removed. */
  queue: string[]
  cursor: number
  seed: number
}

/** Everything persisted. Deliberately short keys — this grows to a few thousand entries. */
export interface SavedInfinite {
  seed: number
  skipped: string[]
  answers: { i: string; v: Verdict }[]
}

export function createInfinite(
  pool: HomeImage[],
  seed = Math.floor(Math.random() * 2 ** 31),
): InfiniteState {
  return {
    config: DEFAULT_CONFIG,
    pool,
    answers: [],
    skipped: [],
    queue: shuffled(pool, mulberry32(seed)).map((i) => i.id),
    cursor: 0,
    seed,
  }
}

const judgedIds = (state: InfiniteState): Set<string> =>
  new Set([...state.answers.map((a) => a.imageId), ...state.skipped])

/**
 * First index at or after `from` holding a card that still needs a verdict. Returns
 * `queue.length` when there is nothing left — the deck reads that as "catalog exhausted".
 *
 * Stepping over judged cards rather than splicing them out keeps the queue a stable,
 * seed-derived order: clearing a verdict in the history screen puts that photo back in
 * its original place instead of at the end.
 */
function nextUnjudged(state: InfiniteState, from: number): number {
  const judged = judgedIds(state)
  let i = Math.max(0, from)
  while (i < state.queue.length && judged.has(state.queue[i])) i++
  return i
}

/** Re-points the cursor at the next card needing a verdict. */
function settle(state: InfiniteState): InfiniteState {
  const cursor = nextUnjudged(state, state.cursor)
  return cursor === state.cursor ? state : { ...state, cursor }
}

export function currentImage(state: InfiniteState): HomeImage | null {
  const id = state.queue[state.cursor]
  if (!id) return null
  return state.pool.find((i) => i.id === id) ?? null
}

/** The cards behind the top one, so the stack can pre-render and preload them. */
export function upcoming(state: InfiniteState, count = 2): HomeImage[] {
  const out: HomeImage[] = []
  const judged = judgedIds(state)
  for (let i = state.cursor + 1; i < state.queue.length && out.length < count; i++) {
    const id = state.queue[i]
    if (judged.has(id)) continue
    const img = state.pool.find((im) => im.id === id)
    if (img) out.push(img)
  }
  return out
}

export function judge(state: InfiniteState, verdict: Verdict): InfiniteState {
  const img = currentImage(state)
  if (!img) return state
  return settle({
    ...setVerdict(state, img.id, verdict),
    cursor: state.cursor + 1,
  })
}

/**
 * Set, change or clear the verdict on any image — the history screen's whole job.
 * `null` clears it, which removes the image from scoring entirely and returns it to the
 * queue to be asked again.
 */
export function setVerdict(
  state: InfiniteState,
  imageId: string,
  verdict: Verdict | null,
): InfiniteState {
  const at = state.answers.findIndex((a) => a.imageId === imageId)

  if (verdict === null) {
    if (at === -1) return state
    const answers = [...state.answers]
    answers.splice(at, 1)
    // The cleared card may sit before the cursor, so rewind to pick it up again.
    const rewound = { ...state, answers }
    const back = state.queue.indexOf(imageId)
    return settle(back === -1 ? rewound : { ...rewound, cursor: Math.min(state.cursor, back) })
  }

  const entry: Answer = { imageId, verdict, phase: 1 }
  if (at === -1) return { ...state, answers: [...state.answers, entry] }
  // Changing your mind keeps the card's place in the history rather than jumping it
  // to the top — you're correcting a judgement, not making a new one.
  const answers = [...state.answers]
  answers[at] = entry
  return { ...state, answers }
}

/** Drop the current card as an unusable photo. Never becomes evidence. */
export function skipCurrent(state: InfiniteState): InfiniteState {
  const img = currentImage(state)
  if (!img) return state
  return settle({
    ...state,
    skipped: [...state.skipped, img.id],
    cursor: state.cursor + 1,
  })
}

/**
 * Step back to the last card judged and un-judge it. Unlimited, unlike the quiz's
 * one-step phase-scoped undo — there are no phases here and nothing to keep stable.
 */
export function undo(state: InfiniteState): InfiniteState {
  const last = state.answers[state.answers.length - 1]
  if (!last) return state
  const back = state.queue.indexOf(last.imageId)
  return {
    ...state,
    answers: state.answers.slice(0, -1),
    cursor: back === -1 ? state.cursor : back,
  }
}

export interface InfiniteStats {
  judged: number
  liked: number
  skipped: number
  /** Cards left in the catalog. Shown throughout so running out is never a surprise. */
  remaining: number
  /** Share of judged cards liked, 0..1. */
  likeRate: number
}

export function stats(state: InfiniteState): InfiniteStats {
  const judged = state.answers.length
  const liked = state.answers.filter((a) => a.verdict === 'like').length
  return {
    judged,
    liked,
    skipped: state.skipped.length,
    remaining: state.pool.length - judged - state.skipped.length,
    likeRate: judged === 0 ? 0 : liked / judged,
  }
}

/** Every judged image with its verdict, most recently judged first. */
export function history(state: InfiniteState): { image: HomeImage; verdict: Verdict }[] {
  const byId = new Map(state.pool.map((i) => [i.id, i]))
  const out: { image: HomeImage; verdict: Verdict }[] = []
  for (let i = state.answers.length - 1; i >= 0; i--) {
    const a = state.answers[i]
    const image = byId.get(a.imageId)
    if (image) out.push({ image, verdict: a.verdict })
  }
  return out
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function toSaved(state: InfiniteState): SavedInfinite {
  return {
    seed: state.seed,
    skipped: state.skipped,
    answers: state.answers.map((a) => ({ i: a.imageId, v: a.verdict })),
  }
}

/**
 * Rebuild from storage, dropping verdicts for photos the pool no longer has.
 *
 * Deliberately the opposite of the quiz's `restore()`, which discards the whole session
 * if a single card went missing. There, answers are positions in a deck, so a stale deck
 * would attach them to the wrong images. Here every answer names its own image, so a
 * retired photo costs exactly one verdict — throwing away a thousand others to avoid that
 * would be absurd.
 */
export function fromSaved(pool: HomeImage[], saved: SavedInfinite): InfiniteState {
  const ids = new Set(pool.map((i) => i.id))
  const seen = new Set<string>()
  const answers: Answer[] = []

  for (const a of saved.answers ?? []) {
    if (!a || !ids.has(a.i) || seen.has(a.i)) continue
    if (a.v !== 'like' && a.v !== 'dislike') continue
    seen.add(a.i)
    answers.push({ imageId: a.i, verdict: a.v, phase: 1 })
  }

  const base = createInfinite(pool, saved.seed)
  return settle({
    ...base,
    answers,
    skipped: (saved.skipped ?? []).filter((id) => ids.has(id)),
  })
}

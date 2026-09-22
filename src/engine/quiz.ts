// Two-phase quiz engine.
//
//   Phase 1 (broad)  — sample every style evenly to find which ones get a reaction.
//   Phase 2 (deep)   — spend the remaining cards on the styles that scored best,
//                      to confirm them and break ties.
//
// Pure functions over an immutable state object: the UI holds the state, calls
// `answer()`, and renders whatever comes back. That keeps the logic testable and
// the persistence trivial.

import type { HomeImage } from '../data/images'
import { STYLES } from '../data/taxonomy'

export type Verdict = 'like' | 'dislike'
export type Phase = 1 | 2

export interface Answer {
  imageId: string
  verdict: Verdict
  phase: Phase
}

export interface QuizConfig {
  /**
   * Target size of the phase-1 deck. Cards per style are derived from this so that
   * adding styles to the taxonomy widens the sample rather than lengthening the quiz.
   */
  phase1Cards: number
  /** Floor and ceiling on the derived cards-per-style. */
  phase1MinPerStyle: number
  phase1MaxPerStyle: number
  /**
   * Extra phase-1 cards picked purely to cover adjectives the style cards missed.
   * Without these, photos the harvester found by adjective rather than by style are
   * never shown, and the adjectives that only live on those photos are never scored.
   */
  phase1AttributeCards: number
  /** How many top styles phase 2 drills into. */
  phase2Focus: number
  /** Extra cards per focused style in phase 2. */
  phase2PerStyle: number
  /** A style must beat this liking rate in phase 1 to be worth drilling into. */
  phase2MinRate: number
  /** Phase-2 answers are more informative, so they weigh a little more. */
  phase2Weight: number
}

export const DEFAULT_CONFIG: QuizConfig = {
  phase1Cards: 28,
  phase1MinPerStyle: 1,
  phase1MaxPerStyle: 3,
  phase1AttributeCards: 8,
  phase2Focus: 4,
  phase2PerStyle: 4,
  phase2MinRate: 0.34,
  phase2Weight: 1.25,
}

/** Cards each style gets in phase 1, given how many styles the taxonomy defines. */
export function phase1PerStyle(config: QuizConfig, styleCount = STYLES.length): number {
  if (styleCount === 0) return 0
  const raw = Math.round(config.phase1Cards / styleCount)
  return Math.min(config.phase1MaxPerStyle, Math.max(config.phase1MinPerStyle, raw))
}

/**
 * The part of a session the scoring functions actually read. Both `QuizState` and the
 * endless deck's `InfiniteState` satisfy it structurally, so the two modes share one
 * scoring implementation rather than forking it.
 */
export interface Scored {
  pool: HomeImage[]
  answers: Answer[]
  config: QuizConfig
}

export interface QuizState extends Scored {
  config: QuizConfig
  /** Every image the quiz may draw from, keyed for cheap lookup. */
  pool: HomeImage[]
  queue: string[]
  cursor: number
  phase: Phase
  answers: Answer[]
  /** Cards dropped as unusable photos. Excluded from the deck, never scored. */
  skipped: string[]
  focus: string[]
  done: boolean
  /** Deterministic per-session shuffle seed, so a reload restores the same deck. */
  seed: number
}

// ---------------------------------------------------------------------------
// Deterministic RNG — a reload must rebuild the exact same queue from the seed.
// ---------------------------------------------------------------------------

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Picks one item at random, weighted by `weight`. Used instead of taking the argmax when
 * building the deck: a strict argmax is deterministic, so every session served the same
 * "best coverage" photos and the quiz felt repetitive. Weighting keeps coverage high
 * while letting the deck vary run to run.
 */
function weightedPick<T>(items: T[], weight: (item: T) => number, rand: () => number): number {
  let total = 0
  const weights = items.map((item) => {
    const w = Math.max(0, weight(item))
    total += w
    return w
  })
  if (total <= 0) return Math.floor(rand() * items.length)
  let r = rand() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

export function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------------------------------------------------------------------------
// Deck building
// ---------------------------------------------------------------------------

/**
 * Picks `count` images for a style, preferring photos tagged with that style alone —
 * a card that reads as two styles at once tells us less about either.
 */
function pickForStyle(
  styleId: string,
  count: number,
  pool: HomeImage[],
  used: Set<string>,
  rand: () => number,
  /** Attribute ids already represented in the deck, mutated as picks are made. */
  covered?: Set<string>,
): HomeImage[] {
  const candidates = pool.filter((img) => img.styles.includes(styleId) && !used.has(img.id))
  const pure = shuffled(
    candidates.filter((img) => img.styles.length === 1),
    rand,
  )
  const mixed = shuffled(
    candidates.filter((img) => img.styles.length > 1),
    rand,
  )
  const ordered = [...pure, ...mixed]

  const picked: HomeImage[] = []
  for (let i = 0; i < count && ordered.length > 0; i++) {
    let choice = 0
    if (covered) {
      // Favour photos introducing adjectives the deck hasn't shown yet — that is what
      // lets ~28 cards produce evidence across 45 attributes — but sample rather than
      // take the best, so the same photos don't appear in every session.
      choice = weightedPick(
        ordered,
        (img) => ((img.attributes ?? []).filter((a) => !covered.has(a)).length + 1) ** 2,
        rand,
      )
    }
    const [img] = ordered.splice(choice, 1)
    picked.push(img)
    used.add(img.id)
    img.attributes?.forEach((a) => covered?.add(a))
  }
  return picked
}

/**
 * Interleaves per-style picks so consecutive cards are rarely the same style —
 * seeing four Art Deco bathrooms in a row primes the answer.
 */
function interleave(groups: HomeImage[][], rand: () => number): HomeImage[] {
  const out: HomeImage[] = []
  const lanes = groups.map((g) => [...g])
  let lastStyle = ''
  for (;;) {
    const live = lanes.map((l, i) => [l, i] as const).filter(([l]) => l.length > 0)
    if (live.length === 0) break
    // Prefer a lane whose next card is not the style we just showed.
    const fresh = live.filter(([l]) => !l[0].styles.includes(lastStyle))
    const choices = fresh.length > 0 ? fresh : live
    const [lane] = choices[Math.floor(rand() * choices.length)]
    const img = lane.shift()!
    out.push(img)
    lastStyle = img.styles[0]
  }
  return out
}

/**
 * Greedy set cover over the adjective axis: repeatedly take the unused photo that
 * introduces the most adjectives the deck hasn't shown yet. Rare adjectives win, because
 * the photos carrying them are the only ones that can add them.
 */
function pickForAttributeCoverage(
  count: number,
  pool: HomeImage[],
  used: Set<string>,
  covered: Set<string>,
  rand: () => number,
): HomeImage[] {
  const candidates = shuffled(
    pool.filter((img) => !used.has(img.id) && (img.attributes?.length ?? 0) > 0),
    rand,
  )
  const picked: HomeImage[] = []
  for (let i = 0; i < count; i++) {
    const live = candidates.filter((img) => !used.has(img.id))
    const fresh = (img: HomeImage) =>
      (img.attributes ?? []).filter((a) => !covered.has(a)).length
    // Nothing new left to cover — stop rather than pad the deck with redundant cards.
    if (!live.some((img) => fresh(img) > 0)) break
    // Sample among the photos that add something, weighted by how much they add.
    const pick = live[weightedPick(live, (img) => fresh(img) ** 3, rand)]
    used.add(pick.id)
    pick.attributes?.forEach((a) => covered.add(a))
    picked.push(pick)
  }
  return picked
}

function buildPhase1(pool: HomeImage[], config: QuizConfig, rand: () => number): string[] {
  const used = new Set<string>()
  // Only sample styles the catalog can actually illustrate, so a half-built catalog
  // doesn't make phase 1 silently shorter for some styles and absent for others.
  const available = STYLES.filter((s) => pool.some((img) => img.styles.includes(s.id)))
  const per = phase1PerStyle(config, available.length)
  const covered = new Set<string>()
  const groups = available.map((s) => pickForStyle(s.id, per, pool, used, rand, covered))

  // Then top up with photos chosen only for adjective coverage. These are mostly the
  // attribute-harvested photos, which carry no style tag and would otherwise never
  // appear in the deck at all.
  const topUp = pickForAttributeCoverage(config.phase1AttributeCards, pool, used, covered, rand)
  if (topUp.length > 0) groups.push(topUp)

  return interleave(groups, rand).map((i) => i.id)
}

function buildPhase2(
  state: QuizState,
  focus: string[],
  rand: () => number,
): string[] {
  const used = new Set(state.queue)
  const groups = focus.map((id) =>
    pickForStyle(id, state.config.phase2PerStyle, state.pool, used, rand),
  )
  return interleave(groups, rand).map((i) => i.id)
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface TagScore {
  tagId: string
  /** Weighted cards seen carrying this tag. */
  seen: number
  liked: number
  /** Laplace-smoothed liking rate in 0..1. */
  rate: number
  /** 0..1 — how much evidence we have. Drives the "we're not sure yet" copy. */
  confidence: number
  /** Ranking key: liking rate discounted by low confidence. */
  rank: number
}

/** Back-compat alias: style scores are tag scores over the style axis. */
export interface StyleScore extends TagScore {
  styleId: string
}

const PRIOR_LIKES = 1
const PRIOR_TOTAL = 2.5
const CONFIDENCE_HALF_LIFE = 3

type Axis = 'styles' | 'attributes'

const tagsOf = (img: HomeImage, axis: Axis): string[] =>
  axis === 'styles' ? img.styles : (img.attributes ?? [])

/**
 * Scores one tag axis. Evidence from a card is discounted by how many tags it carries,
 * so a photo that is four things at once doesn't cast a full vote for each — that would
 * make common tags look decisive purely because they co-occur a lot.
 *
 * The two axes need different discounts. A photo tagged with two *styles* is genuinely
 * ambiguous between them, so its evidence splits 1/k. A photo that is bright *and* wooden
 * *and* calm is honestly all three, so attributes discount by 1/sqrt(k) — enough to damp
 * co-occurrence inflation without starving a 45-tag axis of evidence.
 */
const SPLIT: Record<Axis, (k: number) => number> = {
  styles: (k) => 1 / k,
  attributes: (k) => 1 / Math.sqrt(k),
}

/**
 * id -> image, cached per pool array. The endless mode rescores on every swipe, and
 * rebuilding a 3000-entry map four times a render (once per scorer) is the one place that
 * actually shows up. The pool array is created once by the provider and never replaced,
 * so keying on its identity is enough.
 */
const poolIndexes = new WeakMap<HomeImage[], Map<string, HomeImage>>()

function indexOf(pool: HomeImage[]): Map<string, HomeImage> {
  let index = poolIndexes.get(pool)
  if (!index) {
    index = new Map(pool.map((i) => [i.id, i]))
    poolIndexes.set(pool, index)
  }
  return index
}

export function scoreTags(state: Scored, axis: Axis, universe?: string[]): TagScore[] {
  const seen = new Map<string, number>()
  const liked = new Map<string, number>()
  const byId = indexOf(state.pool)

  for (const answer of state.answers) {
    const img = byId.get(answer.imageId)
    if (!img) continue
    const tags = tagsOf(img, axis)
    if (tags.length === 0) continue
    const weight = answer.phase === 2 ? state.config.phase2Weight : 1
    const share = weight * SPLIT[axis](tags.length)
    for (const tagId of tags) {
      seen.set(tagId, (seen.get(tagId) ?? 0) + share)
      if (answer.verdict === 'like') liked.set(tagId, (liked.get(tagId) ?? 0) + share)
    }
  }

  const ids = universe ?? [...seen.keys()]
  return ids
    .map((tagId) => {
      const s = seen.get(tagId) ?? 0
      const l = liked.get(tagId) ?? 0
      const rate = (l + PRIOR_LIKES) / (s + PRIOR_TOTAL)
      const confidence = s / (s + CONFIDENCE_HALF_LIFE)
      return {
        tagId,
        seen: s,
        liked: l,
        rate,
        confidence,
        // Half the weight on raw preference, half on preference we actually verified.
        rank: rate * (0.55 + 0.45 * confidence),
      }
    })
    .sort((a, b) => b.rank - a.rank)
}

export function scoreStyles(state: Scored): StyleScore[] {
  return scoreTags(
    state,
    'styles',
    STYLES.map((s) => s.id),
  ).map((t) => ({ ...t, styleId: t.tagId }))
}

/** Adjective scores, most-liked first. Only tags the quiz actually showed. */
export function scoreAttributes(state: Scored): TagScore[] {
  return scoreTags(state, 'attributes').filter((t) => t.seen > 0)
}

export interface RoomScore {
  roomId: string
  seen: number
  liked: number
  rate: number
}

export function scoreRooms(state: Scored): RoomScore[] {
  const seen = new Map<string, number>()
  const liked = new Map<string, number>()
  const byId = indexOf(state.pool)

  for (const answer of state.answers) {
    const img = byId.get(answer.imageId)
    if (!img) continue
    for (const roomId of img.rooms) {
      seen.set(roomId, (seen.get(roomId) ?? 0) + 1)
      if (answer.verdict === 'like') liked.set(roomId, (liked.get(roomId) ?? 0) + 1)
    }
  }

  return [...seen.keys()]
    .map((roomId) => {
      const s = seen.get(roomId) ?? 0
      const l = liked.get(roomId) ?? 0
      return { roomId, seen: s, liked: l, rate: (l + 1) / (s + 2) }
    })
    .sort((a, b) => b.rate - a.rate)
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export function createQuiz(
  pool: HomeImage[],
  config: QuizConfig = DEFAULT_CONFIG,
  seed = Math.floor(Math.random() * 2 ** 31),
): QuizState {
  const rand = mulberry32(seed)
  const queue = buildPhase1(pool, config, rand)
  return {
    config,
    pool,
    queue,
    cursor: 0,
    phase: 1,
    answers: [],
    skipped: [],
    focus: [],
    done: queue.length === 0,
    seed,
  }
}

export function currentImage(state: QuizState): HomeImage | null {
  const id = state.queue[state.cursor]
  if (!id) return null
  return state.pool.find((i) => i.id === id) ?? null
}

/** The card after the current one, so the deck can pre-render and preload it. */
export function upcomingImages(state: QuizState, count = 2): HomeImage[] {
  const out: HomeImage[] = []
  for (let i = 1; i <= count; i++) {
    const id = state.queue[state.cursor + i]
    if (!id) break
    const img = state.pool.find((im) => im.id === id)
    if (img) out.push(img)
  }
  return out
}

/** Styles worth a second look: best rated first, and only if they cleared the bar. */
function chooseFocus(state: QuizState): string[] {
  const scores = scoreStyles(state)
  const contenders = scores.filter((s) => s.rate >= state.config.phase2MinRate && s.liked > 0)
  // If the user disliked almost everything, still drill into the least-disliked few
  // rather than ending with nothing to say.
  const source = contenders.length > 0 ? contenders : scores
  return source.slice(0, state.config.phase2Focus).map((s) => s.styleId)
}

/** Ran out of cards: either open phase 2 or finish. */
function endOfQueue(state: QuizState): QuizState {
  if (state.phase !== 1) return { ...state, done: true }

  const focus = chooseFocus(state)
  const rand = mulberry32(state.seed ^ 0x9e3779b9)
  const extra = buildPhase2(state, focus, rand)
  if (extra.length === 0) return { ...state, focus, done: true }
  return { ...state, phase: 2, focus, queue: [...state.queue, ...extra] }
}

export function answer(state: QuizState, verdict: Verdict): QuizState {
  const img = currentImage(state)
  if (!img || state.done) return state

  const answers = [...state.answers, { imageId: img.id, verdict, phase: state.phase }]
  const cursor = state.cursor + 1
  const next: QuizState = { ...state, answers, cursor }

  return cursor < next.queue.length ? next : endOfQueue(next)
}

/**
 * Drop the current card as unusable ("wrong image"), without recording a preference.
 *
 * A skip must not become evidence — the user is judging the photo, not the room — so it
 * never enters `answers`. Where possible the card is replaced by another with the same
 * tags, so skipping a bad Art Deco photo doesn't cost Art Deco its slot in the deck.
 */
export function skip(state: QuizState): QuizState {
  const img = currentImage(state)
  if (!img || state.done) return state

  const inQueue = new Set(state.queue)
  const skipped = new Set(state.skipped)
  const eligible = state.pool.filter(
    (candidate) =>
      candidate.id !== img.id && !inQueue.has(candidate.id) && !skipped.has(candidate.id),
  )

  // Prefer a replacement matching the skipped card's styles, then its adjectives.
  const sameStyle = eligible.filter((c) => c.styles.some((s) => img.styles.includes(s)))
  const sameAttrs = eligible.filter((c) =>
    (c.attributes ?? []).some((a) => (img.attributes ?? []).includes(a)),
  )
  const pool = sameStyle.length > 0 ? sameStyle : sameAttrs
  // Vary the pick by cursor so skipping twice in a row doesn't offer the same photo.
  const rand = mulberry32(state.seed ^ (state.cursor + 1))
  const replacement = pool.length > 0 ? pool[Math.floor(rand() * pool.length)] : null

  const queue = [...state.queue]
  if (replacement) queue[state.cursor] = replacement.id
  else queue.splice(state.cursor, 1)

  const next: QuizState = {
    ...state,
    queue,
    skipped: [...state.skipped, img.id],
  }
  // Removing the last card with nothing to replace it ends the phase.
  return next.cursor >= queue.length ? endOfQueue(next) : next
}

/** Undo the last card. Only allowed within the current phase to keep the deck stable. */
export function undo(state: QuizState): QuizState {
  if (state.answers.length === 0) return state
  const last = state.answers[state.answers.length - 1]
  if (last.phase !== state.phase || state.done) return state
  return { ...state, answers: state.answers.slice(0, -1), cursor: state.cursor - 1 }
}

/** End the quiz now, scoring whatever has been answered so far. */
export function finishEarly(state: QuizState): QuizState {
  return { ...state, done: true, focus: state.focus.length ? state.focus : chooseFocus(state) }
}

export interface Progress {
  answered: number
  total: number
  phase: Phase
  /** Position within the current phase, for the segmented progress bar. */
  phaseAnswered: number
  phaseTotal: number
}

export function progress(state: QuizState): Progress {
  const phase1Total = state.pool.length === 0 ? 0 : countPhase1(state)
  const answered = state.answers.length
  if (state.phase === 1) {
    return {
      answered,
      total: state.queue.length,
      phase: 1,
      phaseAnswered: answered,
      phaseTotal: phase1Total,
    }
  }
  return {
    answered,
    total: state.queue.length,
    phase: 2,
    phaseAnswered: answered - phase1Total,
    phaseTotal: state.queue.length - phase1Total,
  }
}

function countPhase1(state: QuizState): number {
  const phase1Answers = state.answers.filter((a) => a.phase === 1).length
  // Once phase 2 has started the phase-1 block is exactly the answers it produced;
  // before that the whole queue is phase 1.
  return state.phase === 1 ? state.queue.length : phase1Answers
}

/** Images the user liked, most recent first — used for the results gallery. */
export function likedImages(state: Scored): HomeImage[] {
  const byId = indexOf(state.pool)
  return state.answers
    .filter((a) => a.verdict === 'like')
    .map((a) => byId.get(a.imageId))
    .filter((i): i is HomeImage => Boolean(i))
    .reverse()
}

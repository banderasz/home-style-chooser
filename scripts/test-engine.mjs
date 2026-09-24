#!/usr/bin/env node
// Engine smoke test. Runs the compiled-on-the-fly engine against a synthetic pool and a
// simulated user with known taste, and asserts the quiz recovers it.
//
//   node scripts/test-engine.mjs
//
// The engine is dependency-free TypeScript, so it is transpiled to a temp dir with the
// TypeScript compiler already in node_modules and imported directly — no test runner needed.

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import assert from 'node:assert/strict'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function loadEngine() {
  const dir = await mkdtemp(join(tmpdir(), 'hsc-'))
  // .mjs so node treats the temp files as ES modules regardless of the temp dir.
  const sources = {
    'taxonomy.mjs': 'src/data/taxonomy.ts',
    'quiz.mjs': 'src/engine/quiz.ts',
    'infinite.mjs': 'src/engine/infinite.ts',
    'product-taxonomy.mjs': 'src/data/product-taxonomy.ts',
    'products.mjs': 'src/engine/products.ts',
  }
  for (const [out, src] of Object.entries(sources)) {
    const code = await readFile(join(ROOT, src), 'utf8')
    const js = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
    // Flatten the import paths: all files sit side by side in the temp dir.
    await writeFile(
      join(dir, out),
      js
        .replace("'../data/taxonomy'", "'./taxonomy.mjs'")
        .replace("'../data/product-taxonomy'", "'./product-taxonomy.mjs'")
        .replace("'../data/products'", "'./product-taxonomy.mjs'")
        .replace("'./infinite'", "'./infinite.mjs'")
        .replace("'./quiz'", "'./quiz.mjs'"),
    )
  }
  const mod = await import(pathToFileURL(join(dir, 'quiz.mjs')).href)
  const infinite = await import(pathToFileURL(join(dir, 'infinite.mjs')).href)
  const products = await import(pathToFileURL(join(dir, 'products.mjs')).href)
  return { mod, infinite, products, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

function syntheticPool(styles, perStyle = 12, attributesFor = () => []) {
  const rooms = ['living', 'kitchen', 'bathroom', 'bedroom', 'dining', 'office']
  const images = []
  for (const s of styles) {
    for (let i = 0; i < perStyle; i++) {
      images.push({
        id: `${s}-${i}`,
        url: `https://example.test/${s}-${i}.jpg`,
        thumbnail: `https://example.test/${s}-${i}.jpg`,
        title: `${s} ${i}`,
        styles: [s],
        attributes: attributesFor(s, i),
        rooms: [rooms[i % rooms.length]],
        creator: 'test',
        creatorUrl: null,
        source: null,
        license: 'CC BY 2.0',
        licenseUrl: null,
      })
    }
  }
  return images
}

const tests = []
const test = (name, fn) => tests.push([name, fn])

const { mod: E, infinite: I, products: P, cleanup } = await loadEngine()
const { STYLES } = await import(
  pathToFileURL(join(ROOT, 'scripts', 'taxonomy.mjs')).href
)
const STYLE_IDS = STYLES.map((s) => s.id)
const POOL = syntheticPool(STYLE_IDS)

/** Plays the whole quiz as a user who loves `loved` and dislikes everything else. */
function play(pool, loved, opts = {}) {
  let state = E.createQuiz(pool, { ...E.DEFAULT_CONFIG, ...(opts.config ?? {}) }, opts.seed ?? 42)
  let guard = 0
  while (!state.done && guard++ < 500) {
    const img = E.currentImage(state)
    if (!img) break
    const likes = img.styles.some((s) => loved.includes(s))
    state = E.answer(state, likes ? 'like' : 'dislike')
  }
  assert.ok(guard < 500, 'quiz did not terminate')
  return state
}

test('phase 1 shows every style the configured number of times', () => {
  const state = E.createQuiz(POOL, E.DEFAULT_CONFIG, 7)
  const byId = new Map(POOL.map((i) => [i.id, i]))
  const counts = new Map()
  for (const id of state.queue) {
    for (const s of byId.get(id).styles) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  const per = E.phase1PerStyle(E.DEFAULT_CONFIG, STYLE_IDS.length)
  assert.equal(state.queue.length, STYLE_IDS.length * per)
  for (const s of STYLE_IDS) {
    assert.equal(counts.get(s), per, `style ${s} undersampled`)
  }
})

test('phase 1 stays near its target length as the taxonomy grows', () => {
  for (const styleCount of [6, 12, 18, 24, 40]) {
    const per = E.phase1PerStyle(E.DEFAULT_CONFIG, styleCount)
    const cards = per * styleCount
    assert.ok(per >= 1, `${styleCount} styles gave ${per} cards each`)
    // With many styles the floor of 1 card each necessarily overshoots the target;
    // what must not happen is the deck scaling linearly with an unbounded per-style count.
    assert.ok(
      cards <= Math.max(E.DEFAULT_CONFIG.phase1Cards * 1.5, styleCount),
      `${styleCount} styles produced ${cards} cards`,
    )
  }
})

test('phase 1 skips styles the catalog cannot illustrate', () => {
  const partial = syntheticPool(['coastal', 'japandi', 'brutalist'], 10)
  const state = E.createQuiz(partial, E.DEFAULT_CONFIG, 3)
  const byId = new Map(partial.map((i) => [i.id, i]))
  const present = new Set(state.queue.flatMap((id) => byId.get(id).styles))
  assert.deepEqual([...present].sort(), ['brutalist', 'coastal', 'japandi'])
  // Every available style still gets the same number of cards.
  const per = E.phase1PerStyle(E.DEFAULT_CONFIG, 3)
  assert.equal(state.queue.length, 3 * per)
})

test('phase 1 never shows the same style twice in a row', () => {
  const state = E.createQuiz(POOL, E.DEFAULT_CONFIG, 99)
  const byId = new Map(POOL.map((i) => [i.id, i]))
  let repeats = 0
  for (let i = 1; i < state.queue.length; i++) {
    const a = byId.get(state.queue[i - 1]).styles[0]
    const b = byId.get(state.queue[i]).styles[0]
    if (a === b) repeats++
  }
  assert.equal(repeats, 0, `${repeats} adjacent same-style pairs`)
})

test('the deck never repeats an image', () => {
  const state = play(POOL, ['japandi', 'coastal'])
  assert.equal(new Set(state.queue).size, state.queue.length)
})

test('phase 2 focuses on the styles the user liked', () => {
  const loved = ['industrial', 'artdeco']
  const state = play(POOL, loved)
  for (const l of loved) assert.ok(state.focus.includes(l), `${l} missing from focus`)
})

test('phase 2 only shows focused styles', () => {
  const state = play(POOL, ['bohemian'])
  const byId = new Map(POOL.map((i) => [i.id, i]))
  const phase1Count = state.answers.filter((a) => a.phase === 1).length
  for (const id of state.queue.slice(phase1Count)) {
    const img = byId.get(id)
    assert.ok(
      img.styles.some((s) => state.focus.includes(s)),
      `${img.id} is not a focused style`,
    )
  }
})

test('the top-ranked style is the one the user loved', () => {
  for (const loved of [['coastal'], ['maximalist'], ['japandi'], ['traditional']]) {
    const state = play(POOL, loved)
    const ranked = E.scoreStyles(state)
    assert.equal(ranked[0].styleId, loved[0], `expected ${loved[0]}, got ${ranked[0].styleId}`)
  }
})

test('two loved styles both land in the top two', () => {
  const loved = ['midcentury', 'farmhouse']
  const state = play(POOL, loved)
  const top2 = E.scoreStyles(state).slice(0, 2).map((s) => s.styleId)
  assert.deepEqual([...top2].sort(), [...loved].sort())
})

test('result is stable across seeds', () => {
  for (const seed of [1, 2, 3, 11, 12345]) {
    const state = play(POOL, ['scandinavian'], { seed })
    assert.equal(E.scoreStyles(state)[0].styleId, 'scandinavian', `seed ${seed} failed`)
  }
})

test('a user who dislikes everything still terminates with a ranking', () => {
  const state = play(POOL, [])
  assert.ok(state.done)
  assert.ok(E.scoreStyles(state).length > 0)
  assert.ok(state.focus.length > 0, 'focus should fall back rather than be empty')
})

test('a user who likes everything terminates', () => {
  const state = play(POOL, STYLE_IDS)
  assert.ok(state.done)
  assert.equal(state.answers.length, state.queue.length)
})

test('replaying saved answers reproduces the same state', () => {
  const original = play(POOL, ['coastal', 'japandi'], { seed: 314 })
  let replay = E.createQuiz(POOL, E.DEFAULT_CONFIG, 314)
  for (const a of original.answers) replay = E.answer(replay, a.verdict)
  assert.deepEqual(replay.queue, original.queue)
  assert.deepEqual(replay.focus, original.focus)
  assert.equal(replay.cursor, original.cursor)
})

test('undo steps back within a phase and is a no-op at the start', () => {
  let state = E.createQuiz(POOL, E.DEFAULT_CONFIG, 5)
  assert.equal(E.undo(state).cursor, 0)
  state = E.answer(state, 'like')
  state = E.undo(state)
  assert.equal(state.cursor, 0)
  assert.equal(state.answers.length, 0)
})

test('progress never exceeds its total', () => {
  let state = E.createQuiz(POOL, E.DEFAULT_CONFIG, 8)
  let guard = 0
  while (!state.done && guard++ < 500) {
    const p = E.progress(state)
    assert.ok(p.phaseAnswered < p.phaseTotal, `phase ${p.phase}: ${p.phaseAnswered}/${p.phaseTotal}`)
    assert.ok(p.answered < p.total)
    state = E.answer(state, guard % 3 === 0 ? 'like' : 'dislike')
  }
})

test('a thin catalog degrades instead of crashing', () => {
  const thin = syntheticPool(['coastal', 'japandi'], 3)
  const state = play(thin, ['coastal'])
  assert.ok(state.done)
  assert.equal(E.scoreStyles(state).filter((s) => s.seen > 0)[0].styleId, 'coastal')
})

test('an empty catalog is immediately done', () => {
  const state = E.createQuiz([], E.DEFAULT_CONFIG, 1)
  assert.ok(state.done)
  assert.equal(E.currentImage(state), null)
})

test('finishEarly ends the quiz with a usable ranking', () => {
  let state = E.createQuiz(POOL, E.DEFAULT_CONFIG, 21)
  for (let i = 0; i < 10; i++) {
    const img = E.currentImage(state)
    state = E.answer(state, img.styles.includes('artdeco') ? 'like' : 'dislike')
  }
  state = E.finishEarly(state)
  assert.ok(state.done)
  assert.ok(E.scoreStyles(state).some((s) => s.seen > 0))
})

test('phase-2 answers outweigh phase-1 answers', () => {
  // Like industrial in round 1, then hate it in round 2: it must not stay on top.
  let state = E.createQuiz(POOL, E.DEFAULT_CONFIG, 77)
  let guard = 0
  while (!state.done && guard++ < 500) {
    const img = E.currentImage(state)
    const isIndustrial = img.styles.includes('industrial')
    const like = state.phase === 1 ? isIndustrial || img.styles.includes('coastal') : !isIndustrial
    state = E.answer(state, like ? 'like' : 'dislike')
  }
  const ranked = E.scoreStyles(state)
  const industrial = ranked.findIndex((s) => s.styleId === 'industrial')
  const coastal = ranked.findIndex((s) => s.styleId === 'coastal')
  assert.ok(coastal < industrial, 'coastal should outrank the recanted industrial')
})

test('skipping a card never records a preference', () => {
  let state = E.createQuiz(POOL, E.DEFAULT_CONFIG, 17)
  const before = E.currentImage(state).id
  state = E.skip(state)
  assert.equal(state.answers.length, 0, 'a skip must not become evidence')
  assert.deepEqual(state.skipped, [before])
  assert.notEqual(E.currentImage(state).id, before)
})

test('a skipped card is replaced by one with the same style', () => {
  let state = E.createQuiz(POOL, E.DEFAULT_CONFIG, 18)
  const before = E.currentImage(state)
  const lengthBefore = state.queue.length
  state = E.skip(state)
  const after = E.currentImage(state)
  assert.equal(state.queue.length, lengthBefore, 'the style lost its slot in the deck')
  assert.ok(
    after.styles.some((s) => before.styles.includes(s)),
    `replaced ${before.styles} with ${after.styles}`,
  )
})

test('a skipped card never comes back', () => {
  let state = E.createQuiz(POOL, E.DEFAULT_CONFIG, 19)
  const dropped = new Set()
  for (let i = 0; i < 6; i++) {
    dropped.add(E.currentImage(state).id)
    state = E.skip(state)
  }
  for (const id of state.queue) assert.ok(!dropped.has(id), `${id} came back`)
})

test('skipping still terminates when there is nothing to replace with', () => {
  // Two photos per style and no spares: skips must shorten the deck, not hang.
  const tiny = syntheticPool(['coastal', 'japandi'], 2)
  let state = E.createQuiz(tiny, E.DEFAULT_CONFIG, 20)
  let guard = 0
  while (!state.done && guard++ < 100) state = E.skip(state)
  assert.ok(state.done, 'skipping every card did not finish the quiz')
  assert.equal(state.answers.length, 0)
})

// ---------------------------------------------------------------------------
// The adjective axis
// ---------------------------------------------------------------------------

const { ATTRIBUTES, tagsFor } = await import(
  pathToFileURL(join(ROOT, 'scripts', 'attributes.mjs')).href
)

test('attribute ids match between the lexicon and the app taxonomy', async () => {
  const appSource = await readFile(join(ROOT, 'src/data/taxonomy.ts'), 'utf8')
  const appIds = [...appSource.matchAll(/\{ id: '([a-z0-9]+)', label: '[^']*', group:/g)].map(
    (m) => m[1],
  )
  const lexIds = ATTRIBUTES.map((a) => a.id)
  assert.deepEqual([...appIds].sort(), [...lexIds].sort())
})

test('style ids match between the harvest taxonomy and the app taxonomy', async () => {
  const appSource = await readFile(join(ROOT, 'src/data/taxonomy.ts'), 'utf8')
  const stylesBlock = appSource.slice(
    appSource.indexOf('export const STYLES'),
    appSource.indexOf('export const ATTRIBUTES'),
  )
  const appIds = [...stylesBlock.matchAll(/id: '([a-z0-9]+)',/g)].map((m) => m[1])
  assert.deepEqual([...appIds].sort(), [...STYLE_IDS].sort())
})

test('the lexicon matches whole words only', () => {
  // The classic false positives: "art" inside "apartment", "cane" inside "hurricane".
  assert.ok(!tagsFor('a modern apartment').includes('artsy'))
  assert.ok(!tagsFor('after the hurricane').includes('rattan'))
  assert.ok(tagsFor('a wall of art').includes('artsy'))
  assert.ok(tagsFor('a cane chair').includes('rattan'))
})

test('the lexicon reads a realistic caption', () => {
  const tags = tagsFor('A cozy wooden cabin interior featuring a dining area and rustic decor.')
  for (const expected of ['cozy', 'wood', 'rustic']) {
    assert.ok(tags.includes(expected), `expected ${expected} in ${tags.join(',')}`)
  }
})

const ATTR_A = ['bright', 'wood', 'calm']
const ATTR_B = ['dark', 'metal', 'dramatic']
const twoToneAttrs = (styleId) =>
  ['coastal', 'japandi', 'scandinavian'].includes(styleId) ? ATTR_A : ATTR_B
const ATTR_POOL = syntheticPool(STYLE_IDS, 12, twoToneAttrs)

test('attributes are scored from the tags of whatever was swiped', () => {
  const state = play(ATTR_POOL, ['coastal', 'japandi'])
  const scored = E.scoreAttributes(state)
  const top = scored.slice(0, 3).map((a) => a.tagId)
  for (const a of ATTR_A) assert.ok(top.includes(a), `${a} not in top 3: ${top.join(',')}`)
})

test('disliked adjectives rank below liked ones', () => {
  const state = play(ATTR_POOL, ['coastal', 'japandi', 'scandinavian'])
  const scored = E.scoreAttributes(state)
  const rate = (id) => scored.find((a) => a.tagId === id).rate
  for (const liked of ATTR_A) {
    for (const disliked of ATTR_B) {
      assert.ok(rate(liked) > rate(disliked), `${liked} should beat ${disliked}`)
    }
  }
})

test('a photo with many adjectives does not overweight each of them', () => {
  // One card, four tags: each tag gets 1/sqrt(4) of a vote — discounted, but not to the
  // 1/4 that would leave a 45-tag axis with no usable evidence after 40 cards.
  const pool = syntheticPool(['coastal'], 4, () => ['bright', 'wood', 'calm', 'plants'])
  let state = E.createQuiz(pool, E.DEFAULT_CONFIG, 4)
  state = E.answer(state, 'like')
  const scored = E.scoreAttributes(state)
  assert.equal(scored.length, 4)
  for (const a of scored) assert.ok(Math.abs(a.seen - 0.5) < 1e-9, `${a.tagId} seen=${a.seen}`)
})

test('styles still split their evidence strictly', () => {
  // A photo that reads as two styles is genuinely ambiguous: half a vote each.
  const pool = syntheticPool(['coastal'], 4)
  pool.forEach((i) => i.styles.push('japandi'))
  let state = E.createQuiz(pool, E.DEFAULT_CONFIG, 4)
  state = E.answer(state, 'like')
  const scored = E.scoreStyles(state).filter((s) => s.seen > 0)
  assert.equal(scored.length, 2)
  for (const s of scored) assert.ok(Math.abs(s.seen - 0.5) < 1e-9, `${s.styleId} seen=${s.seen}`)
})

test('untagged photos are skipped by the attribute axis, not counted as evidence', () => {
  const pool = syntheticPool(['coastal'], 4, () => [])
  let state = E.createQuiz(pool, E.DEFAULT_CONFIG, 4)
  state = E.answer(state, 'like')
  assert.deepEqual(E.scoreAttributes(state), [])
})

test('phase 1 tops up with attribute-only photos', () => {
  // Half the pool carries a style, half carries only adjectives. The style half alone
  // can never surface 'pastel', so the top-up segment is the only way it gets scored.
  const styled = syntheticPool(['coastal', 'japandi'], 6, () => ['bright', 'wood'])
  const orphans = syntheticPool(['x'], 6, () => ['pastel', 'livedin']).map((i) => ({
    ...i,
    id: `orphan-${i.id}`,
    styles: [],
  }))
  const pool = [...styled, ...orphans]
  const byId = new Map(pool.map((i) => [i.id, i]))

  const state = E.createQuiz(pool, E.DEFAULT_CONFIG, 11)
  const shown = state.queue.map((id) => byId.get(id))
  assert.ok(
    shown.some((i) => i.styles.length === 0),
    'no attribute-only photo made it into the deck',
  )
  const covered = new Set(shown.flatMap((i) => i.attributes ?? []))
  assert.ok(covered.has('pastel'), 'pastel never shown')
  assert.ok(covered.has('livedin'), 'livedin never shown')
})

test('the top-up stops once there is nothing new to cover', () => {
  // Every photo carries the same two adjectives: one top-up card exhausts the coverage,
  // so the deck must not pad itself with seven redundant ones.
  const pool = syntheticPool(['coastal', 'japandi'], 8, () => ['bright', 'wood'])
  const state = E.createQuiz(pool, E.DEFAULT_CONFIG, 12)
  const per = E.phase1PerStyle(E.DEFAULT_CONFIG, 2)
  assert.equal(state.queue.length, 2 * per, 'deck was padded with redundant top-up cards')
})

test('different sessions produce substantially different decks', async () => {
  // Regression guard: deck building favours adjective coverage, and a strict argmax
  // made that deterministic — every session served the same photos.
  const raw = JSON.parse(await readFile(join(ROOT, 'src/data/catalog.json'), 'utf8'))
  const pool = raw.images.filter((i) => i.styles.length > 0 || (i.attributes?.length ?? 0) > 0)

  const decks = [1, 2, 3, 4, 5].map((seed) => new Set(E.createQuiz(pool, E.DEFAULT_CONFIG, seed).queue))
  let worst = 0
  for (let a = 0; a < decks.length; a++) {
    for (let b = a + 1; b < decks.length; b++) {
      const shared = [...decks[a]].filter((id) => decks[b].has(id)).length
      worst = Math.max(worst, shared / decks[a].size)
    }
  }
  console.log(`      (worst pairwise deck overlap: ${(worst * 100).toFixed(0)}%)`)
  assert.ok(worst < 0.4, `decks are ${(worst * 100).toFixed(0)}% identical across seeds`)
})

test('phase 1 covers far more adjectives than it has cards', async () => {
  // Against the real catalog: the greedy cover is the reason ~28 cards can say
  // anything useful about 45 attributes.
  const raw = JSON.parse(await readFile(join(ROOT, 'src/data/catalog.json'), 'utf8'))
  const pool = raw.images.filter((i) => i.styles.length > 0 || (i.attributes?.length ?? 0) > 0)
  const byId = new Map(pool.map((i) => [i.id, i]))

  let worst = Infinity
  for (const seed of [1, 7, 42, 1000]) {
    const state = E.createQuiz(pool, E.DEFAULT_CONFIG, seed)
    const covered = new Set(state.queue.flatMap((id) => byId.get(id).attributes ?? []))
    worst = Math.min(worst, covered.size)
    assert.ok(
      covered.size > state.queue.length,
      `seed ${seed}: ${state.queue.length} cards covered only ${covered.size} attributes`,
    )
  }
  console.log(`      (worst-case coverage: ${worst} attributes)`)
})

// ---------------------------------------------------------------------------
// Endless mode
// ---------------------------------------------------------------------------

/** Swipes `n` cards, liking anything tagged with a style in `loved`. */
function swipe(state, n, loved) {
  for (let i = 0; i < n; i++) {
    const img = I.currentImage(state)
    if (!img) break
    state = I.judge(state, img.styles.some((s) => loved.includes(s)) ? 'like' : 'dislike')
  }
  return state
}

test('endless mode never serves the same photo twice', () => {
  let state = I.createInfinite(POOL, 7)
  const seen = []
  for (let i = 0; i < 120; i++) {
    const img = I.currentImage(state)
    if (!img) break
    seen.push(img.id)
    state = I.judge(state, 'like')
  }
  assert.equal(seen.length, 120)
  assert.equal(new Set(seen).size, 120, 'a photo came round twice')
})

test('judging the same photo again replaces rather than duplicates', () => {
  let state = I.createInfinite(POOL, 7)
  const id = I.currentImage(state).id
  state = I.judge(state, 'like')
  state = I.setVerdict(state, id, 'dislike')
  assert.equal(state.answers.filter((a) => a.imageId === id).length, 1)
  assert.equal(state.answers.find((a) => a.imageId === id).verdict, 'dislike')
})

test('changing a verdict keeps its place in the history', () => {
  let state = I.createInfinite(POOL, 7)
  const first = I.currentImage(state).id
  state = swipe(state, 4, [])
  state = I.setVerdict(state, first, 'like')
  assert.equal(state.answers[0].imageId, first, 'the edited card jumped position')
})

test('clearing a verdict drops it from the evidence', () => {
  let state = I.createInfinite(POOL, 7)
  const id = I.currentImage(state).id
  const style = I.currentImage(state).styles[0]
  state = I.judge(state, 'like')

  const before = E.scoreStyles(state).find((s) => s.styleId === style).seen
  const cleared = I.setVerdict(state, id, null)
  const after = E.scoreStyles(cleared).find((s) => s.styleId === style).seen

  assert.ok(before > 0)
  assert.ok(after < before, 'clearing left the evidence behind')
  assert.equal(cleared.answers.length, 0)
})

test('a cleared photo comes back round', () => {
  let state = I.createInfinite(POOL, 7)
  const id = I.currentImage(state).id
  state = swipe(state, 5, [])
  assert.ok(!state.queue.slice(state.cursor).includes(id) || state.cursor === 0)

  state = I.setVerdict(state, id, null)
  assert.equal(I.currentImage(state).id, id, 'the cleared photo was not re-served')
})

test('ignored photos are never scored and never return', () => {
  let state = I.createInfinite(POOL, 7)
  const id = I.currentImage(state).id
  state = I.skipCurrent(state)
  assert.deepEqual(state.skipped, [id])
  assert.equal(state.answers.length, 0)
  state = swipe(state, 30, [])
  assert.ok(!state.answers.some((a) => a.imageId === id))
})

test('undo steps back to the photo it un-judged', () => {
  let state = I.createInfinite(POOL, 7)
  state = swipe(state, 6, [])
  const last = state.answers[state.answers.length - 1].imageId
  state = I.undo(state)
  assert.equal(state.answers.length, 5)
  assert.equal(I.currentImage(state).id, last)
})

test('endless mode and the quiz score an identical answer list identically', () => {
  let state = I.createInfinite(POOL, 7)
  state = swipe(state, 40, [STYLE_IDS[0], STYLE_IDS[1]])

  // The same verdicts fed through a quiz-shaped state.
  const asQuiz = { config: E.DEFAULT_CONFIG, pool: POOL, answers: state.answers }
  assert.deepEqual(E.scoreStyles(asQuiz), E.scoreStyles(state))
  assert.deepEqual(E.scoreAttributes(asQuiz), E.scoreAttributes(state))
})

test('the ranking tracks what was actually liked', () => {
  const loved = [STYLE_IDS[3]]
  let state = I.createInfinite(POOL, 11)
  state = swipe(state, 80, loved)
  const top = E.scoreStyles(state).filter((s) => s.seen > 0)[0]
  assert.equal(top.styleId, loved[0], `expected ${loved[0]}, got ${top.styleId}`)
})

test('stats add up', () => {
  let state = I.createInfinite(POOL, 7)
  state = swipe(state, 10, [STYLE_IDS[0]])
  state = I.skipCurrent(state)
  const s = I.stats(state)
  assert.equal(s.judged, 10)
  assert.equal(s.skipped, 1)
  assert.equal(s.remaining, POOL.length - 11)
  assert.equal(s.liked + (s.judged - s.liked), 10)
})

test('a saved session round-trips, dropping only photos the pool lost', () => {
  let state = I.createInfinite(POOL, 7)
  state = swipe(state, 12, [STYLE_IDS[0]])
  const saved = I.toSaved(state)

  const same = I.fromSaved(POOL, saved)
  assert.deepEqual(same.answers, state.answers)
  assert.equal(same.cursor, state.cursor)

  // Retire one judged photo, as an ignore vote would.
  const gone = state.answers[0].imageId
  const smaller = POOL.filter((i) => i.id !== gone)
  const restored = I.fromSaved(smaller, saved)
  assert.equal(restored.answers.length, 11, 'lost more than the retired photo')
  assert.ok(!restored.answers.some((a) => a.imageId === gone))
})

test('a corrupt saved session degrades instead of throwing', () => {
  const restored = I.fromSaved(POOL, {
    seed: 3,
    skipped: ['nope'],
    answers: [
      { i: 'not-in-pool', v: 'like' },
      { i: POOL[0].id, v: 'sideways' },
      { i: POOL[1].id, v: 'like' },
      { i: POOL[1].id, v: 'dislike' },
    ],
  })
  assert.deepEqual(
    restored.answers,
    [{ imageId: POOL[1].id, verdict: 'like', phase: 1 }],
    'bad entries were not filtered',
  )
  assert.deepEqual(restored.skipped, [])
})


// ---------------------------------------------------------------------------
// Product mode
// ---------------------------------------------------------------------------

/** A tiny catalog with deliberate structure: oak things are beige, metal things black. */
function productPool() {
  const out = []
  const kinds = [
    ['sofa', 'solid-wood', 'beige', ['curved']],
    ['armchair', 'solid-wood', 'beige', ['curved']],
    ['coffee-table', 'solid-wood', 'brown', ['curved']],
    ['floor-lamp', 'metal', 'black', ['sleek']],
    ['pendant', 'metal', 'black', ['sleek']],
    ['desk', 'metal', 'grey', ['sleek']],
  ]
  for (const [category, material, colour, attributes] of kinds) {
    for (let i = 0; i < 8; i++) {
      out.push({
        id: `${category}-${i}`,
        itemNoGlobal: `${category}${i}`,
        retailer: 'ikea',
        market: 'at',
        name: i === 0 ? 'SERIESX' : `${category.toUpperCase()}${i}`,
        typeLabel: category,
        url: `https://example.test/${category}-${i}`,
        image: `https://example.test/${category}-${i}.jpg`,
        imageIsContext: true,
        cutout: null,
        price: { amount: 100 + i, currency: 'EUR' },
        rating: null,
        categories: [category],
        materials: [material],
        colours: [colour],
        attributes,
      })
    }
  }
  return out
}

const PRODUCTS = productPool()

/** Judge every product in the little catalog, liking the ones `likes` selects. */
function swipeProducts(state, likes) {
  let s = state
  for (const p of PRODUCTS) s = I.setVerdict(s, p.id, likes(p) ? 'like' : 'dislike')
  return s
}

test('product scoring separates the axis the user actually cared about', () => {
  let s = P.createProductDeck(PRODUCTS, 1)
  s = swipeProducts(s, (p) => p.materials.includes('solid-wood'))

  const materials = P.scoreMaterials(s)
  assert.equal(materials[0].tagId, 'solid-wood', 'wood should top the material axis')
  assert.ok(
    materials.find((m) => m.tagId === 'metal').rate < 0.4,
    'metal should be clearly rejected',
  )
  const colours = P.scoreColours(s)
  assert.equal(colours[0].tagId, 'beige', 'beige rides along with wood in this catalog')
})

test('room-only adjectives never reach the product attribute ranking', () => {
  let s = P.createProductDeck(
    PRODUCTS.map((p) => ({ ...p, attributes: [...p.attributes, 'daylight', 'spacious'] })),
    1,
  )
  s = I.setVerdict(s, PRODUCTS[0].id, 'like')
  const ids = P.scoreProductAttributes(s).map((a) => a.tagId)
  assert.ok(!ids.includes('daylight'), 'daylight is not a property of an object')
  assert.ok(!ids.includes('spacious'), 'spacious is not a property of an object')
})

test('the summary reports raw counts, not the smoothed ranking rate', () => {
  let s = P.createProductDeck(PRODUCTS, 1)
  // Four of the five wood sofas liked — the summary must say 80%, because it prints
  // "4/5" right next to it and a Laplace-smoothed 71% would contradict its own maths.
  const sofas = PRODUCTS.filter((p) => p.categories[0] === 'sofa').slice(0, 5)
  sofas.forEach((p, i) => (s = I.setVerdict(s, p.id, i < 4 ? 'like' : 'dislike')))

  const summary = P.summary(s)
  const sofa = summary.categories.find((c) => c.tagId === 'sofa')
  assert.equal(sofa.seen, 5)
  assert.equal(sofa.liked, 4)
  assert.equal(sofa.rate, 0.8, 'rate must be liked/seen exactly')
  assert.equal(summary.judged, 5)
  assert.equal(summary.liked, 4)
  assert.equal(summary.likeRate, 0.8)
})

test('the summary orders tags by how much evidence there is, not by rate', () => {
  let s = P.createProductDeck(PRODUCTS, 1)
  // One stool, liked: a perfect rate on a single swipe.
  s = I.setVerdict(s, 'sofa-0', 'like')
  // Six lamps, four liked: a lower rate on far more evidence.
  const lamps = PRODUCTS.filter((p) => p.categories[0] === 'floor-lamp').slice(0, 6)
  lamps.forEach((p, i) => (s = I.setVerdict(s, p.id, i < 4 ? 'like' : 'dislike')))

  const cats = P.summary(s).categories
  assert.equal(cats[0].tagId, 'floor-lamp', 'the better-evidenced tag comes first')
  assert.ok(cats[0].rate < cats[1].rate, 'even though its rate is lower')
})

test('history lists judged and skipped products, most recent first', () => {
  let s = P.createProductDeck(PRODUCTS, 1)
  s = I.setVerdict(s, 'sofa-0', 'like')
  s = I.setVerdict(s, 'sofa-1', 'dislike')
  s = { ...s, skipped: ['desk-0'] }

  const h = P.productHistory(s)
  assert.deepEqual(
    h.map((x) => [x.product.id, x.verdict]),
    [
      ['sofa-1', 'dislike'],
      ['sofa-0', 'like'],
      ['desk-0', 'skipped'],
    ],
    'judged newest-first, then skips',
  )
})

test('a skipped product can be restored to the deck', () => {
  let s = P.createProductDeck(PRODUCTS, 1)
  const first = s.queue[0]
  s = I.skipCurrent(s)
  assert.ok(s.skipped.includes(first), 'precondition: it was skipped')
  assert.notEqual(I.currentImage(s).id, first, 'precondition: the deck moved on')

  const restored = P.unskip(s, first)
  assert.deepEqual(restored.skipped, [], 'the skip is gone')
  assert.equal(I.currentImage(restored).id, first, 'and it is the card in front of you again')
  assert.equal(
    restored.answers.length,
    0,
    'restoring must not invent a verdict — a skip was never evidence',
  )
})

test('restoring every skip rewinds to the earliest of them', () => {
  let s = P.createProductDeck(PRODUCTS, 1)
  const first = s.queue[0]
  s = I.skipCurrent(s)
  s = I.skipCurrent(s)
  s = I.setVerdict(s, s.queue[2], 'like')
  assert.equal(s.skipped.length, 2)

  const restored = P.unskipAll(s)
  assert.deepEqual(restored.skipped, [])
  assert.equal(I.currentImage(restored).id, first, 'the deck rewinds to the first skip')
  assert.equal(restored.answers.length, 1, 'verdicts given after the skips survive')
})

test('unskip is a no-op for a product that was never skipped', () => {
  const s = P.createProductDeck(PRODUCTS, 1)
  assert.equal(P.unskip(s, 'sofa-3'), s, 'same object back — nothing to do')
  assert.equal(P.unskipAll(s), s)
})

let failed = 0
for (const [name, fn] of tests) {
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (err) {
    failed++
    console.log(`FAIL  ${name}`)
    console.log(`      ${err.message}`)
  }
}
await cleanup()
console.log(`\n${tests.length - failed}/${tests.length} passed`)
process.exit(failed ? 1 : 0)

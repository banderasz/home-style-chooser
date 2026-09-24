import { useCallback, useEffect, useState } from 'react'
import Intro from './components/Intro'
import Deck from './components/Deck'
import InfiniteDeck from './components/InfiniteDeck'
import History from './components/History'
import Results from './components/Results'
import ProductDeck from './components/ProductDeck'
import ProductResults from './components/ProductResults'
import { curatedProvider, voteIgnore, type HomeImage } from './data/images'
import { ikeaProvider, loadAffinity } from './data/products'
import {
  answer as applyAnswer,
  createQuiz,
  currentImage,
  finishEarly,
  skip as applySkip,
  phase1PerStyle,
  scoreAttributes,
  undo as applyUndo,
  DEFAULT_CONFIG,
  type Answer,
  type QuizState,
  type Verdict,
} from './engine/quiz'
import {
  createInfinite,
  currentImage as infiniteCurrent,
  fromSaved,
  judge as applyJudge,
  setVerdict as applySetVerdict,
  skipCurrent as applySkipCurrent,
  toSaved,
  undo as applyInfiniteUndo,
  type InfiniteState,
  type SavedInfinite,
} from './engine/infinite'
import { createProductDeck, type Affinity, type ProductState } from './engine/products'
import { STYLES } from './data/taxonomy'
import { MARKETS, type MarketId } from './data/product-taxonomy'

type Screen =
  | 'intro'
  | 'quiz'
  | 'results'
  | 'endless'
  | 'history'
  | 'endless-results'
  | 'shop'
  | 'shop-results'

const STORAGE_KEY = 'home-style-chooser/session/v1'
const ENDLESS_KEY = 'home-style-chooser/infinite/v1'
// Keyed by market: prices and product links differ, so an Austrian session and a
// Hungarian one are two shortlists rather than one with mixed currencies in it.
const SHOP_KEY = (market: string) => `home-style-chooser/shop/${market}/v1`
const MARKET_KEY = 'home-style-chooser/shop-market'

/**
 * The deck is snapshotted rather than replayed. Replaying verdicts through a fresh
 * createQuiz only works while the pool is identical, and ignoring a photo changes the
 * pool — so a replay after an ignore would attach your answers to different images.
 */
interface Saved {
  seed: number
  queue: string[]
  cursor: number
  phase: 1 | 2
  answers: Answer[]
  skipped: string[]
  focus: string[]
  done: boolean
}

function save(state: QuizState) {
  try {
    const payload: Saved = {
      seed: state.seed,
      queue: state.queue,
      cursor: state.cursor,
      phase: state.phase,
      answers: state.answers,
      skipped: state.skipped,
      focus: state.focus,
      done: state.done,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Private mode / quota — the quiz still works, it just won't survive a reload.
  }
}

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Saved
    const usable =
      Array.isArray(parsed.answers) && parsed.answers.length > 0 && Array.isArray(parsed.queue)
    return usable ? parsed : null
  } catch {
    return null
  }
}

/**
 * Rebuilds a quiz from the saved snapshot. Returns null if the deck references photos
 * the pool no longer has — which is exactly what happens once an ignored photo is
 * retired — rather than silently resuming onto a different set of images.
 */
function restore(pool: HomeImage[], saved: Saved): QuizState | null {
  const ids = new Set(pool.map((i) => i.id))
  if (!saved.queue.every((id) => ids.has(id))) return null

  return {
    config: DEFAULT_CONFIG,
    pool,
    queue: saved.queue,
    cursor: saved.cursor,
    phase: saved.phase,
    answers: saved.answers,
    skipped: saved.skipped ?? [],
    focus: saved.focus ?? [],
    done: saved.done,
    seed: saved.seed,
  }
}

function saveShop(market: string, state: ProductState) {
  try {
    localStorage.setItem(SHOP_KEY(market), JSON.stringify(toSaved(state)))
  } catch {
    // Private mode / quota — swiping still works, it just won't survive a reload.
  }
}

function readShop(market: string): SavedInfinite | null {
  try {
    const raw = localStorage.getItem(SHOP_KEY(market))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedInfinite
    return Array.isArray(parsed.answers) ? parsed : null
  } catch {
    return null
  }
}

function saveEndless(state: InfiniteState) {
  try {
    localStorage.setItem(ENDLESS_KEY, JSON.stringify(toSaved(state)))
  } catch {
    // Private mode / quota — swiping still works, it just won't survive a reload.
  }
}

function readEndless(): SavedInfinite | null {
  try {
    const raw = localStorage.getItem(ENDLESS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedInfinite
    return Array.isArray(parsed.answers) ? parsed : null
  } catch {
    return null
  }
}

function readMarket(): MarketId {
  try {
    const saved = localStorage.getItem(MARKET_KEY)
    if (saved && MARKETS.some((m) => m.id === saved)) return saved as MarketId
  } catch {
    // Fall through to the default.
  }
  return 'at'
}

export default function App() {
  const [pool, setPool] = useState<HomeImage[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('intro')
  const [quiz, setQuiz] = useState<QuizState | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [endless, setEndless] = useState<InfiniteState | null>(null)
  const [market, setMarket] = useState<MarketId>(readMarket)
  const [shop, setShop] = useState<ProductState | null>(null)
  const [shopError, setShopError] = useState<string | null>(null)
  const [affinity, setAffinity] = useState<Affinity | null>(null)

  useEffect(() => {
    let cancelled = false
    curatedProvider
      .load()
      .then((images) => {
        if (cancelled) return
        setPool(images)
        setSaved(readSaved())
        // Built eagerly so the intro can show the running count, and so opening the mode
        // is instant rather than shuffling 3000 ids on the click.
        const savedEndless = readEndless()
        setEndless(savedEndless ? fromSaved(images, savedEndless) : createInfinite(images))
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (quiz) save(quiz)
  }, [quiz])

  // Every verdict is written straight away — the whole point of the mode is that you can
  // stop mid-swipe and come back next week.
  useEffect(() => {
    if (endless) saveEndless(endless)
  }, [endless])

  useEffect(() => {
    if (shop) saveShop(market, shop)
  }, [shop, market])

  /**
   * Open the product mode for a market, loading the catalog on first use. It is a second
   * megabyte of JSON that most sessions never touch, so it is deliberately *not* fetched
   * alongside the photos — the intro screen should paint at the same speed either way.
   *
   * A finished quiz seeds the order: products carrying adjectives you liked come first.
   * With no quiz, it's a plain shuffle rather than a guess dressed up as personalisation.
   */
  const openShop = useCallback(
    async (next: MarketId = market) => {
      setShopError(null)
      setMarket(next)
      try {
        localStorage.setItem(MARKET_KEY, next)
      } catch {
        // Not worth failing the navigation over.
      }
      setScreen('shop')
      try {
        const [all, structure] = await Promise.all([ikeaProvider.load(next), loadAffinity()])
        setAffinity(structure)
        // Adjectives the finished session actually liked. Both modes share the axis, so
        // "you liked wooden, curved, calm rooms" transfers straight onto objects.
        const source = quiz?.done ? quiz : endless?.answers.length ? endless : null
        const preferred = source
          ? scoreAttributes(source)
              .filter((a) => a.seen >= 2 && a.rate >= 0.55)
              .map((a) => a.tagId)
          : []
        const savedShop = readShop(next)
        const base = createProductDeck(all, undefined, preferred)
        // Keep the affinity-ordered queue even when resuming: `fromSaved` rebuilds a
        // plain shuffle from the seed, and stepping over judged cards means the restored
        // verdicts survive the reorder untouched.
        setShop(savedShop ? { ...fromSaved(all, savedShop), queue: base.queue } : base)
      } catch (err: unknown) {
        setShopError(err instanceof Error ? err.message : String(err))
      }
    },
    [market, quiz, endless],
  )

  const start = useCallback(() => {
    if (!pool) return
    localStorage.removeItem(STORAGE_KEY)
    setQuiz(createQuiz(pool))
    setScreen('quiz')
  }, [pool])

  const resume = useCallback(() => {
    if (!pool || !saved) return
    const restored = restore(pool, saved)
    if (!restored) {
      // The saved deck contains photos that have since been retired — start fresh.
      localStorage.removeItem(STORAGE_KEY)
      setSaved(null)
      start()
      return
    }
    setQuiz(restored)
    setScreen(restored.done ? 'results' : 'quiz')
  }, [pool, saved, start])

  const onAnswer = useCallback((verdict: Verdict) => {
    setQuiz((prev) => {
      if (!prev) return prev
      const next = applyAnswer(prev, verdict)
      if (next.done) setScreen('results')
      return next
    })
  }, [])

  const onUndo = useCallback(() => {
    setQuiz((prev) => (prev ? applyUndo(prev) : prev))
  }, [])

  const onIgnore = useCallback(() => {
    setQuiz((prev) => {
      if (!prev) return prev
      const img = currentImage(prev)
      // Fire-and-forget: the vote is a nicety, dropping the card is the point.
      if (img) void voteIgnore(img.id)
      const next = applySkip(prev)
      if (next.done) setScreen('results')
      return next
    })
  }, [])

  const onFinishEarly = useCallback(() => {
    setQuiz((prev) => {
      if (!prev) return prev
      setScreen('results')
      return finishEarly(prev)
    })
  }, [])

  const onJudge = useCallback((verdict: Verdict) => {
    setEndless((prev) => (prev ? applyJudge(prev, verdict) : prev))
  }, [])

  const onEndlessUndo = useCallback(() => {
    setEndless((prev) => (prev ? applyInfiniteUndo(prev) : prev))
  }, [])

  const onEndlessIgnore = useCallback(() => {
    setEndless((prev) => {
      if (!prev) return prev
      const img = infiniteCurrent(prev)
      // Fire-and-forget: the vote is a nicety, dropping the card is the point.
      if (img) void voteIgnore(img.id)
      return applySkipCurrent(prev)
    })
  }, [])

  const onSetVerdict = useCallback((imageId: string, verdict: Verdict | null) => {
    setEndless((prev) => (prev ? applySetVerdict(prev, imageId, verdict) : prev))
  }, [])

  const onShopJudge = useCallback((verdict: Verdict) => {
    setShop((prev) => (prev ? applyJudge(prev, verdict) : prev))
  }, [])

  const onShopUndo = useCallback(() => {
    setShop((prev) => (prev ? applyInfiniteUndo(prev) : prev))
  }, [])

  // No ignore vote here: there is no bad-photo problem to crowdsource. A product you
  // skip is one you'd rather not rule on, so it is dropped without becoming evidence.
  const onShopSkip = useCallback(() => {
    setShop((prev) => (prev ? applySkipCurrent(prev) : prev))
  }, [])

  const resetShop = useCallback(() => {
    localStorage.removeItem(SHOP_KEY(market))
    setShop(null)
    void openShop(market)
  }, [market, openShop])

  const restart = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setSaved(null)
    setQuiz(null)
    setScreen('intro')
  }, [])

  /**
   * Throw away every endless verdict and reshuffle. A fresh seed, so starting over gives
   * a genuinely different order rather than replaying the same sequence.
   */
  const resetEndless = useCallback(() => {
    if (!pool) return
    localStorage.removeItem(ENDLESS_KEY)
    setEndless(createInfinite(pool))
    setScreen('endless')
  }, [pool])

  if (loadError) {
    return (
      <main className="app app--center">
        <div className="notice">
          <h1>Couldn't load the image catalog</h1>
          <p>{loadError}</p>
          <p className="notice__hint">
            Run <code>npm run harvest</code> to build <code>src/data/catalog.json</code>.
          </p>
        </div>
      </main>
    )
  }

  const availableStyles = pool
    ? STYLES.filter((s) => pool.some((img) => img.styles.includes(s.id))).length
    : 0

  if (!pool) {
    return (
      <main className="app app--center">
        <div className="spinner" aria-label="Loading" />
      </main>
    )
  }

  return (
    <main className="app">
      {screen === 'intro' && (
        <Intro
          imageCount={pool.length}
          styleCount={availableStyles}
          round1Cards={
            availableStyles * phase1PerStyle(DEFAULT_CONFIG, availableStyles) +
            DEFAULT_CONFIG.phase1AttributeCards
          }
          round2Cards={DEFAULT_CONFIG.phase2Focus * DEFAULT_CONFIG.phase2PerStyle}
          onStart={start}
          onResume={saved && !saved.done ? resume : undefined}
          onInfinite={() => setScreen('endless')}
          infiniteJudged={endless?.answers.length ?? 0}
          onShop={(next) => void openShop(next)}
          shopMarket={market}
        />
      )}
      {screen === 'quiz' && quiz && (
        <Deck
          state={quiz}
          onAnswer={onAnswer}
          onUndo={onUndo}
          onIgnore={onIgnore}
          onFinishEarly={onFinishEarly}
        />
      )}
      {screen === 'results' && quiz && <Results state={quiz} onRestart={restart} />}
      {screen === 'endless' && endless && (
        <InfiniteDeck
          state={endless}
          onJudge={onJudge}
          onUndo={onEndlessUndo}
          onIgnore={onEndlessIgnore}
          onHistory={() => setScreen('history')}
          onResults={() => setScreen('endless-results')}
          onExit={() => setScreen('intro')}
        />
      )}
      {screen === 'history' && endless && (
        <History
          state={endless}
          onSetVerdict={onSetVerdict}
          onBack={() => setScreen('endless')}
          onReset={resetEndless}
        />
      )}
      {screen === 'endless-results' && endless && (
        <Results
          state={endless}
          onRestart={() => setScreen('endless')}
          restartLabel="Back to swiping"
        />
      )}
      {screen === 'shop' &&
        (shopError ? (
          <div className="notice">
            <h1>Couldn't load the product catalog</h1>
            <p>{shopError}</p>
            <p className="notice__hint">
              Run <code>npm run harvest-products</code> to build{' '}
              <code>src/data/products.json</code>.
            </p>
            <div className="results__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setScreen('intro')}>
                Home
              </button>
            </div>
          </div>
        ) : shop ? (
          <ProductDeck
            state={shop}
            market={market}
            onJudge={onShopJudge}
            onUndo={onShopUndo}
            onSkip={onShopSkip}
            onResults={() => setScreen('shop-results')}
            onExit={() => setScreen('intro')}
          />
        ) : (
          <div className="spinner" aria-label="Loading" />
        ))}
      {screen === 'shop-results' && shop && (
        <ProductResults
          state={shop}
          market={market}
          affinity={affinity}
          onKeepSwiping={() => setScreen('shop')}
          onRestart={resetShop}
          onExit={() => setScreen('intro')}
        />
      )}
    </main>
  )
}

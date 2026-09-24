import { useCallback, useEffect, useMemo, useState } from 'react'
import ProductCard from './ProductCard'
import { useShowTags } from './useShowTags'
import { currentImage, stats, upcoming } from '../engine/infinite'
import type { Verdict } from '../engine/quiz'
import {
  likedTotal,
  scoreCategories,
  scoreColours,
  scoreMaterials,
  type ProductState,
} from '../engine/products'
import { categoryLabel, colourLabel, materialLabel } from '../data/product-taxonomy'
import { MARKET_BY_ID, formatPrice } from '../data/product-taxonomy'

interface Props {
  state: ProductState
  market: string
  onJudge: (verdict: Verdict) => void
  onUndo: () => void
  onSkip: () => void
  onResults: () => void
  onExit: () => void
}

export default function ProductDeck({
  state,
  market,
  onJudge,
  onUndo,
  onSkip,
  onResults,
  onExit,
}: Props) {
  const [commanded, setCommanded] = useState<Verdict | null>(null)
  const [showTags, toggleTags] = useShowTags()

  const top = currentImage(state)
  const next = useMemo(() => upcoming(state, 2), [state])
  const s = stats(state)

  // The live read. Unlike the endless deck's single "leading style", a product session
  // has no one headline — the useful signal is the pair you're converging on, so show
  // the strongest material and colour together.
  const leader = useMemo(() => {
    const material = scoreMaterials(state)[0] ?? null
    const colour = scoreColours(state)[0] ?? null
    const category = scoreCategories(state)[0] ?? null
    return { material, colour, category }
  }, [state])

  const basket = useMemo(() => likedTotal(state), [state])

  /** Same protocol as the other decks — clear the command in the same update. */
  const handleDecide = useCallback(
    (verdict: Verdict) => {
      setCommanded(null)
      onJudge(verdict)
    },
    [onJudge],
  )

  useEffect(() => {
    next.forEach((p) => {
      const pre = new Image()
      pre.src = p.image
    })
  }, [next])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCommanded('like')
      else if (e.key === 'ArrowLeft') setCommanded('dislike')
      else if (e.key === 'Backspace') onUndo()
      else if (e.key === 'x' || e.key === 'X') onSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onUndo, onSkip])

  if (!top) {
    return (
      <section className="deck-screen deck-screen--done">
        <div className="notice">
          <h1>That's the whole range</h1>
          <p>
            {s.judged} products judged, {s.liked} saved. Nothing left until the next harvest.
          </p>
          <div className="results__actions">
            <button type="button" className="btn btn--primary" onClick={onResults}>
              See your list
            </button>
            <button type="button" className="btn btn--ghost" onClick={onExit}>
              Home
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="deck-screen">
      <header className="deck-header">
        <div className="deck-header__row">
          <span className="phase-chip phase-chip--endless">
            IKEA {MARKET_BY_ID.get(market)?.label ?? market}
          </span>
          <span className="deck-header__right">
            <button
              type="button"
              className={`tagtoggle${showTags ? ' tagtoggle--on' : ''}`}
              onClick={toggleTags}
              aria-pressed={showTags}
              title="Showing tags biases your answers — turn off for a clean run"
            >
              tags
            </button>
            <span className="deck-header__count">
              {s.liked} saved · {s.remaining} left
            </span>
          </span>
        </div>
        <p className="deck-header__leader">
          {leader.material || leader.colour ? (
            <>
              Leaning{' '}
              <strong>
                {[
                  leader.colour && colourLabel(leader.colour.tagId),
                  leader.material && materialLabel(leader.material.tagId).toLowerCase(),
                ]
                  .filter(Boolean)
                  .join(' ')}
              </strong>{' '}
              <span className="deck-header__muted">
                {leader.category ? `· best on ${categoryLabel(leader.category.tagId)} ` : ''}
                {basket.length > 0 &&
                  `· basket ${basket
                    .map((t) => formatPrice({ amount: t.amount, currency: t.currency }))
                    .join(' + ')}`}
              </span>
            </>
          ) : (
            <span className="deck-header__muted">
              Swipe a few and your palette will show up here.
            </span>
          )}
        </p>
      </header>

      <div className="stack">
        {[...next].reverse().map((p, i) => (
          <ProductCard
            key={p.id}
            product={p}
            interactive={false}
            depth={next.length - i}
            onDecide={() => {}}
            commanded={null}
            showTags={showTags}
          />
        ))}
        <ProductCard
          key={top.id}
          product={top}
          interactive
          depth={0}
          onDecide={handleDecide}
          commanded={commanded}
          showTags={showTags}
        />
      </div>

      <div className="controls">
        <button
          type="button"
          className="btn btn--round btn--nope"
          onClick={() => setCommanded('dislike')}
          aria-label="Not for me"
        >
          ✕
        </button>
        <div className="controls__middle">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onUndo}
            disabled={s.judged === 0}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small btn--ignore"
            onClick={onSkip}
            title="Skip without judging (x)"
          >
            Skip
          </button>
        </div>
        <button
          type="button"
          className="btn btn--round btn--like"
          onClick={() => setCommanded('like')}
          aria-label="Love it"
        >
          ♥
        </button>
      </div>

      <p className="deck-footer">
        Saved as you go.{' '}
        <button type="button" className="linkish" onClick={onResults}>
          Your list
        </button>{' '}
        ·{' '}
        <button type="button" className="linkish" onClick={onExit}>
          Home
        </button>
      </p>
    </section>
  )
}

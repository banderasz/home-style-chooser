import { useCallback, useEffect, useMemo, useState } from 'react'
import ProductCard from './ProductCard'
import { useShowTags } from './useShowTags'
import { currentImage, stats, upcoming } from '../engine/infinite'
import type { Verdict } from '../engine/quiz'
import { likedTotal, type ProductState } from '../engine/products'
import { MARKET_BY_ID, formatPrice } from '../data/product-taxonomy'

interface Props {
  state: ProductState
  market: string
  onJudge: (verdict: Verdict) => void
  onUndo: () => void
  onSkip: () => void
  onHistory: () => void
  onResults: () => void
  onExit: () => void
}

export default function ProductDeck({
  state,
  market,
  onJudge,
  onUndo,
  onSkip,
  onHistory,
  onResults,
  onExit,
}: Props) {
  const [commanded, setCommanded] = useState<Verdict | null>(null)
  const [showTags, toggleTags] = useShowTags()

  const top = currentImage(state)
  const next = useMemo(() => upcoming(state, 2), [state])
  const s = stats(state)

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
            <button type="button" className="btn btn--ghost" onClick={onHistory}>
              Review everything
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
        {/* A running tally, not a prediction. An earlier version showed a live "leaning
            beige solid wood" here, which read as the app making up its mind about you
            mid-session — and it changed on almost every swipe, so it was noise pretending
            to be insight. The numbers below are just what has happened. */}
        <p className="deck-header__leader">
          {s.judged > 0 ? (
            <span className="deck-header__muted">
              {s.liked} saved of {s.judged} judged ({Math.round(s.likeRate * 100)}%)
              {basket.length > 0 &&
                ` · basket ${basket
                  .map((t) => formatPrice({ amount: t.amount, currency: t.currency }))
                  .join(' + ')}`}
              {' · '}
              <button type="button" className="linkish" onClick={onHistory}>
                history
              </button>
            </span>
          ) : (
            <span className="deck-header__muted">
              Swipe right on anything you'd actually put in your home.
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
        <button type="button" className="linkish" onClick={onHistory}>
          History
        </button>{' '}
        ·{' '}
        <button type="button" className="linkish" onClick={onExit}>
          Home
        </button>
      </p>
    </section>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import SwipeCard from './SwipeCard'
import { useShowTags } from './useShowTags'
import { currentImage, stats, upcoming, type InfiniteState } from '../engine/infinite'
import { scoreStyles, type Verdict } from '../engine/quiz'
import { styleLabel } from '../data/taxonomy'

interface Props {
  state: InfiniteState
  onJudge: (verdict: Verdict) => void
  onUndo: () => void
  onIgnore: () => void
  onHistory: () => void
  onResults: () => void
  onExit: () => void
}

export default function InfiniteDeck({
  state,
  onJudge,
  onUndo,
  onIgnore,
  onHistory,
  onResults,
  onExit,
}: Props) {
  const [commanded, setCommanded] = useState<Verdict | null>(null)
  const [showTags, toggleTags] = useShowTags()

  const top = currentImage(state)
  const next = useMemo(() => upcoming(state, 2), [state])
  const s = stats(state)

  // The live read. Recomputed on every swipe, which is the point of the mode — the
  // scoring index is cached per pool so this stays cheap (see quiz.ts `indexOf`).
  const leader = useMemo(() => {
    const seen = scoreStyles(state).filter((x) => x.seen > 0)
    return seen[0] ?? null
  }, [state])

  /**
   * Same protocol as Deck: clear the command in the *same* update as the answer, never in
   * an effect. React runs child effects before parent effects, so an effect here would
   * leave the next card — a reused instance promoted from the stack — to see the stale
   * command and record an answer for a card nobody saw.
   */
  const handleDecide = useCallback(
    (verdict: Verdict) => {
      setCommanded(null)
      onJudge(verdict)
    },
    [onJudge],
  )

  useEffect(() => {
    next.forEach((img) => {
      const pre = new Image()
      pre.src = img.url
    })
  }, [next])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCommanded('like')
      else if (e.key === 'ArrowLeft') setCommanded('dislike')
      else if (e.key === 'Backspace') onUndo()
      else if (e.key === 'x' || e.key === 'X') onIgnore()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onUndo, onIgnore])

  // The catalog is finite, so say so plainly rather than looping photos silently.
  if (!top) {
    return (
      <section className="deck-screen deck-screen--done">
        <div className="notice">
          <h1>That's the whole catalog</h1>
          <p>
            {s.judged} photos judged, {s.skipped} skipped. Nothing left to show until the next
            harvest.
          </p>
          <div className="results__actions">
            <button type="button" className="btn btn--primary" onClick={onResults}>
              See the result
            </button>
            <button type="button" className="btn btn--ghost" onClick={onHistory}>
              Review everything
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
          <span className="phase-chip phase-chip--endless">Endless</span>
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
              {s.judged} judged · {s.remaining} left
            </span>
          </span>
        </div>
        <p className="deck-header__leader">
          {leader ? (
            <>
              Leading: <strong>{styleLabel(leader.styleId)}</strong>{' '}
              <span className="deck-header__muted">
                {Math.round(leader.rate * 100)}%
                {leader.confidence < 0.5 ? ' · still thin' : ''} · you like{' '}
                {Math.round(s.likeRate * 100)}% of what you see
              </span>
            </>
          ) : (
            <span className="deck-header__muted">Swipe a few and a leader will show up here.</span>
          )}
        </p>
      </header>

      <div className="stack">
        {[...next].reverse().map((img, i) => (
          <SwipeCard
            key={img.id}
            image={img}
            interactive={false}
            depth={next.length - i}
            onDecide={() => {}}
            commanded={null}
            showTags={showTags}
          />
        ))}
        <SwipeCard
          key={top.id}
          image={top}
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
            onClick={onIgnore}
            title="Not a usable photo — skip it and flag it (x)"
          >
            Ignore
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
        Saved as you go — close the tab and come back whenever.{' '}
        <button type="button" className="linkish" onClick={onHistory}>
          History
        </button>{' '}
        ·{' '}
        <button type="button" className="linkish" onClick={onResults}>
          Full result
        </button>{' '}
        ·{' '}
        <button type="button" className="linkish" onClick={onExit}>
          Home
        </button>
      </p>
    </section>
  )
}

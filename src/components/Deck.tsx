import { useCallback, useEffect, useMemo, useState } from 'react'
import SwipeCard from './SwipeCard'
import {
  currentImage,
  progress,
  upcomingImages,
  type QuizState,
  type Verdict,
} from '../engine/quiz'
import { styleLabel } from '../data/taxonomy'

interface Props {
  state: QuizState
  onAnswer: (verdict: Verdict) => void
  onUndo: () => void
  onIgnore: () => void
  onFinishEarly: () => void
}

const TAGS_KEY = 'home-style-chooser/show-tags'

export default function Deck({ state, onAnswer, onUndo, onIgnore, onFinishEarly }: Props) {
  const [commanded, setCommanded] = useState<Verdict | null>(null)
  const [showTags, setShowTags] = useState(() => {
    try {
      // Default off: seeing "Art Deco" before you swipe means partly rating the label.
      // Turn it on when you want to check how the catalog is tagged.
      return localStorage.getItem(TAGS_KEY) === 'on'
    } catch {
      return false
    }
  })

  const toggleTags = useCallback(() => {
    setShowTags((on) => {
      try {
        localStorage.setItem(TAGS_KEY, on ? 'off' : 'on')
      } catch {
        // Private mode — the toggle just won't persist.
      }
      return !on
    })
  }, [])
  const top = currentImage(state)
  const next = useMemo(() => upcomingImages(state, 2), [state])
  const p = progress(state)

  /**
   * Clearing the command must happen in the same update as the answer, not in an effect
   * keyed on the cursor. React runs child effects before parent effects, so an effect
   * here would leave the *next* card — a reused instance promoted from the stack — to
   * see the stale command, fly away on its own, and record an answer for a card the user
   * never saw.
   */
  const handleDecide = useCallback(
    (verdict: Verdict) => {
      setCommanded(null)
      onAnswer(verdict)
    },
    [onAnswer],
  )

  // Warm the next two images so the stack never flashes empty.
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

  if (!top) return null

  const canUndo =
    state.answers.length > 0 && state.answers[state.answers.length - 1].phase === state.phase

  return (
    <section className="deck-screen">
      <header className="deck-header">
        <div className="deck-header__row">
          <span className={`phase-chip phase-chip--${p.phase}`}>
            {p.phase === 1 ? 'Round 1 · finding your taste' : 'Round 2 · narrowing it down'}
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
              {p.phaseAnswered + 1} / {p.phaseTotal}
            </span>
          </span>
        </div>
        <div className="progress">
          <div className="progress__bar" style={{ width: `${(p.answered / p.total) * 100}%` }} />
        </div>
        {p.phase === 2 && state.focus.length > 0 && (
          <p className="deck-header__focus">
            Digging into {state.focus.slice(0, 3).map(styleLabel).join(', ')}
            {state.focus.length > 3 ? ' and one more' : ''}
          </p>
        )}
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
            disabled={!canUndo}
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
        Swipe, tap, or use ← →. <strong>Ignore</strong> (x) drops a bad photo without
        counting it.
        {state.answers.length >= 10 && (
          <>
            {' '}
            <button type="button" className="linkish" onClick={onFinishEarly}>
              Show my results now
            </button>
          </>
        )}
      </p>
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { history, stats, type InfiniteState } from '../engine/infinite'
import { styleLabel } from '../data/taxonomy'
import type { Verdict } from '../engine/quiz'

interface Props {
  state: InfiniteState
  onSetVerdict: (imageId: string, verdict: Verdict | null) => void
  onBack: () => void
  /** Throws away every verdict and reshuffles. Gated behind a confirm. */
  onReset: () => void
}

type Filter = 'all' | 'like' | 'dislike'

/**
 * Tapping a tile cycles the verdict. Clearing it is a real option, not an afterthought:
 * "I shouldn't have judged this one" is different from "I disliked it", and only the
 * former should stop counting as evidence.
 */
const NEXT_VERDICT: Record<Verdict, Verdict | null> = {
  like: 'dislike',
  dislike: null,
}

export default function History({ state, onSetVerdict, onBack, onReset }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmReset, setConfirmReset] = useState(false)
  const all = useMemo(() => history(state), [state])
  const s = stats(state)

  // Arming the reset and then wandering off shouldn't leave a live trigger sitting there
  // for the next tap. Disarm after a few seconds.
  useEffect(() => {
    if (!confirmReset) return
    const t = window.setTimeout(() => setConfirmReset(false), 5000)
    return () => window.clearTimeout(t)
  }, [confirmReset])

  const shown = filter === 'all' ? all : all.filter((h) => h.verdict === filter)

  return (
    <section className="history">
      <header className="history__head">
        <p className="eyebrow">Everything you've judged</p>
        <h1>{s.judged} photos</h1>
        <p className="history__lead">
          Tap a photo to change your mind: liked → not for me → unjudged. Clearing one drops
          it from the ranking and puts it back in the deck.
        </p>
      </header>

      <ul className="chips history__filters">
        {(
          [
            ['all', `All ${s.judged}`],
            ['like', `Liked ${s.liked}`],
            ['dislike', `Not for me ${s.judged - s.liked}`],
          ] as const
        ).map(([id, label]) => (
          <li key={id}>
            <button
              type="button"
              className={`chip chip--button${filter === id ? ' chip--on' : ''}`}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>

      {shown.length === 0 ? (
        <p className="aside aside--muted">Nothing here yet.</p>
      ) : (
        <div className="gallery gallery--editable">
          {shown.map(({ image, verdict }) => (
            <button
              type="button"
              key={image.id}
              className={`gallery__item gallery__item--${verdict}`}
              onClick={() => onSetVerdict(image.id, NEXT_VERDICT[verdict])}
              title={`${image.title} — tap to change`}
            >
              <img src={image.thumbnail} alt={image.title} loading="lazy" />
              <span className="gallery__verdict" aria-hidden="true">
                {verdict === 'like' ? '♥' : '✕'}
              </span>
              <span className="gallery__tag">
                {image.styles.length > 0 ? styleLabel(image.styles[0]) : 'untagged'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="results__actions">
        <button type="button" className="btn btn--primary" onClick={onBack}>
          Back to swiping
        </button>
      </div>

      {s.judged > 0 && (
        <p className="history__reset">
          {confirmReset ? (
            <>
              <button type="button" className="linkish linkish--warn" onClick={onReset}>
                Yes, delete all {s.judged} verdicts
              </button>{' '}
              ·{' '}
              <button type="button" className="linkish" onClick={() => setConfirmReset(false)}>
                keep them
              </button>
            </>
          ) : (
            <button type="button" className="linkish" onClick={() => setConfirmReset(true)}>
              Start endless mode over
            </button>
          )}
        </p>
      )}
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { productHistory, summary, type ProductState } from '../engine/products'
import { categoryLabel, formatPrice } from '../data/product-taxonomy'
import type { Verdict } from '../engine/quiz'

interface Props {
  state: ProductState
  onSetVerdict: (productId: string, verdict: Verdict | null) => void
  /** Return a skipped product to the deck. */
  onUnskip: (productId: string) => void
  onUnskipAll: () => void
  onBack: () => void
  /** Throws away every verdict and reshuffles. Gated behind a confirm. */
  onReset: () => void
}

type Filter = 'all' | 'like' | 'dislike' | 'skipped'

/** Tapping a tile cycles the verdict, same as the photo history. */
const NEXT_VERDICT: Record<Verdict, Verdict | null> = {
  like: 'dislike',
  dislike: null,
}

export default function ProductHistory({
  state,
  onSetVerdict,
  onUnskip,
  onUnskipAll,
  onBack,
  onReset,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmReset, setConfirmReset] = useState(false)
  const all = useMemo(() => productHistory(state), [state])
  const s = useMemo(() => summary(state), [state])

  // Arming the reset and then wandering off shouldn't leave a live trigger sitting there.
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
        <h1>{s.judged} products</h1>
        <p className="history__lead">
          Tap to change your mind: saved → not for me → unjudged. Clearing one drops it from
          the statistics and puts it back in the deck. Skipped products can be restored.
        </p>
      </header>

      <ul className="chips history__filters">
        {(
          [
            ['all', `All ${all.length}`],
            ['like', `Saved ${s.liked}`],
            ['dislike', `Not for me ${s.judged - s.liked}`],
            ['skipped', `Skipped ${s.skipped}`],
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

      {s.skipped > 0 && (
        <p className="aside">
          <button type="button" className="linkish" onClick={onUnskipAll}>
            Restore all {s.skipped} skipped products
          </button>{' '}
          — they go back in the deck, unjudged.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="aside aside--muted">Nothing here yet.</p>
      ) : (
        <div className="gallery gallery--editable">
          {shown.map(({ product, verdict }) => (
            <button
              type="button"
              key={product.id}
              className={`gallery__item gallery__item--${verdict}`}
              onClick={() =>
                verdict === 'skipped'
                  ? onUnskip(product.id)
                  : onSetVerdict(product.id, NEXT_VERDICT[verdict])
              }
              title={
                verdict === 'skipped'
                  ? `${product.name} — tap to put it back in the deck`
                  : `${product.name} ${product.typeLabel} — tap to change`
              }
            >
              {/* The cutout, not the styled room shot: at thumbnail size a room is an
                  unreadable smudge, whereas a product on white still reads. */}
              <img src={product.cutout ?? product.image} alt={product.name} loading="lazy" />
              <span className="gallery__verdict" aria-hidden="true">
                {verdict === 'like' ? '♥' : verdict === 'dislike' ? '✕' : '↺'}
              </span>
              <span className="gallery__tag">
                {categoryLabel(product.categories[0])}
                {product.price && ` · ${formatPrice(product.price)}`}
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
              Start shopping mode over
            </button>
          )}
        </p>
      )}
    </section>
  )
}

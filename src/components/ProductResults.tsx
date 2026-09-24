import { useMemo, useState } from 'react'
import {
  likedProducts,
  likedTotal,
  scoreTones,
  summary,
  type TagBreakdown,
  type ProductState,
} from '../engine/products'
import { COLOUR_BY_ID, MARKET_BY_ID, categoryLabel, colourLabel, formatPrice } from '../data/product-taxonomy'

interface Props {
  state: ProductState
  market: string
  onKeepSwiping: () => void
  onHistory: () => void
  onRestart: () => void
  onExit: () => void
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/** Same reasoning as the photo gallery: a long session can like hundreds of things. */
const LIST_LIMIT = 40

const TONE_COPY: Record<string, string> = {
  warm: 'warm tones',
  cool: 'cool tones',
  neutral: 'neutrals',
}

/**
 * A tag's row in the statistics tables: the raw counts, and a bar split into the share
 * you liked. Sorted by how often you saw it, not by rate — a tag seen twice at 100%
 * should not sit above one seen forty times at 70%, and putting the counts on screen is
 * a more honest way to say that than quietly reordering them.
 */
function TagTable({ rows, swatches = false }: { rows: TagBreakdown[]; swatches?: boolean }) {
  if (rows.length === 0) return null
  return (
    <ul className="tagstats">
      {rows.map((r) => (
        <li key={r.tagId} className="tagstat">
          <span className="tagstat__label">
            {swatches && (
              <i className="swatch" style={{ background: COLOUR_BY_ID.get(r.tagId)?.hex }} />
            )}
            {r.label}
          </span>
          <span className="tagstat__track" title={`${r.liked} liked of ${r.seen} seen`}>
            <span className="tagstat__fill" style={{ width: pct(r.rate) }} />
          </span>
          <span className="tagstat__count">
            {r.liked}/{r.seen}
          </span>
          <span className="tagstat__pct">{pct(r.rate)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function ProductResults({
  state,
  market,
  onKeepSwiping,
  onHistory,
  onRestart,
  onExit,
}: Props) {
  const [showAll, setShowAll] = useState(false)

  const liked = useMemo(() => likedProducts(state), [state])
  const totals = useMemo(() => likedTotal(state), [state])
  const s = useMemo(() => summary(state), [state])
  const tones = useMemo(() => scoreTones(state), [state])

  const tone = tones.find((t) => t.seen >= 3) ?? null
  // Newest first, since the tail is what you were just looking at.
  const shown = showAll ? [...liked].reverse() : [...liked].reverse().slice(0, LIST_LIMIT)

  const copyToClipboard = () => {
    const lines = [
      `My IKEA ${MARKET_BY_ID.get(market)?.label ?? market} shortlist`,
      '',
      ...liked.map((p) => `${p.name} ${p.typeLabel} — ${formatPrice(p.price)}\n  ${p.url}`),
      '',
      totals.length
        ? `Total: ${totals
            .map((t) => formatPrice({ amount: t.amount, currency: t.currency }))
            .join(' + ')}`
        : '',
    ].filter(Boolean)
    void navigator.clipboard?.writeText(lines.join('\n'))
  }

  if (s.judged === 0) {
    return (
      <section className="results">
        <div className="notice">
          <h1>Nothing judged yet</h1>
          <p>Swipe a few products and the numbers will show up here.</p>
          <div className="results__actions">
            <button type="button" className="btn btn--primary" onClick={onKeepSwiping}>
              Start swiping
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
    <section className="results">
      <header className="results__hero">
        <p className="eyebrow">Your shortlist</p>
        <h1>
          {liked.length} {liked.length === 1 ? 'thing' : 'things'} you'd buy
        </h1>
        <p className="results__summary">
          {totals.length > 0 && (
            <>
              {totals
                .map((t) => formatPrice({ amount: t.amount, currency: t.currency }))
                .join(' + ')}{' '}
              all in, from IKEA {MARKET_BY_ID.get(market)?.label ?? market}.{' '}
            </>
          )}
          You said yes to {pct(s.likeRate)} of the {s.judged} you looked at
          {tone && (
            <>
              , and you lean <strong>{TONE_COPY[tone.tone] ?? tone.tone}</strong>
            </>
          )}
          .
        </p>
      </header>

      {liked.length > 0 && (
        <>
          <h2 className="section-title">The list</h2>
          <ul className="shoplist">
            {shown.map((p) => (
              <li key={p.id} className="shoplist__item">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shoplist__link"
                >
                  <img className="shoplist__thumb" src={p.cutout ?? p.image} alt="" loading="lazy" />
                  <span className="shoplist__body">
                    <span className="shoplist__name">
                      {p.name} <span className="card__type">{p.typeLabel}</span>
                    </span>
                    <span className="shoplist__meta">
                      {p.categories.map(categoryLabel).join(', ')}
                      {p.colours.length > 0 && ` · ${p.colours.map(colourLabel).join('/')}`}
                    </span>
                  </span>
                  <span className="shoplist__price">{formatPrice(p.price)}</span>
                </a>
              </li>
            ))}
          </ul>
          {!showAll && liked.length > LIST_LIMIT && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setShowAll(true)}
            >
              Show all {liked.length}
            </button>
          )}
        </>
      )}

      {/* Everything below is the same question asked four ways: of the things carrying
          this tag that you were shown, how many did you keep? */}
      <h2 className="section-title">Colours</h2>
      <TagTable rows={s.colours} swatches />

      <h2 className="section-title">Materials</h2>
      <TagTable rows={s.materials} />

      <h2 className="section-title">Categories</h2>
      <TagTable rows={s.categories} />

      {s.attributes.length > 0 && (
        <>
          <h2 className="section-title">Adjectives</h2>
          <p className="aside aside--muted">
            Only about 40% of the catalog carries these — IKEA's own data covers colour and
            material far better than it describes how a thing looks.
          </p>
          <TagTable rows={s.attributes} />
        </>
      )}

      <p className="results__caveat">
        {s.judged} judged · {s.liked} saved · {s.skipped} skipped. Prices were correct at the
        last harvest — check the product page before you buy.
      </p>

      <div className="results__actions">
        <button type="button" className="btn btn--primary" onClick={onKeepSwiping}>
          Keep swiping
        </button>
        <button type="button" className="btn btn--ghost" onClick={onHistory}>
          History
        </button>
        <button type="button" className="btn btn--ghost" onClick={copyToClipboard}>
          Copy list
        </button>
        <button type="button" className="btn btn--ghost" onClick={onRestart}>
          Start over
        </button>
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          Home
        </button>
      </div>
    </section>
  )
}

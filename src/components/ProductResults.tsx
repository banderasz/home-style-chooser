import { useMemo, useState } from 'react'
import {
  likedProducts,
  likedTotal,
  recommend,
  scoreCategories,
  scoreColours,
  scoreMaterials,
  scoreProductAttributes,
  scoreTones,
  type Affinity,
  type ProductState,
} from '../engine/products'
import { attributeLabel, ATTRIBUTE_BY_ID } from '../data/taxonomy'
import {
  COLOUR_BY_ID,
  MARKET_BY_ID,
  categoryLabel,
  colourLabel,
  formatPrice,
  materialLabel,
} from '../data/product-taxonomy'

interface Props {
  state: ProductState
  market: string
  /** Catalog co-occurrence structure. Null until loaded, or if never generated. */
  affinity: Affinity | null
  onKeepSwiping: () => void
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

export default function ProductResults({
  state,
  market,
  affinity,
  onKeepSwiping,
  onRestart,
  onExit,
}: Props) {
  const [showAll, setShowAll] = useState(false)

  const liked = useMemo(() => likedProducts(state), [state])
  const totals = useMemo(() => likedTotal(state), [state])
  const categories = useMemo(() => scoreCategories(state), [state])
  const materials = useMemo(() => scoreMaterials(state), [state])
  const colours = useMemo(() => scoreColours(state), [state])
  const attributes = useMemo(() => scoreProductAttributes(state), [state])
  const tones = useMemo(() => scoreTones(state), [state])

  const lovedMaterials = materials.filter((m) => m.rate >= 0.5).slice(0, 5)
  const lovedColours = colours.filter((c) => c.rate >= 0.5).slice(0, 6)
  const rejectedColours = [...colours].reverse().filter((c) => c.rate <= 0.35).slice(0, 4)
  const lovedAttrs = attributes.filter((a) => a.rate >= 0.55).slice(0, 8)
  const hatedAttrs = [...attributes].reverse().filter((a) => a.rate <= 0.4).slice(0, 5)

  // "Curved, not geometric" reads better than two lists, where the pairing exists.
  const contrasts = lovedAttrs
    .map((a) => {
      const opposite = ATTRIBUTE_BY_ID.get(a.tagId)?.opposite
      const against = opposite && hatedAttrs.find((h) => h.tagId === opposite)
      return against ? { liked: a.tagId, rejected: against.tagId } : null
    })
    .filter((c): c is { liked: string; rejected: string } => c !== null)
    .slice(0, 3)

  // A category you liked four of five of is a signal; one you saw twice is not.
  const strongCategories = categories.filter((c) => c.seen >= 3)
  const bestCategories = strongCategories.slice(0, 5)
  const worstCategories = [...strongCategories].reverse().filter((c) => c.rate < 0.4).slice(0, 3)

  const tone = tones.find((t) => t.seen >= 3) ?? null
  // Needs a few verdicts before it is anything but a shuffle with extra steps.
  const picks = useMemo(
    () => (state.answers.length >= 8 ? recommend(state, affinity, 9) : []),
    [state, affinity],
  )
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

  if (liked.length === 0) {
    return (
      <section className="results">
        <div className="notice">
          <h1>Nothing saved yet</h1>
          <p>Swipe right on something you'd actually put in your home and it'll land here.</p>
          <div className="results__actions">
            <button type="button" className="btn btn--primary" onClick={onKeepSwiping}>
              Keep swiping
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
        {totals.length > 0 && (
          <p className="results__summary">
            {totals
              .map((t) => formatPrice({ amount: t.amount, currency: t.currency }))
              .join(' + ')}{' '}
            all in, from IKEA {MARKET_BY_ID.get(market)?.label ?? market}.
          </p>
        )}
      </header>

      {/* The list leads. Everything below it is explanation; this is the deliverable. */}
      <h2 className="section-title">The list</h2>
      <ul className="shoplist">
        {shown.map((p) => (
          <li key={p.id} className="shoplist__item">
            <a href={p.url} target="_blank" rel="noreferrer noopener" className="shoplist__link">
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

      {picks.length > 0 && (
        <>
          <h2 className="section-title">You haven't seen these yet</h2>
          <p className="aside aside--muted">
            Scored from what you've already said yes and no to, then spread across
            categories so it isn't nine variations of the same thing.
          </p>
          <ul className="shoplist">
            {picks.map(({ product: p, reasons }) => (
              <li key={p.id} className="shoplist__item">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shoplist__link"
                >
                  <img
                    className="shoplist__thumb"
                    src={p.cutout ?? p.image}
                    alt=""
                    loading="lazy"
                  />
                  <span className="shoplist__body">
                    <span className="shoplist__name">
                      {p.name} <span className="card__type">{p.typeLabel}</span>
                    </span>
                    <span className="shoplist__meta">
                      {reasons.length > 0
                        ? `because you liked ${reasons
                            .map((r) =>
                              r.axis === 'categories'
                                ? categoryLabel(r.tag).toLowerCase()
                                : r.axis === 'colours'
                                  ? colourLabel(r.tag).toLowerCase()
                                  : r.axis === 'materials'
                                    ? materialLabel(r.tag).toLowerCase()
                                    : attributeLabel(r.tag).toLowerCase(),
                            )
                            .join(', ')}`
                        : categoryLabel(p.categories[0])}
                    </span>
                  </span>
                  <span className="shoplist__price">{formatPrice(p.price)}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {(lovedColours.length > 0 || tone) && (
        <>
          <h2 className="section-title">Your palette</h2>
          {tone && (
            <p className="aside">
              You go for <strong>{TONE_COPY[tone.tone] ?? tone.tone}</strong> — {pct(tone.rate)} of
              them got a yes.
            </p>
          )}
          <ul className="chips">
            {lovedColours.map((c) => (
              <li key={c.tagId} className="chip">
                <i className="swatch" style={{ background: COLOUR_BY_ID.get(c.tagId)?.hex }} />
                {colourLabel(c.tagId)} <span>{pct(c.rate)}</span>
              </li>
            ))}
          </ul>
          {rejectedColours.length > 0 && (
            <p className="aside aside--muted">
              Not your colours: {rejectedColours.map((c) => colourLabel(c.tagId)).join(', ')}.
            </p>
          )}
        </>
      )}

      {lovedMaterials.length > 0 && (
        <>
          <h2 className="section-title">Materials you reach for</h2>
          <ul className="chips">
            {lovedMaterials.map((m) => (
              <li key={m.tagId} className="chip">
                {materialLabel(m.tagId)} <span>{pct(m.rate)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {lovedAttrs.length > 0 && (
        <>
          <h2 className="section-title">How you like things to look</h2>
          {contrasts.length > 0 && (
            <p className="aside">
              {contrasts.map((c, i) => (
                <span key={c.liked}>
                  {i > 0 && ' · '}
                  <strong>{attributeLabel(c.liked)}</strong>, not{' '}
                  {attributeLabel(c.rejected).toLowerCase()}
                </span>
              ))}
            </p>
          )}
          <ul className="chips">
            {lovedAttrs.map((a) => (
              <li key={a.tagId} className="chip">
                {attributeLabel(a.tagId)} <span>{pct(a.rate)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {bestCategories.length > 0 && (
        <>
          <h2 className="section-title">What you said yes to most</h2>
          <ol className="score-list">
            {bestCategories.map((c, i) => (
              <li key={c.tagId} className={i < 3 ? 'score score--top' : 'score'}>
                <div className="score__head">
                  <span className="score__rank">{i + 1}</span>
                  <span className="score__label">{categoryLabel(c.tagId)}</span>
                  <span className="score__value">{pct(c.rate)}</span>
                </div>
                <div className="meter">
                  <div className="meter__fill" style={{ width: pct(c.rate) }} />
                </div>
                <p className="score__detail">
                  {Math.round(c.liked * 10) / 10} of {Math.round(c.seen * 10) / 10} liked
                  {c.confidence < 0.4 ? ' · low confidence' : ''}
                </p>
              </li>
            ))}
          </ol>
          {worstCategories.length > 0 && (
            <p className="aside aside--muted">
              Hard to please on: {worstCategories.map((c) => categoryLabel(c.tagId)).join(', ')}.
            </p>
          )}
        </>
      )}

      <p className="results__caveat">
        {state.answers.length} judged · {liked.length} saved · {state.skipped.length} skipped.
        Prices were correct at the last harvest — check the product page before you buy.
      </p>

      <div className="results__actions">
        <button type="button" className="btn btn--primary" onClick={onKeepSwiping}>
          Keep swiping
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

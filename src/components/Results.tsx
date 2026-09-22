import { useMemo, useState } from 'react'
import {
  likedImages,
  scoreAttributes,
  scoreRooms,
  scoreStyles,
  type Scored,
} from '../engine/quiz'
import {
  ATTRIBUTE_BY_ID,
  STYLE_BY_ID,
  attributeLabel,
  roomLabel,
  styleLabel,
} from '../data/taxonomy'

interface Props {
  /** Any session the scorer understands — the two-round quiz or the endless deck. */
  state: Scored
  onRestart: () => void
  /** Label for the primary action; the endless deck goes back to swiping, not to zero. */
  restartLabel?: string
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * The gallery renders one thumbnail per liked photo. Fine for a 47-card quiz; in endless
 * mode it reaches four figures, so it opens on the most recent and expands on request
 * rather than putting a thousand images in the DOM before you've asked for them.
 */
const GALLERY_LIMIT = 60

export default function Results({ state, onRestart, restartLabel = 'Start over' }: Props) {
  const [showAllLiked, setShowAllLiked] = useState(false)
  const styles = useMemo(() => scoreStyles(state), [state])
  const rooms = useMemo(() => scoreRooms(state), [state])
  const liked = useMemo(() => likedImages(state), [state])
  const attributes = useMemo(() => scoreAttributes(state), [state])

  // Adjectives need about two cards' worth of evidence before they're worth a verdict.
  const solid = attributes.filter((a) => a.seen >= 1)
  const lovedAttrs = solid.filter((a) => a.rate >= 0.55).slice(0, 8)
  const hatedAttrs = [...solid].reverse().filter((a) => a.rate <= 0.4).slice(0, 6)

  // "Bright, not dark" reads better than two separate lists, where the pairing exists.
  const contrasts = lovedAttrs
    .map((a) => {
      const opposite = ATTRIBUTE_BY_ID.get(a.tagId)?.opposite
      const against = opposite && hatedAttrs.find((h) => h.tagId === opposite)
      return against ? { liked: a.tagId, rejected: against.tagId } : null
    })
    .filter((c): c is { liked: string; rejected: string } => c !== null)
    .slice(0, 3)

  // Only rank styles the quiz actually showed — an unseen style has a prior, not a verdict.
  const seen = styles.filter((s) => s.seen > 0)
  const winners = seen.slice(0, 3)
  const alsoLiked = seen.slice(3, 6).filter((s) => s.rate >= 0.5)
  const rejected = [...seen].reverse().slice(0, 3).filter((s) => s.rate < 0.45)

  const champion = winners[0]
  const championStyle = champion ? STYLE_BY_ID.get(champion.styleId) : undefined
  const likeRate = state.answers.length
    ? state.answers.filter((a) => a.verdict === 'like').length / state.answers.length
    : 0

  const summary = championStyle
    ? `${championStyle.label} — ${championStyle.blurb}`
    : 'Not enough answers to call it yet.'

  const copyToClipboard = () => {
    const lines = [
      'My home style results',
      '',
      ...winners.map((s, i) => `${i + 1}. ${styleLabel(s.styleId)} — ${pct(s.rate)} match`),
      '',
      lovedAttrs.length
        ? `Drawn to: ${lovedAttrs.map((a) => attributeLabel(a.tagId).toLowerCase()).join(', ')}`
        : '',
      hatedAttrs.length
        ? `Put off by: ${hatedAttrs.map((a) => attributeLabel(a.tagId).toLowerCase()).join(', ')}`
        : '',
      rejected.length ? `Not for me: ${rejected.map((s) => styleLabel(s.styleId)).join(', ')}` : '',
    ].filter(Boolean)
    void navigator.clipboard?.writeText(lines.join('\n'))
  }

  return (
    <section className="results">
      <header className="results__hero">
        <p className="eyebrow">Your result</p>
        <h1>{championStyle?.label ?? 'Inconclusive'}</h1>
        <p className="results__summary">{summary}</p>
        {champion && champion.confidence < 0.5 && (
          <p className="results__caveat">
            Based on only {Math.round(champion.seen)} cards for this style — swipe through again for
            a firmer read.
          </p>
        )}
      </header>

      {championStyle && (
        <ul className="traits">
          {championStyle.traits.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      {lovedAttrs.length > 0 && (
        <>
          <h2 className="section-title">What you're drawn to</h2>
          <p className="profile">
            {lovedAttrs
              .slice(0, 5)
              .map((a) => attributeLabel(a.tagId).toLowerCase())
              .join(', ')}
            .
          </p>
          <ul className="attr-list">
            {lovedAttrs.map((a) => (
              <li key={a.tagId} className="attr attr--liked">
                <span className="attr__label">{attributeLabel(a.tagId)}</span>
                <span className="attr__group">{ATTRIBUTE_BY_ID.get(a.tagId)?.group}</span>
                <span className="attr__value">{pct(a.rate)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {contrasts.length > 0 && (
        <p className="aside">
          {contrasts.map((c, i) => (
            <span key={c.liked}>
              {i > 0 ? ' · ' : ''}
              <strong>{attributeLabel(c.liked)}</strong>, not {attributeLabel(c.rejected).toLowerCase()}
            </span>
          ))}
        </p>
      )}

      {hatedAttrs.length > 0 && (
        <>
          <h2 className="section-title">What puts you off</h2>
          <ul className="attr-list">
            {hatedAttrs.map((a) => (
              <li key={a.tagId} className="attr attr--rejected">
                <span className="attr__label">{attributeLabel(a.tagId)}</span>
                <span className="attr__group">{ATTRIBUTE_BY_ID.get(a.tagId)?.group}</span>
                <span className="attr__value">{pct(a.rate)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="section-title">How every style scored</h2>
      <ol className="score-list">
        {seen.map((s, i) => {
          const style = STYLE_BY_ID.get(s.styleId)
          return (
            <li key={s.styleId} className={i < 3 ? 'score score--top' : 'score'}>
              <div className="score__head">
                <span className="score__rank">{i + 1}</span>
                <span className="score__label">{style?.label ?? s.styleId}</span>
                <span className="score__value">{pct(s.rate)}</span>
              </div>
              <div className="meter">
                <div className="meter__fill" style={{ width: pct(s.rate) }} />
              </div>
              <p className="score__detail">
                {Math.round(s.liked * 10) / 10} of {Math.round(s.seen * 10) / 10} liked
                {s.confidence < 0.4 ? ' · low confidence' : ''}
              </p>
            </li>
          )
        })}
      </ol>

      {alsoLiked.length > 0 && (
        <p className="aside">
          You also leaned towards {alsoLiked.map((s) => styleLabel(s.styleId)).join(', ')}.
        </p>
      )}
      {rejected.length > 0 && (
        <p className="aside aside--muted">
          Clearly not for you: {rejected.map((s) => styleLabel(s.styleId)).join(', ')}.
        </p>
      )}

      {rooms.length > 0 && (
        <>
          <h2 className="section-title">Rooms you responded to</h2>
          <ul className="chips">
            {rooms.slice(0, 4).map((r) => (
              <li key={r.roomId} className="chip">
                {roomLabel(r.roomId)} <span>{pct(r.rate)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {liked.length > 0 && (
        <>
          <h2 className="section-title">Everything you loved ({liked.length})</h2>
          {liked.length > GALLERY_LIMIT && (
            <p className="aside aside--muted">
              {showAllLiked ? (
                <>
                  All {liked.length}, newest first.{' '}
                  <button type="button" className="linkish" onClick={() => setShowAllLiked(false)}>
                    Show fewer
                  </button>
                </>
              ) : (
                <>
                  The {GALLERY_LIMIT} most recent.{' '}
                  <button type="button" className="linkish" onClick={() => setShowAllLiked(true)}>
                    Show all {liked.length}
                  </button>
                </>
              )}
            </p>
          )}
          <div className="gallery">
            {(showAllLiked ? liked : liked.slice(0, GALLERY_LIMIT)).map((img) => (
              <a
                key={img.id}
                className="gallery__item"
                href={img.source ?? img.url}
                target="_blank"
                rel="noreferrer noopener"
                title={`${img.title} — ${img.creator} (${img.license})`}
              >
                <img src={img.thumbnail} alt={img.title} loading="lazy" />
                <span className="gallery__tag">{styleLabel(img.styles[0])}</span>
              </a>
            ))}
          </div>
        </>
      )}

      <p className="aside aside--muted">
        {state.answers.length} cards answered · you liked {pct(likeRate)} of them.
      </p>

      <div className="results__actions">
        <button type="button" className="btn btn--primary" onClick={onRestart}>
          {restartLabel}
        </button>
        <button type="button" className="btn btn--ghost" onClick={copyToClipboard}>
          Copy results
        </button>
      </div>
    </section>
  )
}

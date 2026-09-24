import type { HomeImage } from '../data/images'
import type { Verdict } from '../engine/quiz'
import { attributeLabel, roomLabel, styleLabel } from '../data/taxonomy'
import { useSwipeGesture } from './useSwipeGesture'

interface Props {
  image: HomeImage
  /** Only the top card is interactive; the rest are stacked scenery. */
  interactive: boolean
  /** Depth in the stack, 0 = top. */
  depth: number
  onDecide: (verdict: Verdict) => void
  /** Set by the parent to fire the exit animation from the Like/Nope buttons. */
  commanded: Verdict | null
  /** Overlay the photo's tags. Useful for checking the catalog, but it biases answers. */
  showTags: boolean
}

export default function SwipeCard({
  image,
  interactive,
  depth,
  onDecide,
  commanded,
  showTags,
}: Props) {
  const swipe = useSwipeGesture({ interactive, depth, onDecide, commanded })

  return (
    <article
      className={swipe.className}
      style={swipe.rootStyle}
      {...swipe.handlers}
      onPointerCancel={swipe.handlers.onPointerUp}
      aria-hidden={!interactive}
    >
      <img
        className="card__image"
        src={image.url}
        alt={image.title}
        draggable={false}
        loading={depth === 0 ? 'eager' : 'lazy'}
        // A dead third-party URL should not leave a blank card mid-quiz.
        onError={(e) => {
          e.currentTarget.classList.add('card__image--broken')
        }}
      />

      <div className="card__shade" />

      {swipe.verdictHint && (
        <div
          className={`stamp stamp--${swipe.verdictHint}`}
          style={{ opacity: swipe.exiting ? 1 : swipe.stampStrength }}
        >
          {swipe.verdictHint === 'like' ? 'Love it' : 'Not me'}
        </div>
      )}

      {showTags && (
        <div className="tagbar">
          {image.styles.map((s) => (
            <span key={s} className="tagchip tagchip--style">
              {styleLabel(s)}
            </span>
          ))}
          {image.rooms.map((r) => (
            <span key={r} className="tagchip tagchip--room">
              {roomLabel(r)}
            </span>
          ))}
          {(image.attributes ?? []).map((a) => (
            <span key={a} className="tagchip">
              {attributeLabel(a)}
            </span>
          ))}
          {image.styles.length === 0 && (image.attributes?.length ?? 0) === 0 && (
            <span className="tagchip tagchip--warn">untagged</span>
          )}
        </div>
      )}

      <footer className="card__meta">
        <p className="card__title">{image.title}</p>
        <p className="card__credit">
          {image.creatorUrl ? (
            <a href={image.creatorUrl} target="_blank" rel="noreferrer noopener">
              {image.creator}
            </a>
          ) : (
            image.creator
          )}
          {' · '}
          {image.licenseUrl ? (
            <a href={image.licenseUrl} target="_blank" rel="noreferrer noopener">
              {image.license}
            </a>
          ) : (
            image.license
          )}
        </p>
      </footer>
    </article>
  )
}

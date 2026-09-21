import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomeImage } from '../data/images'
import type { Verdict } from '../engine/quiz'
import { attributeLabel, roomLabel, styleLabel } from '../data/taxonomy'

const SWIPE_THRESHOLD = 96
const FLICK_VELOCITY = 0.45 // px per ms
const EXIT_MS = 260

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
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [exiting, setExiting] = useState<Verdict | null>(null)
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const settled = useRef(false)

  const fly = useCallback(
    (verdict: Verdict) => {
      if (settled.current) return
      settled.current = true
      setExiting(verdict)
      setDragging(false)
      window.setTimeout(() => onDecide(verdict), EXIT_MS)
    },
    [onDecide],
  )

  // Button presses and keyboard shortcuts arrive as a command from the parent. React may
  // reuse this instance for the next card in the stack, so only act on a command that
  // *changed* while this card was already the interactive one — never on one that was
  // simply inherited on promotion.
  const actedOn = useRef(commanded)
  useEffect(() => {
    const isNew = commanded !== null && commanded !== actedOn.current
    actedOn.current = commanded
    if (isNew && interactive) fly(commanded)
  }, [commanded, interactive, fly])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive || exiting) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current || !dragging) return
    setDx(e.clientX - start.current.x)
    setDy((e.clientY - start.current.y) * 0.35) // damp vertical drift
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current) return
    const distance = e.clientX - start.current.x
    const elapsed = Math.max(1, e.timeStamp - start.current.t)
    const velocity = Math.abs(distance) / elapsed
    start.current = null
    setDragging(false)

    const decided =
      Math.abs(distance) > SWIPE_THRESHOLD ||
      (velocity > FLICK_VELOCITY && Math.abs(distance) > 40)

    if (decided) {
      fly(distance > 0 ? 'like' : 'dislike')
    } else {
      setDx(0)
      setDy(0)
    }
  }

  // Transform: follow the finger while dragging, throw off-screen when exiting.
  let transform: string
  if (exiting) {
    const dir = exiting === 'like' ? 1 : -1
    transform = `translate3d(${dir * 140}vw, ${dy}px, 0) rotate(${dir * 24}deg)`
  } else {
    transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${dx * 0.05}deg)`
  }

  const stampStrength = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD)
  const verdictHint: Verdict | null = exiting ?? (Math.abs(dx) > 12 ? (dx > 0 ? 'like' : 'dislike') : null)

  return (
    <article
      className={`card${dragging ? ' card--dragging' : ''}${exiting ? ' card--exiting' : ''}`}
      style={{
        transform:
          depth === 0 || exiting
            ? transform
            : `translate3d(0, ${depth * 14}px, 0) scale(${1 - depth * 0.05})`,
        zIndex: 100 - depth,
        opacity: depth > 2 ? 0 : 1,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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

      {verdictHint && (
        <div
          className={`stamp stamp--${verdictHint}`}
          style={{ opacity: exiting ? 1 : stampStrength }}
        >
          {verdictHint === 'like' ? 'Love it' : 'Not me'}
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

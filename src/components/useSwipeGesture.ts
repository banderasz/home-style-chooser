import { useCallback, useEffect, useRef, useState } from 'react'
import type { Verdict } from '../engine/quiz'

const SWIPE_THRESHOLD = 96
const FLICK_VELOCITY = 0.45 // px per ms
const EXIT_MS = 260

interface Options {
  interactive: boolean
  depth: number
  onDecide: (verdict: Verdict) => void
  /** Set by the parent to fire the exit animation from the Like/Nope buttons. */
  commanded: Verdict | null
}

/**
 * Drag-to-decide, shared by the photo card and the product card. Extracted rather than
 * copied because the tricky parts — the exit timing, and the promotion rule in the effect
 * below — are exactly the parts that would drift apart if there were two of them.
 */
export function useSwipeGesture({ interactive, depth, onDecide, commanded }: Options) {
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

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (!interactive || exiting) return
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }
      setDragging(true)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current || !dragging) return
      setDx(e.clientX - start.current.x)
      setDy((e.clientY - start.current.y) * 0.35) // damp vertical drift
    },
    onPointerUp: (e: React.PointerEvent) => {
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
    },
  }

  // Follow the finger while dragging, throw off-screen when exiting.
  let transform: string
  if (exiting) {
    const dir = exiting === 'like' ? 1 : -1
    transform = `translate3d(${dir * 140}vw, ${dy}px, 0) rotate(${dir * 24}deg)`
  } else {
    transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${dx * 0.05}deg)`
  }

  return {
    dragging,
    exiting,
    handlers,
    stampStrength: Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD),
    verdictHint: (exiting ??
      (Math.abs(dx) > 12 ? (dx > 0 ? 'like' : 'dislike') : null)) as Verdict | null,
    /** Everything the card needs on its root element. */
    rootStyle: {
      transform:
        depth === 0 || exiting
          ? transform
          : `translate3d(0, ${depth * 14}px, 0) scale(${1 - depth * 0.05})`,
      zIndex: 100 - depth,
      opacity: depth > 2 ? 0 : 1,
    } as React.CSSProperties,
    className: `card${dragging ? ' card--dragging' : ''}${exiting ? ' card--exiting' : ''}`,
  }
}

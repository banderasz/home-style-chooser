import { useMemo, useState } from 'react'
import type { Product } from '../data/products'
import { categoryCounts } from '../engine/products'
import { CATEGORY_GROUPS, MARKET_BY_ID, PRODUCT_CATEGORIES } from '../data/product-taxonomy'

interface Props {
  pool: Product[]
  market: string
  /** Currently selected category ids. Empty means everything. */
  selected: string[]
  onConfirm: (categories: string[]) => void
  onExit: () => void
  /** Present once a session exists, so this doubles as a mid-session filter change. */
  onBack?: () => void
}

export default function ProductCategoryPicker({
  pool,
  market,
  selected,
  onConfirm,
  onExit,
  onBack,
}: Props) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected))
  const counts = useMemo(() => categoryCounts(pool), [pool])

  // A category with nothing behind it in this market would be a dead checkbox.
  const groups = useMemo(
    () =>
      CATEGORY_GROUPS.map((group) => ({
        group,
        items: PRODUCT_CATEGORIES.filter((c) => c.group === group && (counts.get(c.id) ?? 0) > 0),
      })).filter((g) => g.items.length > 0),
    [counts],
  )

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleGroup = (items: { id: string }[]) =>
    setPicked((prev) => {
      const next = new Set(prev)
      const allOn = items.every((i) => next.has(i.id))
      for (const i of items) {
        if (allOn) next.delete(i.id)
        else next.add(i.id)
      }
      return next
    })

  // An empty selection means "everything", so the total has to say so too — otherwise
  // the button reads "Swipe 0 products" at the exact moment it would show you all of them.
  const total = picked.size === 0 ? pool.length : [...picked].reduce((n, id) => n + (counts.get(id) ?? 0), 0)

  return (
    <section className="results">
      <header className="results__hero">
        <p className="eyebrow">IKEA {MARKET_BY_ID.get(market)?.label ?? market}</p>
        <h1>What are you shopping for?</h1>
        <p className="results__summary">
          Pick as many as you like, or none to see everything. You can change this later
          without losing any verdicts.
        </p>
      </header>

      {groups.map(({ group, items }) => {
        const allOn = items.every((i) => picked.has(i.id))
        return (
          <div key={group} className="pickgroup">
            <h2 className="section-title pickgroup__head">
              {group}
              <button
                type="button"
                className="linkish pickgroup__all"
                onClick={() => toggleGroup(items)}
              >
                {allOn ? 'none' : 'all'}
              </button>
            </h2>
            <ul className="chips">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`chip chip--button${picked.has(c.id) ? ' chip--on' : ''}`}
                    onClick={() => toggle(c.id)}
                    aria-pressed={picked.has(c.id)}
                  >
                    {c.label} <span>{counts.get(c.id)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <p className="results__caveat">
        {picked.size === 0
          ? `Nothing picked — you'll see all ${pool.length} products.`
          : `${picked.size} ${picked.size === 1 ? 'category' : 'categories'} · ${total} products.`}
      </p>

      <div className="results__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onConfirm([...picked])}
        >
          Swipe {total} products
        </button>
        {picked.size > 0 && (
          <button type="button" className="btn btn--ghost" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        )}
        {onBack && (
          <button type="button" className="btn btn--ghost" onClick={onBack}>
            Back
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          Home
        </button>
      </div>
    </section>
  )
}

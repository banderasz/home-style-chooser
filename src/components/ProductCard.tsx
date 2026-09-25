import type { Product } from '../data/products'
import type { Verdict } from '../engine/quiz'
import { attributeLabel } from '../data/taxonomy'
import {
  categoryLabel,
  colourLabel,
  formatPrice,
  materialLabel,
  COLOUR_BY_ID,
} from '../data/product-taxonomy'
import { useSwipeGesture } from './useSwipeGesture'

interface Props {
  product: Product
  interactive: boolean
  depth: number
  onDecide: (verdict: Verdict) => void
  commanded: Verdict | null
  showTags: boolean
}

export default function ProductCard({
  product,
  interactive,
  depth,
  onDecide,
  commanded,
  showTags,
}: Props) {
  const swipe = useSwipeGesture({ interactive, depth, onDecide, commanded })

  return (
    <article
      className={`${swipe.className} card--product`}
      style={swipe.rootStyle}
      {...swipe.handlers}
      onPointerCancel={swipe.handlers.onPointerUp}
      aria-hidden={!interactive}
    >
      <img
        // A room shot fills the card; a cutout is a product floating on white and needs
        // `contain` or its legs get cropped. `imageKind` is null only when IKEA has no
        // photograph of the product in a home anywhere.
        className={`card__image${product.imageKind ? '' : ' card__image--cutout'}`}
        src={product.image}
        alt={`${product.name} ${product.typeLabel}`}
        draggable={false}
        loading={depth === 0 ? 'eager' : 'lazy'}
        onError={(e) => {
          // Context shots come and go as IKEA restages a product; the cutout is stable.
          const img = e.currentTarget
          if (product.cutout && img.src !== product.cutout) {
            img.src = product.cutout
            img.classList.add('card__image--cutout')
          } else {
            img.classList.add('card__image--broken')
          }
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
          {product.categories.map((c) => (
            <span key={c} className="tagchip tagchip--style">
              {categoryLabel(c)}
            </span>
          ))}
          {product.colours.map((c) => (
            <span key={c} className="tagchip tagchip--colour">
              <i className="swatch" style={{ background: COLOUR_BY_ID.get(c)?.hex }} />
              {colourLabel(c)}
            </span>
          ))}
          {product.materials.map((m) => (
            <span key={m} className="tagchip tagchip--room">
              {materialLabel(m)}
            </span>
          ))}
          {product.attributes.map((a) => (
            <span key={a} className="tagchip">
              {attributeLabel(a)}
            </span>
          ))}
        </div>
      )}

      <footer className="card__meta">
        <p className="card__title">
          {product.name} <span className="card__type">{product.typeLabel}</span>
        </p>
        <p className="card__credit">
          <strong className="card__price">{formatPrice(product.price)}</strong>
          {product.rating && (
            <>
              {' · '}
              {product.rating.value.toFixed(1)}★ ({product.rating.count})
            </>
          )}
          {' · '}
          {/* Stop propagation so tapping the link isn't read as the start of a swipe. */}
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer noopener"
            onPointerDown={(e) => e.stopPropagation()}
          >
            View at IKEA
          </a>
        </p>
      </footer>
    </article>
  )
}

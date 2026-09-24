// The product axes, as the app sees them. Mirrors scripts/product-taxonomy.mjs, which
// owns the harvest-side detail (query terms per market, IKEA facet id mappings, the word
// lists used to parse a design text). Only what the UI and the engine need is repeated
// here; scripts/test-engine.mjs asserts the id sets agree.

export interface ProductCategory {
  id: string
  label: string
  group: string
}

export interface Material {
  id: string
  label: string
  /** The adjective this material is evidence for, on the axis the room quiz scores. */
  attribute: string
}

export interface Colour {
  id: string
  label: string
  tone: 'warm' | 'cool' | 'neutral'
  /** Swatch for the results screen. */
  hex: string
  attribute: string
}

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: 'sofa', label: 'Sofa', group: 'Seating' },
  { id: 'armchair', label: 'Armchair', group: 'Seating' },
  { id: 'dining-chair', label: 'Dining chair', group: 'Seating' },
  { id: 'stool', label: 'Stool', group: 'Seating' },
  { id: 'bench', label: 'Bench', group: 'Seating' },

  { id: 'coffee-table', label: 'Coffee table', group: 'Tables' },
  { id: 'side-table', label: 'Side table', group: 'Tables' },
  { id: 'dining-table', label: 'Dining table', group: 'Tables' },
  { id: 'desk', label: 'Desk', group: 'Tables' },

  { id: 'wardrobe', label: 'Wardrobe', group: 'Storage' },
  { id: 'bookcase', label: 'Bookcase', group: 'Storage' },
  { id: 'shelving', label: 'Shelving', group: 'Storage' },
  { id: 'drawers', label: 'Chest of drawers', group: 'Storage' },
  { id: 'sideboard', label: 'Sideboard', group: 'Storage' },
  { id: 'media-unit', label: 'TV unit', group: 'Storage' },

  { id: 'bed', label: 'Bed', group: 'Beds' },

  { id: 'pendant', label: 'Pendant lamp', group: 'Lighting' },
  { id: 'floor-lamp', label: 'Floor lamp', group: 'Lighting' },
  { id: 'table-lamp', label: 'Table lamp', group: 'Lighting' },
  { id: 'wall-lamp', label: 'Wall lamp', group: 'Lighting' },

  { id: 'rug', label: 'Rug', group: 'Soft furnishing' },
  { id: 'curtain', label: 'Curtains', group: 'Soft furnishing' },
  { id: 'cushion', label: 'Cushion', group: 'Soft furnishing' },
  { id: 'throw', label: 'Throw', group: 'Soft furnishing' },
  { id: 'bedding', label: 'Bedding', group: 'Soft furnishing' },

  { id: 'mirror', label: 'Mirror', group: 'Decor' },
  { id: 'vase', label: 'Vase', group: 'Decor' },
  { id: 'picture', label: 'Wall art', group: 'Decor' },
  { id: 'frame', label: 'Picture frame', group: 'Decor' },
  { id: 'plant-pot', label: 'Plant pot', group: 'Decor' },
  { id: 'candle-holder', label: 'Candle holder', group: 'Decor' },
]

export const MATERIALS: Material[] = [
  { id: 'solid-wood', label: 'Solid wood', attribute: 'wood' },
  { id: 'veneer', label: 'Wood veneer', attribute: 'wood' },
  { id: 'metal', label: 'Metal', attribute: 'metal' },
  { id: 'glass', label: 'Glass', attribute: 'glass' },
  { id: 'stone', label: 'Stone & marble', attribute: 'stone' },
  { id: 'ceramic', label: 'Ceramic', attribute: 'stone' },
  { id: 'rattan', label: 'Rattan & woven', attribute: 'rattan' },
  { id: 'leather', label: 'Leather', attribute: 'leather' },
  { id: 'velvet', label: 'Velvet', attribute: 'luxurious' },
  { id: 'wool', label: 'Wool & sheepskin', attribute: 'textile' },
  { id: 'linen-cotton', label: 'Linen & cotton', attribute: 'textile' },
  { id: 'synthetic-textile', label: 'Synthetic textile', attribute: 'textile' },
  { id: 'plastic', label: 'Plastic', attribute: 'sleek' },
  { id: 'paper', label: 'Paper', attribute: 'minimal' },
]

export const COLOURS: Colour[] = [
  { id: 'white', label: 'White', tone: 'neutral', hex: '#ffffff', attribute: 'white' },
  { id: 'black', label: 'Black', tone: 'neutral', hex: '#1b1b1b', attribute: 'monochrome' },
  { id: 'grey', label: 'Grey', tone: 'neutral', hex: '#949494', attribute: 'neutral' },
  { id: 'beige', label: 'Beige', tone: 'warm', hex: '#e2d7bf', attribute: 'neutral' },
  { id: 'brown', label: 'Brown', tone: 'warm', hex: '#814820', attribute: 'earthy' },
  { id: 'green', label: 'Green', tone: 'cool', hex: '#3b7d22', attribute: 'greenery' },
  { id: 'blue', label: 'Blue', tone: 'cool', hex: '#2f5f9e', attribute: 'blue' },
  { id: 'pink', label: 'Pink', tone: 'warm', hex: '#e59ab0', attribute: 'pastel' },
  { id: 'red', label: 'Red', tone: 'warm', hex: '#c02a29', attribute: 'colourful' },
  { id: 'yellow', label: 'Yellow & orange', tone: 'warm', hex: '#e8a317', attribute: 'colourful' },
  { id: 'metallic', label: 'Metallic', tone: 'neutral', hex: '#b9a36a', attribute: 'metal' },
  { id: 'multi', label: 'Multicoloured', tone: 'warm', hex: '#8e6fb5', attribute: 'colourful' },
]

export const PRODUCT_CATEGORY_BY_ID = new Map(PRODUCT_CATEGORIES.map((c) => [c.id, c]))
export const MATERIAL_BY_ID = new Map(MATERIALS.map((m) => [m.id, m]))
export const COLOUR_BY_ID = new Map(COLOURS.map((c) => [c.id, c]))

export const categoryLabel = (id: string) => PRODUCT_CATEGORY_BY_ID.get(id)?.label ?? id
export const materialLabel = (id: string) => MATERIAL_BY_ID.get(id)?.label ?? id
export const colourLabel = (id: string) => COLOUR_BY_ID.get(id)?.label ?? id

/** Group order for the results screen, taken from declaration order. */
export const CATEGORY_GROUPS = [...new Set(PRODUCT_CATEGORIES.map((c) => c.group))]

export const MARKETS = [
  { id: 'at', label: 'Austria', currency: 'EUR', locale: 'de-AT' },
  { id: 'hu', label: 'Hungary', currency: 'HUF', locale: 'hu-HU' },
] as const

export type MarketId = (typeof MARKETS)[number]['id']

export const MARKET_BY_ID: Map<string, (typeof MARKETS)[number]> = new Map(
  MARKETS.map((m) => [m.id, m]),
)

/**
 * Prices arrive as a bare number plus a currency code. Forints have no minor unit and
 * run to five digits, so a shared `toFixed(2)` would be wrong in both directions —
 * `Intl` already knows this per currency.
 */
export function formatPrice(price: { amount: number; currency: string | null } | null): string {
  if (!price || typeof price.amount !== 'number') return ''
  const market = MARKETS.find((m) => m.currency === price.currency)
  try {
    return new Intl.NumberFormat(market?.locale ?? 'en-GB', {
      style: 'currency',
      currency: price.currency ?? 'EUR',
      maximumFractionDigits: price.currency === 'HUF' ? 0 : 2,
    }).format(price.amount)
  } catch {
    return `${price.amount} ${price.currency ?? ''}`.trim()
  }
}

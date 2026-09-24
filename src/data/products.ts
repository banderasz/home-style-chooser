// Buyable products, kept deliberately apart from the room-photo catalog.
//
// They could have been one list with a `kind` discriminator, but almost nothing wants
// both: the quiz's deck builder assumes every card belongs to a design style, and the
// room pipeline's pruner exists specifically to *delete* product shots (a caption that
// doesn't name a room is dropped, and so is anything the close-up detector flags). A
// product would have to be exempted from both to survive, and the exemptions would
// outnumber the shared code. Two files, two providers, one shared scorer.

export interface Price {
  amount: number
  currency: string | null
}

export interface Product {
  /** `ikea-<market>-<itemNoGlobal>`. The same item sold in two markets is two entries. */
  id: string
  /** IKEA's global item number — identical across markets, which is how the harvester
   *  joins a localised listing to its English description. */
  itemNoGlobal: string
  retailer: string
  market: string
  /** The IKEA product name, e.g. `DYVLINGE`. */
  name: string
  /** Localised type, e.g. `Drehsessel`. What the card actually reads as. */
  typeLabel: string
  /** The product page, in the right market. */
  url: string
  /** The card image — the product styled in a room where one exists. */
  image: string
  imageIsContext: boolean
  /** The white-background shot. Always present; used as the thumbnail. */
  cutout: string | null
  price: Price | null
  rating: { value: number; count: number } | null
  categories: string[]
  materials: string[]
  colours: string[]
  /**
   * Adjectives from the product's own English description. Only what the text said —
   * adjectives implied by colour or material are deliberately not repeated here, so the
   * three axes stay independent and the recommender can't mistake one signal for three.
   */
  attributes: string[]
}

export interface ProductProvider {
  name: string
  load(market?: string): Promise<Product[]>
}

interface ProductFile {
  generatedBy: string
  retailer: string
  products: Product[]
}

/**
 * The catalog's co-occurrence structure, written by `npm run analyse-products`.
 *
 * Optional on purpose. It is a derived file, and a recommender that can only work once
 * an analysis step has been run is a recommender that silently does nothing when someone
 * forgets. Without it, recommendations fall back to directly-measured tags only — worse,
 * but never broken.
 */
export async function loadAffinity(): Promise<import('../engine/products').Affinity | null> {
  try {
    const mod = await import('./affinity.json')
    const file = (mod as { default?: unknown }).default ?? mod
    return file as import('../engine/products').Affinity
  } catch {
    return null
  }
}

export const ikeaProvider: ProductProvider = {
  name: 'ikea',
  async load(market?: string) {
    const mod = (await import('./products.json')) as unknown as { default: ProductFile }
    const file = mod.default ?? (mod as unknown as ProductFile)
    const all = file.products ?? []
    // A product with no category can't be placed on any axis, so it is only a picture.
    const usable = all.filter((p) => p.categories.length > 0 && p.image && p.url)
    return market ? usable.filter((p) => p.market === market) : usable
  },
}

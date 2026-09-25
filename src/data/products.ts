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
  /**
   * The card image: the product photographed in a home wherever IKEA has such a shot,
   * because that is what a swipe is actually judging. A minority have none anywhere and
   * fall back to the white-background cutout.
   */
  image: string
  /** The IKEA image type it came from, or null when it is the cutout. */
  imageKind: string | null
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

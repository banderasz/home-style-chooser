// Mirrors scripts/taxonomy.mjs. The harvester writes these ids into the catalog;
// the quiz engine and the results screen read them back.

export interface Style {
  id: string
  label: string
  blurb: string
  /** Traits shown on the results screen so a win is explainable, not just a number. */
  traits: string[]
}

export interface Room {
  id: string
  label: string
}

export const STYLES: Style[] = [
  {
    id: 'scandinavian',
    label: 'Scandinavian',
    blurb: 'Pale woods, white walls, soft textiles and a lot of daylight.',
    traits: ['Light oak & birch', 'White / greige walls', 'Wool and linen', 'Uncluttered but cosy'],
  },
  {
    id: 'minimalist',
    label: 'Modern Minimalist',
    blurb: 'Clean lines, hidden storage, a strict palette and nothing spare.',
    traits: ['Handleless cabinetry', 'Two or three colours', 'Flat surfaces', 'Negative space'],
  },
  {
    id: 'industrial',
    label: 'Industrial',
    blurb: 'Exposed brick and pipework, black steel, concrete and raw edges.',
    traits: ['Exposed brick', 'Blackened metal', 'Concrete & leather', 'Visible services'],
  },
  {
    id: 'midcentury',
    label: 'Mid-Century Modern',
    blurb: 'Walnut, tapered legs, warm retro colour and sculptural furniture.',
    traits: ['Walnut & teak', 'Tapered legs', 'Mustard, olive, rust', 'Sculptural lighting'],
  },
  {
    id: 'bohemian',
    label: 'Bohemian',
    blurb: 'Layered rugs, rattan, plants everywhere and collected-over-time character.',
    traits: ['Layered textiles', 'Rattan & macramé', 'Lots of plants', 'Collected, not matched'],
  },
  {
    id: 'farmhouse',
    label: 'Rustic Farmhouse',
    blurb: 'Reclaimed timber, shaker cabinets, apron sinks and country warmth.',
    traits: ['Shaker doors', 'Reclaimed timber', 'Apron sink', 'Warm neutrals'],
  },
  {
    id: 'coastal',
    label: 'Coastal',
    blurb: 'Whites and blues, linen, driftwood and an airy seaside calm.',
    traits: ['White & blue palette', 'Linen and jute', 'Driftwood tones', 'Very light rooms'],
  },
  {
    id: 'traditional',
    label: 'Traditional Classic',
    blurb: 'Panelling, mouldings, symmetry, antiques and deep upholstery.',
    traits: ['Panelling & mouldings', 'Symmetrical layouts', 'Antique wood', 'Deep upholstery'],
  },
  {
    id: 'japandi',
    label: 'Japandi',
    blurb: 'Japanese restraint meets Nordic warmth: low profiles, natural materials.',
    traits: ['Low furniture', 'Paper & timber', 'Muted earth tones', 'Deliberate emptiness'],
  },
  {
    id: 'artdeco',
    label: 'Art Deco Glam',
    blurb: 'Brass, velvet, marble, bold geometry and a little theatre.',
    traits: ['Brass & gold', 'Velvet upholstery', 'Marble surfaces', 'Strong geometry'],
  },
  {
    id: 'mediterranean',
    label: 'Mediterranean',
    blurb: 'Lime plaster, terracotta, arches, tile and sun-bleached colour.',
    traits: ['Lime plaster walls', 'Terracotta & tile', 'Arched openings', 'Warm sun tones'],
  },
  {
    id: 'maximalist',
    label: 'Eclectic Maximalist',
    blurb: 'Pattern on pattern, saturated colour, gallery walls — more is more.',
    traits: ['Bold wallpaper', 'Saturated colour', 'Gallery walls', 'Mixed eras'],
  },
  {
    id: 'transitional',
    label: 'Transitional',
    blurb: 'Classic bones with contemporary furniture — the elegant middle ground.',
    traits: ['Neutral palette', 'Classic shapes', 'Modern finishes', 'Nothing shouts'],
  },
  {
    id: 'frenchcountry',
    label: 'French Country',
    blurb: 'Provençal stone and limewash, curved timber, soft faded colour.',
    traits: ['Limewash walls', 'Curved timber', 'Faded linens', 'Stone floors'],
  },
  {
    id: 'cottage',
    label: 'English Cottage',
    blurb: 'Florals, painted timber, low beams and comfortable shabby charm.',
    traits: ['Floral prints', 'Painted furniture', 'Exposed beams', 'Layered clutter'],
  },
  {
    id: 'southwestern',
    label: 'Southwestern Desert',
    blurb: 'Adobe, clay, woven wool, cactus and sun-baked earth tones.',
    traits: ['Adobe & clay', 'Woven wool', 'Terracotta tones', 'Cacti and rough wood'],
  },
  {
    id: 'tropical',
    label: 'Tropical Resort',
    blurb: 'Teak and bamboo, palm prints, open walls, holiday-villa ease.',
    traits: ['Teak & bamboo', 'Palm prints', 'Indoor-outdoor', 'Ceiling fans'],
  },
  {
    id: 'moody',
    label: 'Dark & Moody',
    blurb: 'Deep charcoal and forest green, low light, leather and panelled walls.',
    traits: ['Dark walls', 'Low pooled light', 'Leather & brass', 'Heavy drapes'],
  },
  {
    id: 'retro70s',
    label: 'Seventies Retro',
    blurb: 'Burnt orange and brown, shag pile, chrome and conversation pits.',
    traits: ['Burnt orange & brown', 'Shag texture', 'Chrome accents', 'Low seating'],
  },
  {
    id: 'brutalist',
    label: 'Brutalist Concrete',
    blurb: 'Board-marked concrete, heavy mass, monolithic forms, almost no colour.',
    traits: ['Raw concrete', 'Monolithic forms', 'Near-zero colour', 'Hard shadows'],
  },
  {
    id: 'biophilic',
    label: 'Biophilic Jungle',
    blurb: 'Plants as architecture — green everywhere, daylight, living walls.',
    traits: ['Plants everywhere', 'Living walls', 'Natural light', 'Raw materials'],
  },
  {
    id: 'luxe',
    label: 'Contemporary Luxe',
    blurb: 'Penthouse polish: stone slabs, glass, statement lighting, sharp detailing.',
    traits: ['Book-matched stone', 'Statement lighting', 'Glass & polish', 'Sharp detailing'],
  },
  {
    id: 'chalet',
    label: 'Alpine Chalet',
    blurb: 'Log walls, stone hearths, sheepskin and deep winter cosiness.',
    traits: ['Log & stone', 'Open hearth', 'Sheepskin & fur', 'Very warm light'],
  },
]

/**
 * The plain-adjective axis. Every photo carries a handful of these alongside its style,
 * so a single swipe is evidence about several qualities at once — which is how the quiz
 * can cover 45 attributes in a deck of ~28 cards.
 *
 * Ids must match scripts/attributes.mjs, which owns the caption-matching lexicon.
 * `opposite` powers the "you like X, not Y" lines on the results screen.
 */
export interface Attribute {
  id: string
  label: string
  group: string
  opposite?: string
  /**
   * Whether the adjective can describe a single object as well as a whole room. The
   * product mode scores only adjectives a product can actually express: a sofa is never
   * `spacious` or `daylight`-filled, and ranking those would put noise at the top of its
   * results screen. Absent means `'both'`, so the room quiz is unaffected either way.
   */
  appliesTo?: 'room' | 'both'
}

export const ATTRIBUTES: Attribute[] = [
  { id: 'bright', label: 'Bright', group: 'Light', opposite: 'dark', appliesTo: 'room' },
  { id: 'daylight', label: 'Full of daylight', group: 'Light', appliesTo: 'room' },
  { id: 'dark', label: 'Dark', group: 'Light', opposite: 'bright' },
  { id: 'warmlight', label: 'Warm lighting', group: 'Light', appliesTo: 'room' },

  { id: 'white', label: 'White', group: 'Colour', opposite: 'colourful' },
  { id: 'neutral', label: 'Neutral', group: 'Colour', opposite: 'colourful' },
  { id: 'colourful', label: 'Colourful', group: 'Colour', opposite: 'neutral' },
  { id: 'pastel', label: 'Pastel', group: 'Colour' },
  { id: 'monochrome', label: 'Black & white', group: 'Colour', opposite: 'colourful' },
  { id: 'earthy', label: 'Earthy', group: 'Colour' },
  { id: 'greenery', label: 'Green', group: 'Colour' },
  { id: 'blue', label: 'Blue', group: 'Colour' },

  { id: 'wood', label: 'Wooden', group: 'Material' },
  { id: 'stone', label: 'Stone & marble', group: 'Material' },
  { id: 'concrete', label: 'Concrete', group: 'Material', appliesTo: 'room' },
  { id: 'metal', label: 'Metal & brass', group: 'Material' },
  { id: 'glass', label: 'Glass & mirror', group: 'Material' },
  { id: 'brick', label: 'Brick', group: 'Material', appliesTo: 'room' },
  { id: 'tile', label: 'Tiled', group: 'Material', appliesTo: 'room' },
  { id: 'textile', label: 'Soft textiles', group: 'Material' },
  { id: 'leather', label: 'Leather', group: 'Material' },
  { id: 'rattan', label: 'Rattan & woven', group: 'Material' },

  { id: 'cozy', label: 'Cosy', group: 'Mood' },
  { id: 'calm', label: 'Calm', group: 'Mood', opposite: 'dramatic' },
  { id: 'elegant', label: 'Elegant', group: 'Mood' },
  { id: 'luxurious', label: 'Luxurious', group: 'Mood' },
  { id: 'playful', label: 'Playful', group: 'Mood' },
  { id: 'dramatic', label: 'Dramatic', group: 'Mood', opposite: 'calm' },
  { id: 'livedin', label: 'Lived-in', group: 'Mood' },

  { id: 'minimal', label: 'Minimal', group: 'Space', opposite: 'layered' },
  { id: 'spacious', label: 'Spacious', group: 'Space', opposite: 'compact', appliesTo: 'room' },
  { id: 'compact', label: 'Compact', group: 'Space', opposite: 'spacious' },
  { id: 'layered', label: 'Layered & full', group: 'Space', opposite: 'minimal' },

  { id: 'modern', label: 'Modern', group: 'Character', opposite: 'vintage' },
  { id: 'vintage', label: 'Vintage', group: 'Character', opposite: 'modern' },
  { id: 'rustic', label: 'Rustic', group: 'Character', opposite: 'sleek' },
  { id: 'ornate', label: 'Ornate', group: 'Character', opposite: 'minimal' },
  { id: 'raw', label: 'Raw & exposed', group: 'Character', opposite: 'sleek' },
  { id: 'artsy', label: 'Art-filled', group: 'Character' },

  { id: 'plants', label: 'Plant-filled', group: 'Nature' },
  { id: 'view', label: 'Good view', group: 'Nature', appliesTo: 'room' },

  { id: 'curved', label: 'Curved', group: 'Form', opposite: 'geometric' },
  { id: 'geometric', label: 'Geometric', group: 'Form', opposite: 'curved' },
  { id: 'patterned', label: 'Patterned', group: 'Form', opposite: 'minimal' },
  { id: 'sleek', label: 'Sleek', group: 'Form', opposite: 'rustic' },
]

export const ATTRIBUTE_BY_ID = new Map(ATTRIBUTES.map((a) => [a.id, a]))

/** The adjectives an object can be. See `Attribute.appliesTo`. */
export const PRODUCT_ATTRIBUTE_IDS = ATTRIBUTES.filter((a) => a.appliesTo !== 'room').map(
  (a) => a.id,
)

export const attributeLabel = (id: string) => ATTRIBUTE_BY_ID.get(id)?.label ?? id

/** Group order for the results screen. */
export const ATTRIBUTE_GROUPS = [...new Set(ATTRIBUTES.map((a) => a.group))]

export const ROOMS: Room[] = [
  { id: 'living', label: 'Living room' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'dining', label: 'Dining room' },
  { id: 'office', label: 'Home office' },
]

export const STYLE_BY_ID = new Map(STYLES.map((s) => [s.id, s]))
export const ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]))

export const styleLabel = (id: string) => STYLE_BY_ID.get(id)?.label ?? id
export const roomLabel = (id: string) => ROOM_BY_ID.get(id)?.label ?? id

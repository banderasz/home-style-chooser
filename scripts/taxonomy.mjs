// Shared taxonomy used by the harvester and mirrored in src/data/taxonomy.ts.
// Keep the two in sync — the ids are the contract between the catalog and the quiz engine.

export const STYLES = [
  {
    id: 'scandinavian',
    label: 'Scandinavian',
    blurb: 'Pale woods, white walls, soft textiles and a lot of daylight.',
    queries: ['scandinavian', 'nordic interior', 'light wood minimal nordic'],
  },
  {
    id: 'minimalist',
    label: 'Modern Minimalist',
    blurb: 'Clean lines, hidden storage, a strict palette and nothing spare.',
    queries: ['minimalist', 'modern minimal interior', 'monochrome modern'],
  },
  {
    id: 'industrial',
    label: 'Industrial',
    blurb: 'Exposed brick and pipework, black steel, concrete and raw edges.',
    queries: ['industrial loft', 'exposed brick concrete interior', 'warehouse conversion'],
  },
  {
    id: 'midcentury',
    label: 'Mid-Century Modern',
    blurb: 'Walnut, tapered legs, warm retro colour and sculptural furniture.',
    queries: ['mid century modern', 'retro 1960s interior', 'eames style interior'],
  },
  {
    id: 'bohemian',
    label: 'Bohemian',
    blurb: 'Layered rugs, rattan, plants everywhere and collected-over-time clutter.',
    queries: ['bohemian boho', 'rattan plants interior', 'eclectic boho room'],
  },
  {
    id: 'farmhouse',
    label: 'Rustic Farmhouse',
    blurb: 'Reclaimed timber, shaker cabinets, aprons sinks and country warmth.',
    queries: ['farmhouse rustic', 'country cottage interior', 'reclaimed wood rustic room'],
  },
  {
    id: 'coastal',
    label: 'Coastal',
    blurb: 'Whites and blues, linen, driftwood and an airy seaside calm.',
    queries: ['coastal beach house', 'hamptons interior', 'nautical white blue room'],
  },
  {
    id: 'traditional',
    label: 'Traditional Classic',
    blurb: 'Panelling, mouldings, symmetry, antiques and deep upholstery.',
    queries: ['traditional classic interior', 'victorian interior room', 'english country house room'],
  },
  {
    id: 'japandi',
    label: 'Japandi',
    blurb: 'Japanese restraint met Nordic warmth: low profiles, natural materials.',
    queries: ['japandi', 'japanese zen interior', 'wabi sabi interior'],
  },
  {
    id: 'artdeco',
    label: 'Art Deco Glam',
    blurb: 'Brass, velvet, marble, bold geometry and a little theatre.',
    queries: ['art deco interior', 'glam velvet brass interior', 'hollywood regency room'],
  },
  {
    id: 'mediterranean',
    label: 'Mediterranean',
    blurb: 'Lime plaster, terracotta, arches, tile and sun-bleached colour.',
    queries: ['mediterranean interior', 'terracotta tile spanish interior', 'moroccan riad interior'],
  },
  {
    id: 'maximalist',
    label: 'Eclectic Maximalist',
    blurb: 'Pattern on pattern, saturated colour, gallery walls, more is more.',
    queries: ['maximalist interior', 'colourful eclectic room', 'wallpaper pattern bold interior'],
  },
  {
    id: 'transitional',
    label: 'Transitional',
    blurb: 'Classic bones with contemporary furniture — the safe, elegant middle.',
    queries: ['transitional interior', 'neutral elegant modern classic room', 'greige contemporary interior'],
  },
  {
    id: 'frenchcountry',
    label: 'French Country',
    blurb: 'Provençal stone and limewash, curved timber, soft faded colour.',
    queries: ['french country interior', 'provencal farmhouse interior', 'french chateau room'],
  },
  {
    id: 'cottage',
    label: 'English Cottage',
    blurb: 'Florals, painted timber, low beams and comfortable shabby charm.',
    queries: ['english cottage interior', 'shabby chic interior', 'cottagecore floral room'],
  },
  {
    id: 'southwestern',
    label: 'Southwestern Desert',
    blurb: 'Adobe, clay, woven wool, cactus and sun-baked earth tones.',
    queries: ['southwestern interior', 'adobe desert interior', 'santa fe style room'],
  },
  {
    id: 'tropical',
    label: 'Tropical Resort',
    blurb: 'Teak and bamboo, palm prints, open walls, holiday-villa ease.',
    queries: ['tropical interior', 'bali resort villa interior', 'palm bamboo tropical room'],
  },
  {
    id: 'moody',
    label: 'Dark & Moody',
    blurb: 'Deep charcoal and forest green, low light, leather, panelled walls.',
    queries: ['dark moody interior', 'black walls interior', 'dark academia library room'],
  },
  {
    id: 'retro70s',
    label: 'Seventies Retro',
    blurb: 'Burnt orange and brown, shag pile, chrome and conversation pits.',
    queries: ['1970s retro interior', 'seventies style room', 'orange brown vintage interior'],
  },
  {
    id: 'brutalist',
    label: 'Brutalist Concrete',
    blurb: 'Board-marked concrete, heavy mass, monolithic forms, almost no colour.',
    queries: ['brutalist interior', 'concrete interior architecture', 'raw concrete apartment'],
  },
  {
    id: 'biophilic',
    label: 'Biophilic Jungle',
    blurb: 'Plants as architecture — green everywhere, natural light, living walls.',
    queries: ['biophilic interior', 'plant filled room jungle', 'indoor garden living wall'],
  },
  {
    id: 'luxe',
    label: 'Contemporary Luxe',
    blurb: 'Penthouse polish: stone slabs, glass, statement lighting, sharp detailing.',
    queries: ['luxury modern penthouse interior', 'high end contemporary interior', 'marble glass luxury room'],
  },
  {
    id: 'chalet',
    label: 'Alpine Chalet',
    blurb: 'Log walls, stone hearths, sheepskin and deep winter cosiness.',
    queries: ['alpine chalet interior', 'log cabin interior', 'mountain lodge room'],
  },
]

export const ROOMS = [
  { id: 'living', label: 'Living room', queries: ['living room'] },
  { id: 'kitchen', label: 'Kitchen', queries: ['kitchen'] },
  { id: 'bathroom', label: 'Bathroom', queries: ['bathroom'] },
  { id: 'bedroom', label: 'Bedroom', queries: ['bedroom'] },
  { id: 'dining', label: 'Dining room', queries: ['dining room'] },
  { id: 'office', label: 'Home office', queries: ['home office study'] },
]

export const STYLE_IDS = STYLES.map((s) => s.id)
export const ROOM_IDS = ROOMS.map((r) => r.id)

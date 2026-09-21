// Attribute lexicon: the plain-adjective axis that sits alongside the named design styles.
//
// Each attribute carries:
//   match   — phrases matched against a photo's caption to tag it (word-boundary matched)
//   queries — search phrasings, used only when harvesting extra photos for an attribute
//             that the lexicon pass left thin (`--axis attributes`)
//
// Display copy for these ids lives in src/data/taxonomy.ts; scripts/test-engine.mjs
// asserts the two id sets stay identical.

export const ATTRIBUTES = [
  // ---- light -------------------------------------------------------------
  {
    id: 'bright',
    group: 'Light',
    match: ['bright', 'sunlit', 'sunny', 'well-lit', 'well lit', 'light-filled', 'light filled', 'sun-drenched', 'luminous'],
    queries: ['bright sunlit room', 'light filled interior'],
  },
  {
    id: 'daylight',
    group: 'Light',
    match: ['natural light', 'daylight', 'sunlight', 'large window', 'big window', 'floor-to-ceiling window', 'skylight'],
    queries: ['interior large windows natural light', 'sunlight streaming room'],
  },
  {
    id: 'dark',
    group: 'Light',
    match: ['dark', 'dim', 'dimly', 'moody', 'shadow', 'low light', 'black wall', 'nighttime'],
    queries: ['dark moody room', 'dimly lit interior'],
  },
  {
    id: 'warmlight',
    group: 'Light',
    match: ['warm light', 'golden', 'candle', 'lamplight', 'lamp light', 'ambient light', 'glow'],
    queries: ['warm lamp lit room evening', 'golden hour interior'],
  },

  // ---- colour ------------------------------------------------------------
  {
    id: 'white',
    group: 'Colour',
    match: ['white wall', 'all-white', 'white interior', 'white room', 'crisp white', 'whitewashed'],
    queries: ['all white interior', 'white walls room'],
  },
  {
    id: 'neutral',
    group: 'Colour',
    match: ['neutral', 'beige', 'greige', 'taupe', 'cream', 'ivory', 'off-white', 'muted tone'],
    queries: ['neutral beige interior', 'cream toned room'],
  },
  {
    id: 'colourful',
    group: 'Colour',
    match: ['colorful', 'colourful', 'vibrant', 'vivid', 'multicolor', 'multicoloured', 'rainbow', 'bright colors', 'bright colours'],
    queries: ['colorful vibrant interior', 'bright coloured room'],
  },
  {
    id: 'pastel',
    group: 'Colour',
    match: ['pastel', 'soft pink', 'blush', 'mint green', 'lilac', 'powder blue', 'soft hues'],
    queries: ['pastel interior', 'soft pink room'],
  },
  {
    id: 'monochrome',
    group: 'Colour',
    match: ['monochrome', 'black and white', 'grayscale', 'greyscale', 'black-and-white'],
    queries: ['black and white interior', 'monochrome room'],
  },
  {
    id: 'earthy',
    group: 'Colour',
    match: ['earth tone', 'earthy', 'terracotta', 'ochre', 'clay', 'sand', 'rust', 'tan', 'brown tone'],
    queries: ['earthy terracotta interior', 'warm earth tone room'],
  },
  {
    id: 'greenery',
    group: 'Colour',
    match: ['green wall', 'sage', 'emerald', 'forest green', 'olive', 'mint'],
    queries: ['green interior walls', 'sage green room'],
  },
  {
    id: 'blue',
    group: 'Colour',
    match: ['blue', 'navy', 'teal', 'turquoise', 'indigo', 'cobalt'],
    queries: ['blue interior', 'navy walls room'],
  },

  // ---- material ----------------------------------------------------------
  {
    id: 'wood',
    group: 'Material',
    match: ['wood', 'wooden', 'timber', 'oak', 'walnut', 'teak', 'pine', 'bamboo', 'plywood'],
    queries: ['wooden interior', 'timber clad room'],
  },
  {
    id: 'stone',
    group: 'Material',
    match: ['stone', 'marble', 'granite', 'travertine', 'quartz', 'slate', 'limestone'],
    queries: ['marble interior', 'stone walls room'],
  },
  {
    id: 'concrete',
    group: 'Material',
    match: ['concrete', 'cement', 'microcement'],
    queries: ['concrete interior', 'polished concrete room'],
  },
  {
    id: 'metal',
    group: 'Material',
    match: ['metal', 'steel', 'brass', 'gold accent', 'copper', 'chrome', 'iron', 'aluminium', 'aluminum'],
    queries: ['brass accents interior', 'black steel frame room'],
  },
  {
    id: 'glass',
    group: 'Material',
    match: ['glass', 'mirror', 'mirrored', 'glazed', 'glass partition'],
    queries: ['glass and mirror interior', 'glass partition room'],
  },
  {
    id: 'brick',
    group: 'Material',
    match: ['brick', 'brickwork'],
    queries: ['exposed brick interior', 'brick wall room'],
  },
  {
    id: 'tile',
    group: 'Material',
    match: ['tile', 'tiled', 'mosaic', 'subway tile', 'terrazzo', 'checkerboard'],
    queries: ['tiled interior', 'patterned tile floor room'],
  },
  {
    id: 'textile',
    group: 'Material',
    match: ['linen', 'wool', 'velvet', 'cotton', 'fabric', 'upholstered', 'rug', 'cushion', 'throw', 'curtain', 'drape'],
    queries: ['soft textiles layered room', 'velvet upholstered interior'],
  },
  {
    id: 'leather',
    group: 'Material',
    match: ['leather'],
    queries: ['leather sofa interior', 'leather armchair room'],
  },
  {
    id: 'rattan',
    group: 'Material',
    match: ['rattan', 'wicker', 'cane', 'jute', 'macrame', 'woven'],
    queries: ['rattan furniture interior', 'woven natural fibre room'],
  },

  // ---- mood --------------------------------------------------------------
  {
    id: 'cozy',
    group: 'Mood',
    match: ['cozy', 'cosy', 'snug', 'inviting', 'comfortable', 'comfy', 'homely', 'homey', 'warm and'],
    queries: ['cozy inviting room', 'snug comfortable interior'],
  },
  {
    id: 'calm',
    group: 'Mood',
    match: ['calm', 'serene', 'tranquil', 'peaceful', 'zen', 'relaxing', 'restful', 'soothing'],
    queries: ['calm serene interior', 'peaceful zen room'],
  },
  {
    id: 'elegant',
    group: 'Mood',
    match: ['elegant', 'sophisticated', 'refined', 'stylish', 'chic', 'tasteful'],
    queries: ['elegant refined interior', 'chic stylish room'],
  },
  {
    id: 'luxurious',
    group: 'Mood',
    match: ['luxury', 'luxurious', 'opulent', 'lavish', 'upscale', 'high-end', 'glamorous', 'penthouse'],
    queries: ['luxurious opulent interior', 'high end penthouse room'],
  },
  {
    id: 'playful',
    group: 'Mood',
    match: ['playful', 'fun', 'quirky', 'whimsical', 'cheerful', 'lively'],
    queries: ['playful quirky interior', 'fun cheerful room'],
  },
  {
    id: 'dramatic',
    group: 'Mood',
    match: ['dramatic', 'striking', 'bold', 'statement', 'theatrical'],
    queries: ['dramatic bold interior', 'striking statement room'],
  },
  {
    id: 'livedin',
    group: 'Mood',
    match: ['lived-in', 'lived in', 'personal', 'family', 'everyday', 'well-loved', 'character'],
    queries: ['lived in family home interior', 'personal cluttered room'],
  },

  // ---- space -------------------------------------------------------------
  {
    id: 'minimal',
    group: 'Space',
    match: ['minimal', 'minimalist', 'minimalistic', 'simple', 'clean line', 'uncluttered', 'sparse', 'pared'],
    queries: ['minimal uncluttered interior', 'simple clean lines room'],
  },
  {
    id: 'spacious',
    group: 'Space',
    match: ['spacious', 'open plan', 'open-plan', 'airy', 'roomy', 'expansive', 'high ceiling', 'double height'],
    queries: ['spacious open plan interior', 'high ceiling airy room'],
  },
  {
    id: 'compact',
    group: 'Space',
    match: ['small', 'compact', 'tiny', 'studio apartment', 'narrow', 'space-saving', 'petite'],
    queries: ['small compact apartment interior', 'tiny space clever storage'],
  },
  {
    id: 'layered',
    group: 'Space',
    match: ['cluttered', 'layered', 'filled with', 'packed', 'collection of', 'lots of', 'abundant', 'crowded'],
    queries: ['layered maximal interior lots of objects', 'shelves full of books room'],
  },

  // ---- character ---------------------------------------------------------
  {
    id: 'modern',
    group: 'Character',
    match: ['modern', 'contemporary'],
    queries: ['modern contemporary interior', 'sleek modern room'],
  },
  {
    id: 'vintage',
    group: 'Character',
    match: ['vintage', 'retro', 'antique', 'old-fashioned', 'classic', 'mid-century', 'nostalgic', 'heritage'],
    queries: ['vintage retro interior', 'antique furniture room'],
  },
  {
    id: 'rustic',
    group: 'Character',
    match: ['rustic', 'farmhouse', 'weathered', 'reclaimed', 'rough', 'rural', 'cabin', 'barn'],
    queries: ['rustic weathered interior', 'reclaimed wood cabin room'],
  },
  {
    id: 'ornate',
    group: 'Character',
    match: ['ornate', 'decorative', 'carved', 'intricate', 'moulding', 'molding', 'gilded', 'baroque', 'chandelier'],
    queries: ['ornate decorative interior', 'chandelier moulding room'],
  },
  {
    id: 'raw',
    group: 'Character',
    match: ['exposed', 'raw', 'unfinished', 'pipe', 'warehouse', 'loft', 'industrial', 'utilitarian'],
    queries: ['raw unfinished loft interior', 'exposed pipes warehouse room'],
  },
  {
    id: 'artsy',
    group: 'Character',
    match: ['art', 'artwork', 'painting', 'gallery', 'sculpture', 'poster', 'abstract', 'frame'],
    queries: ['interior with artwork gallery wall', 'sculptural art in room'],
  },

  // ---- nature ------------------------------------------------------------
  {
    id: 'plants',
    group: 'Nature',
    match: ['plant', 'greenery', 'foliage', 'houseplant', 'cactus', 'cacti', 'botanical', 'flower', 'succulent', 'palm'],
    queries: ['interior full of plants', 'houseplants living room'],
  },
  {
    id: 'view',
    group: 'Nature',
    match: ['view', 'scenic', 'overlooking', 'terrace', 'balcony', 'garden', 'outdoor', 'ocean', 'mountain'],
    queries: ['room with scenic view', 'interior opening onto terrace'],
  },

  // ---- form --------------------------------------------------------------
  {
    id: 'curved',
    group: 'Form',
    match: ['curved', 'curve', 'arch', 'arched', 'round', 'circular', 'organic shape', 'rounded'],
    queries: ['curved arched interior', 'rounded organic shapes room'],
  },
  {
    id: 'geometric',
    group: 'Form',
    match: ['geometric', 'angular', 'linear', 'grid', 'striped', 'symmetrical', 'rectangular'],
    queries: ['geometric angular interior', 'strong lines symmetrical room'],
  },
  {
    id: 'patterned',
    group: 'Form',
    match: ['pattern', 'patterned', 'floral', 'print', 'wallpaper', 'motif', 'ornamental'],
    queries: ['patterned wallpaper interior', 'floral print room'],
  },
  {
    id: 'sleek',
    group: 'Form',
    match: ['sleek', 'polished', 'glossy', 'smooth', 'seamless', 'handleless', 'streamlined'],
    queries: ['sleek glossy interior', 'seamless handleless kitchen'],
  },
]

export const ATTRIBUTE_IDS = ATTRIBUTES.map((a) => a.id)

/**
 * Builds one word-boundary regex per attribute. Boundaries matter: without them
 * "art" matches "apartment" and "cane" matches "hurricane".
 */
export function attributeMatchers() {
  return ATTRIBUTES.map((attr) => {
    const alts = attr.match
      .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length)
      .join('|')
    return { id: attr.id, re: new RegExp(`(?<![a-z])(?:${alts})(?![a-z])`, 'i') }
  })
}

/** Attribute ids matched by a caption. */
export function tagsFor(text, matchers = attributeMatchers()) {
  const haystack = String(text ?? '').toLowerCase()
  return matchers.filter((m) => m.re.test(haystack)).map((m) => m.id)
}

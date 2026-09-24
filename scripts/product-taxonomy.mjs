// Shared taxonomy for the product axes, used by scripts/harvest-products.mjs and
// mirrored in src/data/product-taxonomy.ts. As with scripts/taxonomy.mjs, the ids are
// the contract between the catalog and the engine — scripts/test-engine.mjs asserts the
// two copies agree.
//
// Three axes, none of which the room taxonomy has:
//
//   CATEGORIES — what the thing *is* (sofa, pendant lamp, rug). Replaces `rooms`, which
//                means nothing for an object.
//   MATERIALS  — what it's made of.
//   COLOURS    — what colour it is.
//
// Materials and colours are not inferred. IKEA's search API exposes them as facets with
// numeric ids that are identical in every market (`10003` is beige in at/de, hu/hu and
// gb/en alike), so the harvester reads them off the retailer rather than guessing from a
// product name. `ikeaIds` below is that mapping, collapsing IKEA's 61 material values
// into the 15 a person would actually recognise as different.

/**
 * Query terms per market. The search query is what determines a product's category —
 * *not* the `filterClass` IKEA returns, for two reasons: it is absent entirely from the
 * hu/hu responses, and where present it is coarser than we want (a coffee table and a
 * side table are both `side tables`). `filterClass` is kept as a sanity check instead:
 * `expect` lists the classes a query should be returning, and the harvester reports when
 * a query drifts away from them, which is how a mistranslated term gets caught.
 */
export const PRODUCT_CATEGORIES = [
  // --- Seating
  { id: 'sofa', label: 'Sofa', group: 'Seating',
    q: { en: 'sofa', de: 'Sofa', hu: 'kanapé' }, expect: ['sofas', 'sofa beds'] },
  { id: 'armchair', label: 'Armchair', group: 'Seating',
    q: { en: 'armchair', de: 'Sessel', hu: 'fotel' }, expect: ['armchairs'] },
  { id: 'dining-chair', label: 'Dining chair', group: 'Seating',
    q: { en: 'dining chair', de: 'Esszimmerstuhl', hu: 'étkezőszék' }, expect: ['chairs'] },
  { id: 'stool', label: 'Stool', group: 'Seating',
    q: { en: 'stool', de: 'Hocker', hu: 'zsámoly' }, expect: ['stools', 'footstools', 'chairs'] },
  { id: 'bench', label: 'Bench', group: 'Seating',
    q: { en: 'bench', de: 'Sitzbank', hu: 'pad' }, expect: ['benches'] },
  { id: 'office-chair', label: 'Desk chair', group: 'Seating',
    q: { en: 'office chair', de: 'Schreibtischstuhl', hu: 'forgószék' }, expect: ['chairs'] },
  { id: 'bar-stool', label: 'Bar stool', group: 'Seating',
    q: { en: 'bar stool', de: 'Barhocker', hu: 'bárszék' }, expect: ['chairs', 'stools'] },

  // --- Tables
  { id: 'coffee-table', label: 'Coffee table', group: 'Tables',
    q: { en: 'coffee table', de: 'Couchtisch', hu: 'dohányzóasztal' }, expect: ['side tables'] },
  { id: 'side-table', label: 'Side table', group: 'Tables',
    q: { en: 'side table', de: 'Beistelltisch', hu: 'kisasztal' }, expect: ['side tables'] },
  { id: 'dining-table', label: 'Dining table', group: 'Tables',
    q: { en: 'dining table', de: 'Esstisch', hu: 'étkezőasztal' }, expect: ['tables'] },
  { id: 'desk', label: 'Desk', group: 'Tables',
    q: { en: 'desk', de: 'Schreibtisch', hu: 'íróasztal' }, expect: ['desks'] },

  // --- Storage
  { id: 'wardrobe', label: 'Wardrobe', group: 'Storage',
    q: { en: 'wardrobe', de: 'Kleiderschrank', hu: 'ruhásszekrény' }, expect: ['wardrobes'] },
  { id: 'bookcase', label: 'Bookcase', group: 'Storage',
    q: { en: 'bookcase', de: 'Bücherregal', hu: 'könyvespolc' },
    expect: ['bookcases and display cabinets', 'open storage solutions'] },
  { id: 'shelving', label: 'Shelving', group: 'Storage',
    q: { en: 'shelving unit', de: 'Regal', hu: 'polcos elem' },
    expect: ['open storage solutions', 'shelves', 'bookcases and display cabinets'] },
  { id: 'drawers', label: 'Chest of drawers', group: 'Storage',
    q: { en: 'chest of drawers', de: 'Kommode', hu: 'fiókos szekrény' }, expect: ['chest of drawers'] },
  { id: 'sideboard', label: 'Sideboard', group: 'Storage',
    q: { en: 'sideboard', de: 'Sideboard', hu: 'tálalószekrény' },
    expect: ['base cabinets', 'storage combinations', 'bookcases and display cabinets'] },
  { id: 'media-unit', label: 'TV unit', group: 'Storage',
    q: { en: 'tv bench', de: 'TV-Bank', hu: 'tv-állvány' }, expect: ['media furniture'] },
  { id: 'shoe-cabinet', label: 'Shoe cabinet', group: 'Storage',
    q: { en: 'shoe cabinet', de: 'Schuhschrank', hu: 'cipősszekrény' },
    expect: ['base cabinets', 'clothes and shoe racks', 'high cabinets'] },
  { id: 'storage-box', label: 'Storage box', group: 'Storage',
    // "Aufbewahrungsbox" returns 3412 — the term is too loose and drags in every
    // container IKEA sells. "Box" is narrower and returns the actual lidded boxes.
    q: { en: 'storage box', de: 'Box', hu: 'doboz tetővel' }, expect: ['boxes or baskets'] },
  { id: 'basket', label: 'Basket', group: 'Storage',
    q: { en: 'basket', de: 'Korb', hu: 'kosár' }, expect: ['boxes or baskets'] },

  // --- Beds
  { id: 'bed', label: 'Bed', group: 'Beds',
    q: { en: 'bed frame', de: 'Bettgestell', hu: 'ágykeret' }, expect: ['bed frames'] },

  // --- Lighting
  { id: 'pendant', label: 'Pendant lamp', group: 'Lighting',
    q: { en: 'pendant lamp', de: 'Hängeleuchte', hu: 'függőlámpa' }, expect: ['ceiling lamps'] },
  { id: 'floor-lamp', label: 'Floor lamp', group: 'Lighting',
    q: { en: 'floor lamp', de: 'Stehleuchte', hu: 'állólámpa' }, expect: ['floor lamps'] },
  { id: 'table-lamp', label: 'Table lamp', group: 'Lighting',
    q: { en: 'table lamp', de: 'Tischleuchte', hu: 'asztali lámpa' }, expect: ['table and work lamps'] },
  { id: 'wall-lamp', label: 'Wall lamp', group: 'Lighting',
    q: { en: 'wall lamp', de: 'Wandleuchte', hu: 'fali lámpa' }, expect: ['wall lamps'] },

  // --- Soft furnishing
  { id: 'rug', label: 'Rug', group: 'Soft furnishing',
    q: { en: 'rug', de: 'Teppich', hu: 'szőnyeg' }, expect: ['rugs'] },
  { id: 'curtain', label: 'Curtains', group: 'Soft furnishing',
    q: { en: 'curtains', de: 'Gardinen', hu: 'függöny' }, expect: ['curtains and blinds'] },
  { id: 'cushion', label: 'Cushion', group: 'Soft furnishing',
    q: { en: 'cushion cover', de: 'Kissenbezug', hu: 'párnahuzat' }, expect: ['cushion cover', 'cushions'] },
  { id: 'throw', label: 'Throw', group: 'Soft furnishing',
    q: { en: 'throw blanket', de: 'Tagesdecke', hu: 'takaró' }, expect: ['blankets', 'bedspreads'] },
  { id: 'bedding', label: 'Bedding', group: 'Soft furnishing',
    q: { en: 'bedding', de: 'Bettwäsche', hu: 'ágynemű' }, expect: ['bedlinen', 'sheets'] },

  // --- Decor
  { id: 'mirror', label: 'Mirror', group: 'Decor',
    // "tükör" alone returns 11 hits, nearly all mirrored *cabinets*; "falitükör" returns
    // 173 actual mirrors. Same trap in reverse for several of these terms — the counts
    // in `npm run harvest-products -- --dry` are the check.
    q: { en: 'mirror', de: 'Spiegel', hu: 'falitükör' }, expect: ['mirrors'] },
  { id: 'vase', label: 'Vase', group: 'Decor',
    q: { en: 'vase', de: 'Vase', hu: 'váza' }, expect: ['vases'] },
  { id: 'picture', label: 'Wall art', group: 'Decor',
    q: { en: 'wall art', de: 'Bild', hu: 'kép' }, expect: ['pictures'] },
  { id: 'frame', label: 'Picture frame', group: 'Decor',
    q: { en: 'picture frame', de: 'Bilderrahmen', hu: 'képkeret' }, expect: ['frames'] },
  { id: 'plant-pot', label: 'Plant pot', group: 'Decor',
    q: { en: 'plant pot', de: 'Blumentopf', hu: 'kaspó' }, expect: ['plant pots'] },
  { id: 'candle-holder', label: 'Candle holder', group: 'Decor',
    q: { en: 'candle holder', de: 'Kerzenhalter', hu: 'gyertyatartó' }, expect: ['candle holders', 'lanterns'] },
  { id: 'clock', label: 'Clock', group: 'Decor',
    // Hungarian "óra" is also the word for hour, and matches thermometers and timers.
    q: { en: 'wall clock', de: 'Wanduhr', hu: 'falióra' }, expect: ['clocks'] },
  { id: 'coat-rack', label: 'Coat rack', group: 'Decor',
    q: { en: 'coat rack', de: 'Garderobe', hu: 'fogas' }, expect: ['clothes and shoe racks', 'hooks and hangers'] },

  // --- Kitchen. Carcasses are deliberately absent: `base cabinets` and `wall cabinets`
  // are ~1850 products in Austria alone with no context photography, and every card
  // would read "METOD Base cabinet, white". IKEA models a kitchen as frame plus front,
  // and only the front carries the look.
  { id: 'kitchen-front', label: 'Kitchen front', group: 'Kitchen',
    q: { en: 'kitchen front', de: 'Tür Küche', hu: 'ajtó konyha' }, expect: ['doors and fronts'] },
  { id: 'kitchen-tap', label: 'Tap', group: 'Kitchen',
    q: { en: 'kitchen tap', de: 'Küchenarmatur', hu: 'konyhai csaptelep' }, expect: ['taps'] },
  { id: 'handle', label: 'Handles & knobs', group: 'Kitchen',
    q: { en: 'handle', de: 'Griff', hu: 'fogantyú' }, expect: ['handles and knobs'] },
  { id: 'kitchen-trolley', label: 'Kitchen trolley', group: 'Kitchen',
    q: { en: 'kitchen trolley', de: 'Küchenwagen', hu: 'konyhakocsi' }, expect: ['trolleys'] },

  // --- Bathroom
  { id: 'bathroom-cabinet', label: 'Bathroom cabinet', group: 'Bathroom',
    q: { en: 'bathroom cabinet', de: 'Badezimmerschrank', hu: 'fürdőszobaszekrény' },
    expect: ['high cabinets', 'base cabinets', 'wash-stands', 'mirror cabinets'] },
  { id: 'washbasin', label: 'Washbasin', group: 'Bathroom',
    q: { en: 'washbasin', de: 'Waschbecken', hu: 'mosdó' },
    expect: ['sink and wash basins', 'base cabinets', 'wash-stands'] },

  // --- Outdoor
  { id: 'outdoor-chair', label: 'Garden chair', group: 'Outdoor',
    // Hungarian "kerti szék" returns 1598 by also matching plain "szék".
    q: { en: 'outdoor chair', de: 'Gartenstuhl', hu: 'kültéri szék' },
    expect: ['chairs', 'armchairs'] },
  { id: 'outdoor-table', label: 'Garden table', group: 'Outdoor',
    q: { en: 'outdoor table', de: 'Gartentisch', hu: 'kerti asztal' }, expect: ['tables'] },
]

/**
 * IKEA's 61 MATERIAL facet values, collapsed to the 14 distinctions a person swiping
 * furniture would actually make. `attribute` links a material to the adjective axis the
 * room quiz already scores, so "you like wooden things" is one finding across both modes
 * rather than two unrelated ones. `match` is the fallback for products the facet pass
 * didn't reach — matched against the product's design text (`"Kelinge beige"`) and its
 * English image alt text.
 */
export const MATERIALS = [
  { id: 'solid-wood', label: 'Solid wood', attribute: 'wood',
    ikeaIds: ['50788', '50736', '47653', '49058'],
    match: ['solid wood', 'oak', 'birch', 'pine', 'beech', 'ash', 'walnut', 'bamboo', 'cork'],
    matchLocal: ['massivholz', 'holz', 'eiche', 'birke', 'kiefer', 'buche', 'esche', 'nussbaum', 'bambus', 'kork',
      'tömörfa', 'tölgy', 'nyír', 'fenyő', 'bükk', 'kőris', 'dió', 'bambusz', 'parafa'] },
  { id: 'veneer', label: 'Wood veneer', attribute: 'wood',
    ikeaIds: ['53958', '47349', '50676', '50996', '50713', '50956'],
    match: ['veneer', 'laminate', 'fibreboard', 'particleboard', 'melamine'],
    matchLocal: ['furnier', 'laminat', 'spanplatte', 'faserplatte', 'melamin',
      'furnér', 'laminált', 'forgácslap', 'farostlemez'] },
  { id: 'metal', label: 'Metal', attribute: 'metal',
    ikeaIds: ['47350', '32461', '32768', '50608', '51437'],
    match: ['metal', 'steel', 'aluminium', 'chrome', 'brass', 'zinc'],
    matchLocal: ['metall', 'stahl', 'chrom', 'messing', 'zink',
      'fém', 'acél', 'alumínium', 'króm', 'réz', 'horgany'] },
  { id: 'glass', label: 'Glass', attribute: 'glass',
    ikeaIds: ['47660', '51324'],
    match: ['glass', 'mirror glass'], matchLocal: ['glas', 'spiegelglas', 'üveg', 'tükörüveg'] },
  { id: 'stone', label: 'Stone & marble', attribute: 'stone',
    ikeaIds: ['54637', '51343', '50705'],
    match: ['marble', 'stone', 'quartz', 'terrazzo'],
    matchLocal: ['marmor', 'stein', 'quarz', 'márvány', 'kvarc', 'terrazzo'] },
  { id: 'ceramic', label: 'Ceramic', attribute: 'stone',
    ikeaIds: ['50606', '51545', '50708'],
    match: ['ceramic', 'stoneware', 'porcelain', 'earthenware'],
    matchLocal: ['keramik', 'steingut', 'porzellan', 'kerámia', 'kőagyag', 'porcelán'] },
  { id: 'rattan', label: 'Rattan & woven', attribute: 'rattan',
    ikeaIds: ['39393', '49057', '50350', '65910', '52941', '62219', '47477', '52653', '52817'],
    match: ['rattan', 'wicker', 'jute', 'seagrass', 'water hyacinth', 'paper cord', 'hemp', 'ramie'],
    matchLocal: ['korbgeflecht', 'geflecht', 'seegras', 'papierkordel', 'hanf',
      'fonott', 'juta', 'papírzsinór', 'kender'] },
  { id: 'leather', label: 'Leather', attribute: 'leather',
    ikeaIds: ['38829', '51733'],
    match: ['leather', 'cowhide'],
    matchLocal: ['leder', 'rindsleder', 'bőr'] },
  // Faux leather was inside `leather`, which flattered it: on a sofa the difference
  // between hide and coated fabric is most of the decision, and most of the price.
  { id: 'faux-leather', label: 'Faux leather', attribute: 'leather',
    ikeaIds: ['38830'],
    match: ['coated fabric', 'faux leather'],
    matchLocal: ['kunstleder', 'bevont szövet', 'műbőr'] },
  { id: 'velvet', label: 'Velvet', attribute: 'luxurious',
    ikeaIds: ['47494'], match: ['velvet'], matchLocal: ['samt', 'bársony'] },
  { id: 'wool', label: 'Wool & sheepskin', attribute: 'textile',
    ikeaIds: ['48361', '51735', '48347'],
    match: ['wool', 'sheepskin', 'fleece'],
    matchLocal: ['wolle', 'schaffell', 'gyapjú', 'birkabőr'] },
  { id: 'linen-cotton', label: 'Linen & cotton', attribute: 'textile',
    ikeaIds: ['48341', '47458', '54756', '54759', '54757', '55096'],
    match: ['linen', 'cotton'], matchLocal: ['leinen', 'baumwolle', 'pamut'] },
  // IKEA's catch-all "Fabric" covers most upholstery, so this is the single biggest
  // material bucket. Calling it "Synthetic textile" — as an earlier version did, by
  // folding facet 38828 in with polyester — was simply wrong: plenty of it is cotton.
  { id: 'fabric', label: 'Fabric', attribute: 'textile',
    ikeaIds: ['38828', '47692', '47490', '48360', '48270', '47488', '65648', '62218', '47472', '48362'],
    match: ['polyester', 'viscose', 'lyocell', 'rayon', 'synthetic', 'upholstered', 'fabric'],
    matchLocal: ['viskose', 'synthetik', 'gepolstert', 'stoff', 'poliészter', 'viszkóz', 'kárpitozott', 'szövet'] },
  { id: 'plastic', label: 'Plastic', attribute: 'sleek',
    ikeaIds: ['47675', '57822', '51379', '68007'],
    match: ['plastic', 'polypropylene', 'acrylic', 'silicone', 'rubber'],
    matchLocal: ['kunststoff', 'silikon', 'gummi', 'műanyag', 'szilikon'] },
  { id: 'paper', label: 'Paper', attribute: 'minimal',
    ikeaIds: ['51376', '49056'],
    match: ['paper', 'cardboard', 'rice paper'],
    matchLocal: ['papier', 'pappe', 'karton', 'papír'] },
]

/**
 * IKEA's COLOR facet, normalised. `tone` groups the palette into warm / cool / neutral
 * for the results screen — "you go for warm colours" is a more useful sentence than a
 * list of twelve swatches. `attribute` again links into the existing adjective axis
 * where one exists, so a colour swipe is also evidence for `greenery` or `white`.
 *
 * Two match lists because colour is the one axis where the facet is the *worse* source.
 * The COLOR facet is family-level: filtering armchairs by red returns EKENÄSET because
 * some EKENÄSET is red, even though the card shows the beige one. The product's own
 * design text — `"Kilanda light beige"`, `"Hakebo grey-green"` — names the exact variant
 * on the card, so that is read first and the facet is only the fallback.
 *
 * `match` reads the English (gb/en) design text; `matchLocal` reads at/de and hu/hu for
 * products outside the GB range. Twelve colour words per language is a list worth
 * maintaining by hand — unlike the 45-adjective lexicon, which is not.
 */
export const COLOURS = [
  { id: 'white', label: 'White', tone: 'neutral', hex: '#ffffff', ikeaIds: ['10156'], attribute: 'white',
    match: ['white'], matchLocal: ['weiß', 'weiss', 'fehér'] },
  { id: 'black', label: 'Black', tone: 'neutral', hex: '#1b1b1b', ikeaIds: ['10139'], attribute: 'monochrome',
    match: ['black', 'anthracite'], matchLocal: ['schwarz', 'anthrazit', 'fekete'] },
  { id: 'grey', label: 'Grey', tone: 'neutral', hex: '#949494', ikeaIds: ['10028'], attribute: 'neutral',
    match: ['grey', 'gray'], matchLocal: ['grau', 'szürke'] },
  { id: 'beige', label: 'Beige', tone: 'warm', hex: '#e2d7bf', ikeaIds: ['10003'], attribute: 'neutral',
    match: ['beige', 'off-white', 'sand'], matchLocal: ['beige', 'bézs', 'natur', 'natúr'] },
  { id: 'brown', label: 'Brown', tone: 'warm', hex: '#814820', ikeaIds: ['10019'], attribute: 'earthy',
    match: ['brown', 'walnut'], matchLocal: ['braun', 'barna'] },
  { id: 'green', label: 'Green', tone: 'cool', hex: '#3b7d22', ikeaIds: ['10033'], attribute: 'greenery',
    match: ['green', 'olive'], matchLocal: ['grün', 'gruen', 'zöld'] },
  { id: 'blue', label: 'Blue', tone: 'cool', hex: '#2f5f9e', ikeaIds: ['10007', '10152'], attribute: 'blue',
    match: ['blue', 'turquoise'], matchLocal: ['blau', 'türkis', 'kék', 'türkiz'] },
  { id: 'pink', label: 'Pink', tone: 'warm', hex: '#e59ab0', ikeaIds: ['10119', '10064'], attribute: 'pastel',
    match: ['pink', 'lilac', 'purple'], matchLocal: ['rosa', 'lila', 'rózsaszín'] },
  { id: 'red', label: 'Red', tone: 'warm', hex: '#c02a29', ikeaIds: ['10124'], attribute: 'colourful',
    match: ['red', 'burgundy'], matchLocal: ['rot', 'piros', 'vörös', 'bordó'] },
  { id: 'yellow', label: 'Yellow & orange', tone: 'warm', hex: '#e8a317', ikeaIds: ['10042', '10112'], attribute: 'colourful',
    match: ['yellow', 'orange', 'ochre'], matchLocal: ['gelb', 'orange', 'sárga', 'narancs'] },
  { id: 'metallic', label: 'Metallic', tone: 'neutral', hex: '#b9a36a', ikeaIds: ['10137', '10050'], attribute: 'metal',
    match: ['gold-colour', 'silver-colour', 'brass-colour', 'copper'], matchLocal: ['goldfarben', 'silberfarben', 'aranyszínű', 'ezüstszínű'] },
  { id: 'multi', label: 'Multicoloured', tone: 'warm', hex: '#8e6fb5', ikeaIds: ['10583', '10006'], attribute: 'colourful',
    match: ['multicolour', 'assorted colours', 'patterned'], matchLocal: ['mehrfarbig', 'bunt', 'többszínű', 'mintás'] },
]

export const PRODUCT_CATEGORY_IDS = PRODUCT_CATEGORIES.map((c) => c.id)
export const MATERIAL_IDS = MATERIALS.map((m) => m.id)
export const COLOUR_IDS = COLOURS.map((c) => c.id)

/** IKEA facet value id -> our id. Built once; an unknown facet id is simply ignored. */
export const IKEA_MATERIAL_BY_ID = new Map(
  MATERIALS.flatMap((m) => m.ikeaIds.map((ikeaId) => [ikeaId, m.id])),
)
export const IKEA_COLOUR_BY_ID = new Map(
  COLOURS.flatMap((c) => c.ikeaIds.map((ikeaId) => [ikeaId, c.id])),
)

/** The markets we harvest. `en` is not a shopping market — see harvest-products.mjs. */
export const MARKETS = [
  { id: 'at', path: 'at/de', lang: 'de', currency: 'EUR' },
  { id: 'hu', path: 'hu/hu', lang: 'hu', currency: 'HUF' },
]

/** The reference market: facets and English descriptive text are read from here only. */
export const REFERENCE_MARKET = { id: 'en', path: 'gb/en', lang: 'en' }

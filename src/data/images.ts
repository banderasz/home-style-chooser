// The image source sits behind this interface so the curated catalog can be swapped
// for a live API (Unsplash, Pexels, an internal service) without touching the quiz.

export interface HomeImage {
  id: string
  url: string
  thumbnail: string
  title: string
  /** Style tag ids from the taxonomy. Usually one, occasionally two when a photo
   *  was surfaced by more than one style query. */
  styles: string[]
  rooms: string[]
  /** Plain-adjective tags, written by scripts/tag-attributes.mjs. Typically 2-4. */
  attributes?: string[]
  creator: string
  creatorUrl: string | null
  source: string | null
  license: string
  licenseUrl: string | null
}

export interface ImageProvider {
  name: string
  /** Every image available to the quiz, already tagged. */
  load(): Promise<HomeImage[]>
}

interface CatalogFile {
  generatedBy: string
  source: string
  images: HomeImage[]
}

interface IgnoredFile {
  threshold: number
  votes: Record<string, number>
}

const LOCAL_IGNORE_KEY = 'home-style-chooser/ignored'

/** Photos this browser has flagged, so an ignore takes effect immediately. */
export function localIgnored(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_IGNORE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

/**
 * Un-hide everything this browser flagged.
 *
 * The Ignore button has two effects and only one of them is reversible from here: the
 * local list below, which hides a photo for you immediately, and a vote towards retiring
 * it for everyone. Clearing the local list is the useful half — a photo you ignored by
 * accident, or changed your mind about, comes straight back.
 */
export function clearLocalIgnored() {
  try {
    localStorage.removeItem(LOCAL_IGNORE_KEY)
  } catch {
    // Private mode — there was nothing stored to clear.
  }
}

export function rememberIgnored(id: string) {
  try {
    const all = localIgnored()
    all.add(id)
    localStorage.setItem(LOCAL_IGNORE_KEY, JSON.stringify([...all]))
  } catch {
    // Private mode — the ignore still applies for this session.
  }
}

/** The server's current vote file, or null when there's no server behind the app. */
async function liveIgnored(): Promise<IgnoredFile | null> {
  try {
    const res = await fetch('/__ignore', { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const body = (await res.json()) as IgnoredFile
    return body && typeof body.threshold === 'number' ? body : null
  } catch {
    return null
  }
}

/**
 * Records a "wrong image" vote with the dev server, which writes it to
 * src/data/ignored.json. Once a photo reaches the threshold it is dropped from the
 * catalog for everyone. In a production build there is no endpoint and this is a no-op
 * beyond the local record.
 */
export async function voteIgnore(id: string): Promise<{ votes: number; retired: boolean } | null> {
  rememberIgnored(id)
  try {
    const res = await fetch('/__ignore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) return null
    return (await res.json()) as { votes: number; retired: boolean }
  } catch {
    return null
  }
}

/**
 * Reads the catalog produced by `npm run harvest`. It is imported lazily so the
 * JSON is a separate chunk and the intro screen paints before it is parsed.
 */
export const curatedProvider: ImageProvider = {
  name: 'curated',
  async load() {
    const [catalogMod, ignoredMod] = await Promise.all([
      import('./catalog.json') as unknown as Promise<{ default: CatalogFile }>,
      import('./ignored.json') as unknown as Promise<{ default: IgnoredFile }>,
    ])
    const catalog = catalogMod.default ?? (catalogMod as unknown as CatalogFile)
    const bundled = ignoredMod.default ?? (ignoredMod as unknown as IgnoredFile)
    // The bundled copy is frozen at build time. Where a server is serving the live vote
    // file, prefer it, so a photo retired after the last deploy disappears right away.
    const ignored = (await liveIgnored()) ?? bundled

    // Retired for everyone once enough people flagged it, plus anything this browser
    // flagged but that hasn't reached the threshold yet.
    const retired = new Set(
      Object.entries(ignored.votes ?? {})
        .filter(([, n]) => n >= (ignored.threshold ?? 3))
        .map(([id]) => id),
    )
    const mine = localIgnored()

    return catalog.images.filter(
      (i) =>
        // An attribute-only photo carries no style tag but is still useful evidence.
        (i.styles.length > 0 || (i.attributes?.length ?? 0) > 0) &&
        !retired.has(i.id) &&
        !mine.has(i.id),
    )
  },
}

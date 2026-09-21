# Home Style Chooser

A swipe-based quiz that works out which interior styles someone actually likes. Web and
mobile from one codebase — a responsive PWA you can install on a phone home screen.

## How it works

Two rounds, by design:

1. **Round 1 — broad.** One card from every style the catalog can illustrate (23), plus a
   few chosen purely to cover adjectives the style cards missed (8) — ~31 cards,
   interleaved so the same style never appears twice in a row. Cards-per-style is derived
   from a target deck size, so adding styles widens the sample instead of lengthening the
   quiz.
2. **Round 2 — deep.** The top four styles get four more cards each (16 cards) to confirm
   them and break ties. Round-2 answers carry more weight than round-1 answers.

## Two tag axes

Every photo carries tags on two independent axes, plus a room:

- **Styles** — 23 named design styles (`scandinavian`, `japandi`, `brutalist`,
  `frenchcountry`, …). One or two per photo. These come from the search query that found
  the photo.
- **Attributes** — 45 plain adjectives in 8 groups (`bright`, `wooden`, `cosy`, `cluttered`,
  `curved`, `plant-filled`, …). Typically 2-4 per photo, matched from the photo's caption
  by the lexicon in `scripts/attributes.mjs`.

Liking a photo is evidence for all of its tags at once, which is how a ~31-card deck says
something useful about 45 attributes. The round-1 deck is built by **weighted set cover**:
for each style it samples a photo with probability weighted by how many adjectives it
adds that the deck hasn't shown, then tops up with photos chosen purely for coverage.

Sampling rather than taking the best matters. A strict argmax is deterministic, so every
session served the same "optimal" photos and the quiz felt repetitive on replay. Weighting
costs a little coverage (45 → 39 attributes worst-case) and cuts deck overlap between
sessions to ~6%. Both numbers are asserted by `npm test` against the real catalog.

The top-up matters for a second reason: photos the harvester found by adjective carry no
style tag, so without it 42% of the catalog would never be shown, and adjectives that only
live on those photos (`pastel`, `lived-in`, `green`) would never be scored at all.

Tags with no photos are skipped rather than scored on a prior, so a partially-harvested
catalog still produces an honest ranking.

The adjective axis is what makes the result readable: "bright, wooden, calm — not dark,
not cluttered" says more to most people than "Japandi".

Scoring per style, in `src/engine/quiz.ts`:

```
rate       = (liked + 1) / (seen + 2.5)        # Laplace-smoothed liking rate
confidence = seen / (seen + 3)                 # how much evidence we have
rank       = rate * (0.55 + 0.45 * confidence) # a high rate off two cards outranks nothing
```

A photo tagged with two styles splits its evidence between them, so a card that reads as
two things at once doesn't over-credit either.

The result screen leads with the winning style, then the adjectives you're drawn to and
the ones that put you off (paired into "bright, not dark" where an opposite exists), then
every style ranked, the rooms you responded to, and a gallery of every photo you liked.

## Running it

```bash
npm install
npm run harvest        # build the image catalog (see below) — required once
npm run dev            # http://localhost:5173, also served on your LAN IP for a phone
```

If `npm install` fails with a network error, your npm registry is pointed at an internal
mirror that isn't reachable; use `npm install --registry=https://registry.npmjs.org/`.

Other scripts:

| Command                   | What it does                                            |
| ------------------------- | ------------------------------------------------------- |
| `npm run harvest`         | Fetch and style-tag photos into `src/data/catalog.json`  |
| `npm run tag`             | Re-derive the adjective tags from photo captions (no API) |
| `npm run prune`           | Drop greyscale, non-room and Ignore-flagged photos       |
| `npm run verify-catalog`  | Drop catalog entries whose URL no longer resolves        |
| `npm test`                | 36 assertions over the engine and the lexicon             |
| `npm run typecheck`       | `tsc --noEmit`                                           |
| `npm run build`           | Typecheck + production build to `dist/`                  |

## The image catalog

Images come from an external search API, one query per (style × room) pair, so each photo
inherits the tags of the query that found it. Pick a provider:

```bash
# Pexels — best photo quality for interiors. Free key: https://www.pexels.com/api/
PEXELS_API_KEY=xxx npm run harvest -- --provider pexels

# Unsplash — free key: https://unsplash.com/developers (demo keys allow 50 req/hour)
UNSPLASH_ACCESS_KEY=xxx npm run harvest -- --provider unsplash

# Openverse — no key needed, CC-licensed, but heavily rate-limited and noisier
npm run harvest -- --provider openverse
```

The harvest is **resumable**: results are flushed after every query and completed queries
are recorded, so if you get rate-limited just run it again later.

**Rate limits.** The Pexels free tier allows 200 requests/hour. A full run is 183 queries
(23 styles × 6 rooms, plus one phrasing per adjective), which fits in one window — that's
why photos-per-query defaults to 10 rather than the request count going up. The harvester
reads the provider's `X-Ratelimit-*` headers, so when it does run out it reports the real
reset time and stops cleanly instead of backing off in seconds against an hourly window.
Add `--wait` to sleep through the window and continue unattended.

| Flag | Effect |
| --- | --- |
| `--wait` | Sleep until the quota window resets rather than stopping |
| `--per N` | Photos kept per query (default 10) |
| `--attr-queries N` | Search phrasings per adjective (default 1; 2 needs a second window) |
| `--axis styles\|attributes` | Run only one axis |
| `--refresh a,b` | Drop those styles' photos and re-run their queries |
| `--reset` | Start the catalog from scratch |

**Rejected photos are remembered.** Pruning clears the resume markers so the gaps refill,
which on its own would re-fetch the same rejects forever. `npm run prune -- --apply`
writes every dropped URL to `src/data/rejected.json` and the harvester skips them. That
file isn't imported by the app, so it never reaches the bundle.

By default it runs both axes: one query per (style × room), plus two queries per
adjective to top up attributes the caption lexicon leaves thin. `--axis styles` or
`--axis attributes` runs just one.

Then derive the adjective tags and prune anything that 404s:

```bash
npm run tag             # reads captions, writes `attributes` on every photo
npm run verify-catalog
```

`npm run tag` makes no network calls and is idempotent — edit the lexicon in
`scripts/attributes.mjs` and re-run it as often as you like. It prints per-attribute
counts and flags any adjective with fewer than 6 photos.

`npm run verify-catalog` warns about any style left with fewer than 8 photos — that's the
point where round 2 runs out of fresh cards for that style.

## Bad photos

Three mechanisms, in order of how much judgement they need:

**`npm run prune`** — automatic. Three rules:

- *Greyscale.* A black-and-white photo says nothing about a room's palette, so every
  colour adjective it carries is noise. Detected from the pixels (mean HSV saturation of
  the thumbnail), not the caption, because most filtered photos aren't labelled as such.
  The cut is `0.03` — essentially zero. An all-white or greige *room* only reaches
  0.03–0.12 and is a real colour photo, so it stays. `--report` prints the histogram the
  threshold was picked from.
- *Not a room.* Two rules. A caption must **name a room or a home** somewhere — without
  that it's Flickr noise (`Gauze`, `N1_02146`, `Magic Underwear`) or a product/texture
  shot the adjective queries dragged in (`Vintage wallpaper with vertical stripes`). And
  captions mentioning people, close-ups, exteriors or commercial spaces are rejected
  outright. The reject lists are deliberately narrow — `lady` (lady palm), `model` (model
  home), `hands` (hand-crafted) and `family` (family room) all produced false positives
  on real interiors and were removed.
- *Close-ups the caption doesn't admit to.* Most bad photos aren't labelled "close-up
  of" — they're `Illuminated lamp on nightstand`, `Elegant ceramic vase with dried
  flowers`. So this one reads the pixels. `scripts/roominess.mjs` scores structure:
  `edgeDensity / 100 - flatFraction`. A room is busy everywhere and has little flat area;
  a close-up is mostly one smooth surface with its subject centre-frame. Two other
  candidate metrics, `centreBias` and `longLines`, showed no separation (d=0.13 and
  d=-0.04) and are measured but unused.

  Run `node scripts/roominess.mjs` to re-derive the threshold. It validates against weak
  caption labels and prints operating points:

  ```
  keep full     drop close-up   threshold
  99          %             8%      -0.195
  97          %            24%       0.051   <- ROOMINESS_CUT
  95          %            32%       0.164
  ```

  AUC is 0.734 — useful, not decisive — so the shipped cut is the conservative one:
  keeps 97% of genuine room photos, removes a quarter of the close-ups captions missed.
  Override with `--min-roominess 0.164`, or skip the rule with `--keep-closeups`. Photos
  whose thumbnail wouldn't decode are **kept** — no measurement is no evidence.

Run it dry first; it prints counts and examples and changes nothing until `--apply`.
Saturation and roominess are cached in the catalog (one decode per photo produces both),
so re-runs after the first are instant. First pass over the existing catalog dropped 106
of 2135 photos (5.0%).

**The Ignore button** — manual, in the app. Drops a photo you're looking at without
recording a preference (a skip must never become evidence — you're judging the photo, not
the room), and replaces it with another carrying the same tags so the style doesn't lose
its slot. It also POSTs a vote to the dev server, which writes `src/data/ignored.json`.
At 3 votes the photo is retired for **everyone**: the file is imported by the app, so it
drops out of every build and every device. There's no backend — the dev server is the
only writer, and in a production build votes fall back to localStorage. `npm run prune`
then deletes retired photos from the catalog for good.

**Votes live on the server, not in the repo.** `src/data/ignored.json` is only the seed
copy baked into the image; the file the deployment actually writes is in the mounted
volume. Pull it back before pruning, or `npm run prune` acts on a stale vote list:

```bash
scp andras@homeserver:~/home-style-chooser/data/ignored.json src/data/ignored.json
npm run prune          # dry run, now with the real votes
```

**Vision tagging** — not built. The caption lexicon and these heuristics can't tell a
styled room from a cluttered one, or catch a mistagged style. A vision pass over the
catalog would; see the note in the conversation history.

### About Pinterest

Pinterest was the original idea, but its public API doesn't expose pin search or browsing
for arbitrary content, and scraping it breaks their terms of service. The providers above
are the closest legitimate substitutes. `ImageProvider` in `src/data/images.ts` is the
seam to implement if you ever get proper access to another source.

## Deploying

Runs as a container behind a Cloudflare Tunnel:

```bash
git clone https://github.com/banderasz/home-style-chooser.git
cd home-style-chooser
docker compose up -d --build

# the app is on :8071; expose it through the tunnel
cd ~/cloudflared && ./publish_service.py homestyle --port 8071
```

`docker compose` first-run gotcha: the container runs as the unprivileged `node` user
(uid 1000), but Docker creates the bind-mounted `data/` directory as root, so the vote
file can't be written and the container restart-loops. Fix it once:

```bash
docker run --rm -v "$PWD/data:/d" alpine chown -R 1000:1000 /d
```

The catalog is bundled at build time, so a prune or a harvest only reaches the live site
after a rebuild:

```bash
ssh andras@homeserver 'cd ~/home-style-chooser && git pull && docker compose up -d --build'
```

`server.mjs` serves the built bundle and keeps `/__ignore` alive in production. Without
it a static deploy would silently downgrade the Ignore button to a per-browser
localStorage list — the "retire a photo for everyone" behaviour needs somewhere to write.
Votes live in the mounted `data/` volume, seeded on first boot from the copy in the image,
so they survive rebuilds. The app reads the live file at startup rather than only the
build-time copy, so a retired photo disappears without a redeploy.

## Layout

```
scripts/
  taxonomy.mjs        styles + room queries used to build the catalog
  attributes.mjs      the 45-adjective lexicon: caption patterns + search phrasings
  harvest.mjs         multi-provider, resumable catalog builder
  tag-attributes.mjs  derives the adjective axis from photo captions
  prune-catalog.mjs   drops photos that are bad as quiz cards
  roominess.mjs       whole-room-vs-close-up score, and its validation CLI
  verify-catalog.mjs  drops dead image URLs
  test-engine.mjs     engine tests (transpiles the TS and runs assertions)
src/
  data/taxonomy.ts    the 23 styles, 45 attributes and 6 rooms, with display copy
  data/images.ts      ImageProvider interface + the curated catalog loader
  engine/quiz.ts      deck building, phase transitions, scoring — all pure functions
  components/         Intro, Deck, SwipeCard, Results
  App.tsx             screen state and localStorage session persistence
server.mjs            production static server + the /__ignore vote endpoint
Dockerfile            two-stage build; runtime has no npm dependencies
```

The engine is pure and UI-free: the React layer holds a `QuizState`, calls `answer()`, and
renders what comes back. A session is persisted by saving the seed plus the list of
verdicts and replaying them, so there's one source of truth for the deck.

## Interaction

Drag or flick a card, tap the ✕ / ♥ buttons, or use ← and → on a keyboard. Backspace
undoes the last card within the current round; `x` ignores an unusable photo. After 10
cards you can bail out early and still get a ranking.

The **tags** toggle in the header overlays each photo's style, room and adjectives. It
defaults to off, because seeing "Art Deco" before you swipe means partly rating the label
rather than the room. Turn it on to check how the catalog is tagged, off for a real run.

## Tuning

`DEFAULT_CONFIG` in `src/engine/quiz.ts`:

| Option            | Default | Meaning                                       |
| ----------------- | ------- | --------------------------------------------- |
| `phase1Cards`     | 28      | Target round-1 deck size; per-style count is derived from it |
| `phase1MinPerStyle` / `phase1MaxPerStyle` | 1 / 3 | Bounds on the derived per-style count |
| `phase1AttributeCards` | 8 | Extra round-1 cards picked purely for adjective coverage |
| `phase2Focus`     | 4       | How many styles round 2 drills into            |
| `phase2PerStyle`  | 4       | Extra cards per focused style                  |
| `phase2MinRate`   | 0.34    | Liking rate a style must clear to be drilled   |
| `phase2Weight`    | 1.25    | Extra weight on round-2 answers                |

Adding a style means adding it to **both** `scripts/taxonomy.mjs` (with search phrasings)
and `src/data/taxonomy.ts` (with display copy), then re-running the harvest.

Adding an adjective means adding it to **both** `scripts/attributes.mjs` (caption patterns
+ search phrasings) and `ATTRIBUTES` in `src/data/taxonomy.ts` (label + group), then
running `npm run tag`. No re-harvest needed unless the new adjective comes out thin.
`npm test` fails if the two id sets drift apart.

#!/usr/bin/env node
// Production server: serves the built app and keeps the /__ignore endpoint alive.
//
// The dev server implements /__ignore as a Vite plugin, which disappears in a static
// build — and with it the "flag a bad photo for everyone" behaviour, silently degrading
// to a per-browser localStorage list. This is the same endpoint for deployment.
//
//   PORT=8071 DATA_DIR=/app/data node server.mjs
//
// Votes live in DATA_DIR/ignored.json (a mounted volume), not in the image, so they
// survive redeploys. On first boot the file is seeded from the bundled copy.

import { createReadStream } from 'node:fs'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(ROOT, process.env.DIST_DIR ?? 'dist')
const DATA_DIR = resolve(ROOT, process.env.DATA_DIR ?? 'data')
const VOTES = join(DATA_DIR, 'ignored.json')
const PORT = Number(process.env.PORT ?? 8071)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function readVotes() {
  try {
    return JSON.parse(await readFile(VOTES, 'utf8'))
  } catch {
    return { threshold: 3, votes: {} }
  }
}

/** Seed the volume from the copy baked into the image, the first time we boot. */
async function initVotes() {
  await mkdir(DATA_DIR, { recursive: true })
  try {
    await stat(VOTES)
  } catch {
    let seed = { threshold: 3, votes: {} }
    try {
      seed = JSON.parse(await readFile(resolve(ROOT, 'src/data/ignored.json'), 'utf8'))
    } catch {
      // No bundled copy — start empty.
    }
    await writeFile(VOTES, `${JSON.stringify(seed, null, 2)}\n`)
  }
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type })
  res.end(body)
}

async function handleVote(req, res) {
  if (req.method !== 'POST') return send(res, 405, '{"error":"POST only"}')

  let body = ''
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > 4096) req.destroy() // a vote is a small JSON object
  })
  req.on('end', async () => {
    try {
      const { id } = JSON.parse(body)
      if (typeof id !== 'string' || !id) throw new Error('bad id')

      const file = await readVotes()
      file.votes[id] = (file.votes[id] ?? 0) + 1
      await writeFile(VOTES, `${JSON.stringify(file, null, 2)}\n`)

      const votes = file.votes[id]
      const retired = votes >= file.threshold
      console.log(`ignore: ${id} -> ${votes}/${file.threshold}${retired ? ' — retired' : ''}`)
      send(res, 200, JSON.stringify({ votes, threshold: file.threshold, retired }))
    } catch (err) {
      send(res, 400, JSON.stringify({ error: String(err) }))
    }
  })
}

/**
 * The app bundles ignored.json at build time, so a vote cast after the build wouldn't
 * take effect until a redeploy. Serving the live file here lets the running app pick up
 * retirements immediately.
 */
async function handleVoteList(res) {
  send(res, 200, JSON.stringify(await readVotes()))
}

async function serveStatic(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  // normalize() collapses "..", and the prefix check rejects anything that escaped DIST.
  let path = resolve(DIST, `.${normalize(url.pathname)}`)
  if (!path.startsWith(DIST)) return send(res, 403, 'forbidden', 'text/plain')

  try {
    const info = await stat(path)
    if (info.isDirectory()) path = join(path, 'index.html')
  } catch {
    // Unknown path: hand it to the SPA rather than 404ing.
    path = join(DIST, 'index.html')
  }

  const type = MIME[extname(path)] ?? 'application/octet-stream'
  // Hashed asset filenames are immutable; index.html must never be cached.
  const cache = path.includes(`${join(DIST, 'assets')}`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
  res.writeHead(200, { 'content-type': type, 'cache-control': cache })
  createReadStream(path).pipe(res)
}

await initVotes()

createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  if (path === '/__ignore') {
    if (req.method === 'GET') return void handleVoteList(res)
    return void handleVote(req, res)
  }
  if (path === '/healthz') return send(res, 200, '{"ok":true}')
  void serveStatic(req, res)
}).listen(PORT, () => {
  console.log(`home-style-chooser on :${PORT} (votes in ${VOTES})`)
})

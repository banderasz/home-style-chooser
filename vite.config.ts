import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// This config is ESM, so __dirname doesn't exist.
const IGNORED = resolve(dirname(fileURLToPath(import.meta.url)), 'src/data/ignored.json')

/**
 * Collects "wrong image" votes into src/data/ignored.json during `npm run dev`.
 *
 * This is what makes an ignore stick *for everyone* rather than just in one browser:
 * the file is on disk and is imported by the app, so once a photo reaches the vote
 * threshold it drops out of the catalog for every build and every device. There is no
 * backend here — the dev server is the only writer. In a production build the endpoint
 * doesn't exist, votes fall back to localStorage, and the shipped ignored.json is
 * whatever was committed.
 */
function ignoreVotes(): Plugin {
  return {
    name: 'home-style-chooser:ignore-votes',
    configureServer(server) {
      server.middlewares.use('/__ignore', (req, res) => {
        // GET mirrors server.mjs, so the app reads live votes the same way in dev.
        if (req.method === 'GET') {
          void readFile(IGNORED, 'utf8').then(
            (body) => {
              res.setHeader('content-type', 'application/json')
              res.end(body)
            },
            () => {
              res.statusCode = 500
              res.end()
            },
          )
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk
          // A vote is a short JSON object; anything larger is not one.
          if (body.length > 4096) req.destroy()
        })
        req.on('end', async () => {
          try {
            const { id } = JSON.parse(body) as { id?: unknown }
            if (typeof id !== 'string' || !id) throw new Error('bad id')

            const file = JSON.parse(await readFile(IGNORED, 'utf8')) as {
              threshold: number
              votes: Record<string, number>
            }
            file.votes[id] = (file.votes[id] ?? 0) + 1
            await writeFile(IGNORED, `${JSON.stringify(file, null, 2)}\n`)

            const votes = file.votes[id]
            const retired = votes >= file.threshold
            server.config.logger.info(
              `ignore: ${id} → ${votes}/${file.threshold}${retired ? ' — retired' : ''}`,
            )
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ votes, threshold: file.threshold, retired }))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), ignoreVotes()],
  server: {
    host: true, // reachable from a phone on the same network
    port: 5173,
  },
})

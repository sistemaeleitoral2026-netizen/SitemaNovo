import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { puxarPhibo } from './dev/phiboLocal.mjs'

function phiboNoPreview() {
  return {
    name: 'phibo-no-preview',
    configureServer(server) {
      server.middlewares.use('/api/phibo-local', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const chunks = []
        req.on('data', (c) => {
          chunks.push(c)
          if (Buffer.concat(chunks).length > 8000) req.destroy()
        })
        req.on('end', () => {
          void (async () => {
            let out
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
              out = await puxarPhibo(body.refreshToken)
            } catch (e) {
              out = { ok: false, erro: e instanceof Error ? e.message : 'Falha ao falar com o Phibo.' }
            }
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(out))
          })()
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = env.VITE_API_PROXY?.trim()

  return {
    plugins: [react(), phiboNoPreview()],
    server: apiProxy
      ? {
          proxy: {
            '/api': {
              target: apiProxy,
              changeOrigin: true,
              secure: true,
            },
          },
        }
      : undefined,
  }
})

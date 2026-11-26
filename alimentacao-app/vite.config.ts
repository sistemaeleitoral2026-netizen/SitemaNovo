import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = env.VITE_API_PROXY?.trim()
  // Cada deploy recebe uma versao propria. Os sistemas incorporados usam esse
  // valor na URL para nunca reaproveitarem HTML/JS de um deploy anterior.
  const buildVersion = env.VERCEL_GIT_COMMIT_SHA?.trim()
    || env.VERCEL_DEPLOYMENT_ID?.trim()
    || String(Date.now())

  return {
    plugins: [react()],
    define: {
      __BUILD_VERSION__: JSON.stringify(buildVersion),
    },
    optimizeDeps: {
      include: ['pdfjs-dist', 'tesseract.js'],
    },
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

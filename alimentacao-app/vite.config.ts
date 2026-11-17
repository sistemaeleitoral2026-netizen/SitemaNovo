import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = env.VITE_API_PROXY?.trim()

  return {
    plugins: [react()],
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

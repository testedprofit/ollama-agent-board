import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/ollama': {
        target: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api\/ollama/, '/api'),
      },
    },
  },
})

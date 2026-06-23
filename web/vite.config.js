import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path matches the GitHub Pages subpath: https://dmerz75.github.io/cincy-csl/
export default defineConfig({
  plugins: [react()],
  base: '/cincy-csl/',
  server: {
    proxy: {
      // Forward /api requests to the FastAPI backend during dev
      '/api': 'http://127.0.0.1:8000',
    },
  },
})

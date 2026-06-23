import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path matches the GitHub Pages subpath: https://dmerz75.github.io/cincy-csl/
export default defineConfig({
  plugins: [react()],
  base: '/cincy-csl/',
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Output at the repo root so Vercel finds it as `dist`.
  build: { outDir: '../../dist', emptyOutDir: true },
})

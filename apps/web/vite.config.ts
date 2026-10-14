import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// Each build has an id of its own, baked into the page and written beside it as `version.json`: an open page that
// finds a newer id there reloads itself (see src/lib/version.ts).
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now())

const versionFile = (): Plugin => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  // Output at the repo root so Vercel finds it as `dist`.
  build: { outDir: '../../dist', emptyOutDir: true },
})

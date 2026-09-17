import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rendererSrc = resolve('src/renderer/src')

// Used by the shadcn CLI to detect Vite. App builds use electron.vite.config.ts.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@renderer', replacement: rendererSrc },
      { find: /^@\//, replacement: `${rendererSrc}/` }
    ]
  }
})

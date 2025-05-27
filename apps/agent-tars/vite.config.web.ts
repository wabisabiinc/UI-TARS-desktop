// apps/agent-tars-app/vite.config.web.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/web',
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
  },
  plugins: [react()],
})

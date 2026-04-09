import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    // Prioritise .ts/.tsx so they shadow legacy .js/.jsx files during migration
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
})

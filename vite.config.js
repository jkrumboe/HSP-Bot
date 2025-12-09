import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0', // Listen on all interfaces for Docker
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    },
    hmr: {
      clientPort: 5173
    }
  }
})

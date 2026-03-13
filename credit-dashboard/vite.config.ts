import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          xlsx: ['xlsx'],
          recharts: ['recharts'],
          jspdf: ['jspdf'],
          vendor: ['react', 'react-dom', 'lucide-react', '@tanstack/react-query'],
        },
      },
    },
  },
})

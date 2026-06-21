import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // excalidraw's entry reads these at module init time; without them
    // the browser throws "process is not defined" before rendering anything
    'process.env.IS_PREACT': '"false"',
    'process.env.NODE_ENV': '"production"',
  },
  optimizeDeps: {
    include: ['@excalidraw/excalidraw'],
    esbuildOptions: {
      define: {
        'process.env.IS_PREACT': '"false"',
        'process.env.NODE_ENV': '"production"',
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 5000,
  },
})
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'public',
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Ignore build output and release directories
      ignored: [
        '**/release/**',
        '**/dist/**',
        '**/build/**',
        '**/*.chromium.html',
        '**/LICENSES.*'
      ]
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false, // Disable sourcemaps for production
    minify: false, // Disable minification to avoid breaking libraries
    reportCompressedSize: false, // Faster builds
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          markdown: ['react-markdown', 'react-syntax-highlighter'],
          icons: ['@tabler/icons-react'],
          socket: ['socket.io-client'],
        },
        compact: true,
      },
      treeshake: {
        preset: 'recommended',
        moduleSideEffects: false,
      },
    },
    cssCodeSplit: false, // Single CSS file
    assetsInlineLimit: 4096, // Inline small assets
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
});
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    outDir: 'dist/renderer',
    emptyOutDir: true,
    sourcemap: false, // Disable sourcemaps for production
    minify: false, // Disable minification to avoid breaking libraries
    reportCompressedSize: false, // Faster builds
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
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
      '@': resolve(__dirname, './src/renderer'),
      '@shared': resolve(__dirname, './src/shared'),
    },
  },
});
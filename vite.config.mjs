import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import obfuscator from 'rollup-plugin-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine if we're in production build
const isProduction = process.env.NODE_ENV === 'production';

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
    minify: 'terser', // Use terser for better minification
    terserOptions: {
      compress: {
        drop_console: true, // Remove console logs in production
        drop_debugger: true, // Remove debugger statements
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
      },
      mangle: {
        toplevel: true, // Mangle top-level names
        properties: {
          regex: /^_/ // Mangle properties starting with _
        }
      },
      format: {
        comments: false, // Remove all comments
      }
    },
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
      plugins: isProduction ? [
        obfuscator({
          // Obfuscation options for production
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.4,
          debugProtection: true, // Prevent debugging
          debugProtectionInterval: 2000, // Force debugger to pause
          disableConsoleOutput: true, // Disable console completely
          identifierNamesGenerator: 'hexadecimal', // Use hex names
          log: false,
          numbersToExpressions: true,
          renameGlobals: true,
          selfDefending: true, // Code breaks if modified
          simplify: true,
          splitStrings: true,
          splitStringsChunkLength: 10,
          stringArray: true,
          stringArrayCallsTransform: true,
          stringArrayCallsTransformThreshold: 0.75,
          stringArrayEncoding: ['base64'], // Encode strings
          stringArrayIndexShift: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayWrappersCount: 2,
          stringArrayWrappersChainedCalls: true,
          stringArrayWrappersParametersMaxCount: 4,
          stringArrayWrappersType: 'function',
          stringArrayThreshold: 0.75,
          transformObjectKeys: true,
          unicodeEscapeSequence: false,
          // Exclude vendor chunks from heavy obfuscation
          exclude: [
            '**/node_modules/**',
            '**/vendor*.js',
            '**/markdown*.js'
          ],
        })
      ] : [],
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
  define: {
    // Remove all console statements in production
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
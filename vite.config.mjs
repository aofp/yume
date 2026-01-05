import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import net from 'net';
import crypto from 'crypto';

// Polyfill for crypto.hash if it doesn't exist
if (!crypto.hash) {
  crypto.hash = (algorithm, data, outputEncoding) => {
    const hash = crypto.createHash(algorithm);
    hash.update(data);
    return outputEncoding ? hash.digest(outputEncoding) : hash.digest();
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to find an available port synchronously
function findAvailablePortSync(startPort = 60000, endPort = 61000) {
  const randomStart = startPort + Math.floor(Math.random() * (endPort - startPort + 1));
  
  for (let offset = 0; offset <= (endPort - startPort); offset++) {
    const port = startPort + ((randomStart - startPort + offset) % (endPort - startPort + 1));
    const server = net.createServer();
    try {
      server.listen(port, '127.0.0.1');
      server.close();
      return port;
    } catch (e) {
      // Port in use, try next
    }
  }
  
  return 5173; // Fallback
}

// Dynamic port allocation for dev
let vitePort = 5173; // Default

if (process.env.NODE_ENV !== 'production') {
  // Read the port FROM Tauri config instead of updating it
  const tauriConfigPath = resolve(__dirname, 'src-tauri', 'tauri.conf.json');
  try {
    const config = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
    // Extract port from devUrl (e.g., "http://localhost:60470" -> 60470)
    const devUrl = config.build.devUrl || 'http://localhost:5173';
    const match = devUrl.match(/:([0-9]+)/);
    if (match) {
      vitePort = parseInt(match[1]);
      console.log(`📖 Using port ${vitePort} from Tauri config`);
    } else {
      // If can't parse, find a new port and update the config
      vitePort = findAvailablePortSync();
      config.build.devUrl = `http://localhost:${vitePort}`;
      writeFileSync(tauriConfigPath, JSON.stringify(config, null, 2));
      console.log(`🎲 Found available port: ${vitePort} and updated Tauri config`);
    }
  } catch (e) {
    console.error('Warning: Could not read Tauri config:', e.message);
    vitePort = findAvailablePortSync();
  }
  
  console.log(`\n🚀 Vite server will run on port: ${vitePort}\n`);
}

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'public',
  server: {
    port: vitePort,
    strictPort: true,
    host: '127.0.0.1', // Force IPv4 to avoid permission issues
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
    minify: 'terser', // Re-enabled with safe settings (patch-vendor.cjs fixes issues)
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
        passes: 2,
      },
      mangle: {
        safari10: true,
        keep_classnames: true, // Preserve class names for React
        keep_fnames: false, // Mangle function names (safe with React)
        properties: false, // Don't mangle properties (critical for React)
      },
      format: {
        comments: false, // Remove all comments
        ascii_only: true,
      },
    },
    reportCompressedSize: false, // Faster builds
    chunkSizeWarningLimit: 500,
    // Copy fonts to dist folder
    copyPublicDir: true,
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
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
    },
    cssCodeSplit: false, // Single CSS file
    cssTarget: 'chrome89', // Modern CSS features
    cssMinify: true, // Re-enabled with esbuild (default)
    assetsInlineLimit: 4096, // Reduced from 10KB to 4KB
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src/renderer'),
      '@shared': resolve(__dirname, './src/shared'),
      '@icons': resolve(__dirname, './src/renderer/components/Icons'),
    },
  },
  define: {
    // Remove all console statements in production
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
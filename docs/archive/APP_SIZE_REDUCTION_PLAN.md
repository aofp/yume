# 🗜️ yurucode App Size Reduction Planning Document

## Current State Analysis

### Bundle Sizes
- **Frontend dist:** ~10MB
  - CSS: 1.7MB (style-C1wbeSGp.css) - LARGEST SINGLE FILE
  - Markdown/Syntax highlighting: 1.1MB
  - Main app code: 677KB
  - Images: 764KB + 343KB (yurucode PNG files)
  - Fonts: ~3.5MB total (Inter + FiraCode in multiple formats)
  - Vendor bundle: 221KB
- **Resources folder:** ~8MB
  - node_modules: 7.7MB (bundled with app)
  - Server files: ~488KB
- **Development dependencies:** 331MB in node_modules

## 🎯 Size Reduction Strategies (Safe, Won't Break App)

### 1. **FONT OPTIMIZATION** (Potential: -2.5MB)
- **Remove duplicate font formats** - Currently shipping TTF, WOFF, and WOFF2
  - Keep only WOFF2 (best compression)
  - Remove TTF files: -1.7MB
  - Remove WOFF files: -800KB
- **Subset fonts** - Include only used characters
  - Use fonttools to create subsets
  - Could reduce font size by 60-80%
- **Use variable fonts properly** - Inter-Variable.ttf is included but also individual weights
  - Remove individual weight files if using variable font
- **Consider system fonts fallback** for non-critical text

### 2. **CSS OPTIMIZATION** (Potential: -1.2MB)
- **Current issue:** 1.7MB CSS file is enormous
- **PurgeCSS/PurifyCSS** - Remove unused CSS rules
  - Scan all React components for used classes
  - Remove unused syntax highlighter themes
- **CSS minification** - Currently not minified properly
- **Split critical CSS** - Inline critical CSS, lazy-load rest
- **Remove duplicate/unused icon styles** from Tabler icons

### 3. **IMAGE OPTIMIZATION** (Potential: -800KB)
- **Convert PNG to WebP** - 25-35% smaller
  - yurucode-BZzRtaXG.png (764KB) → ~500KB WebP
  - icon.png (343KB) → ~220KB WebP
- **Use proper icon sizes** - Don't bundle oversized icons
- **SVG for logos** instead of PNG where possible
- **Remove duplicate images** - Multiple yurucode.png files

### 4. **JAVASCRIPT BUNDLE OPTIMIZATION** (Potential: -600KB)
- **Tree shaking improvements**
  - Already configured but can be more aggressive
  - Mark more modules as side-effect free
- **Lazy load heavy components**
  - Syntax highlighter (1.1MB) - load on demand
  - Markdown renderer - load when needed
- **Code splitting by route/feature**
  - Split settings, analytics, session management
- **Remove unused Tabler icons** - Import only used icons
- **Replace heavy dependencies**
  - Find lighter alternatives for react-syntax-highlighter
  - Consider lighter markdown parser

### 5. **EMBEDDED SERVER OPTIMIZATION** (Potential: -6MB)
- **Remove node_modules from resources** (7.7MB)
  - Bundle server code into single file with esbuild/webpack
  - Use --bundle --minify --platform=node
- **Minify embedded server string** in logged_server.rs
- **Compress server code** with gzip/brotli, decompress at runtime
- **Remove backup files** (server-claude-macos.cjs.backup: 116KB)

### 6. **RUST BINARY OPTIMIZATION** (Potential: -30-50%)
- **Already optimized but can improve:**
  - Use `opt-level = "z"` ✅ (already set)
  - Use `lto = "fat"` instead of `lto = true` for better optimization
  - Add `strip = "symbols"` for all targets
- **Remove unused dependencies**
  - Audit Cargo.toml for unused crates
  - Use cargo-machete to find unused dependencies
- **Feature flags** - Disable unused features in dependencies
  - Example: tokio features, only keep what's needed
- **UPX compression** on final binary (50-70% reduction)
  - Note: May trigger antivirus, test thoroughly

### 7. **BUILD CONFIGURATION** (Potential: -500KB)
- **Enable minification** in Vite
  - Currently: `minify: false` → Enable with terser
  - Use aggressive terser options
- **Optimize rollup config**
  - Better manual chunks strategy
  - More aggressive tree shaking
- **Remove source maps** ✅ (already disabled)
- **Increase assetsInlineLimit** - Inline more small assets

### 8. **DEPENDENCY OPTIMIZATION** (Potential: -2MB)
- **Audit and replace heavy dependencies**
  - socket.io-client → lighter WebSocket library
  - react-markdown → lighter alternative or custom
  - react-syntax-highlighter → prism-react-renderer (lighter)
- **Remove unused dependencies**
  - sharp (build-time only, shouldn't be in bundle)
  - Audit all dependencies for actual usage
- **Use CDN for large libraries** (requires internet)
  - Load React, ReactDOM from CDN
  - Cache locally after first load

### 9. **RESOURCE BUNDLING** (Potential: -1MB)
- **Audit bundled resources**
  - Check src-tauri/resources for unnecessary files
  - Remove development/test files
- **Compress resources** at build time
- **Lazy load resources** - Don't bundle, download on first use

### 10. **PLATFORM-SPECIFIC BUILDS** (Potential: -20%)
- **Remove cross-platform code** for each target
  - Windows builds don't need macOS-specific code
  - Use conditional compilation in Rust
- **Platform-specific dependencies**
  - Don't bundle Windows deps in macOS build

### 11. **ADVANCED COMPRESSION** (Potential: -40%)
- **Brotli compression** for all text assets
- **WASM for heavy computation** (smaller than JS)
- **Binary packing** of assets

### 12. **TAURI-SPECIFIC OPTIMIZATIONS**
- **Disable unused Tauri plugins**
  - Remove from Cargo.toml if not used
- **Custom protocol optimization**
  - Optimize asset serving
- **Remove withGlobalTauri** if not needed

## 📊 Estimated Total Reduction Potential

### Conservative Estimate (Easy Wins)
- Fonts: -2MB
- Images: -500KB  
- Embedded server: -6MB
- CSS optimization: -800KB
- **Total: ~9.3MB reduction (50-60% smaller)**

### Aggressive Optimization
- All above plus:
- JS bundle optimization: -600KB
- Dependency replacement: -2MB
- Binary compression: -30%
- **Total: ~12-15MB reduction (70-80% smaller)**

## 🚀 Implementation Priority

### Phase 1: Quick Wins (No Code Changes)
1. Remove duplicate fonts (keep only WOFF2)
2. Optimize images (convert to WebP)
3. Remove backup files
4. Enable minification in build

### Phase 2: Build Optimization
1. Bundle server into single file
2. Implement PurgeCSS
3. Configure aggressive tree shaking
4. Add UPX compression

### Phase 3: Code Optimization
1. Lazy load heavy components
2. Replace heavy dependencies
3. Implement code splitting
4. Subset fonts

### Phase 4: Advanced (Requires Testing)
1. Platform-specific builds
2. WASM modules
3. CDN loading with fallback
4. Custom lightweight alternatives

## ⚠️ Testing Requirements

Each optimization should be tested for:
- App functionality (no broken features)
- Performance impact (startup time, runtime)
- Visual integrity (fonts, icons display correctly)
- Cross-platform compatibility
- Offline functionality

## 🔧 Tools Needed

- **fonttools** - Font subsetting
- **PurgeCSS** - Remove unused CSS
- **terser** - JavaScript minification
- **esbuild/webpack** - Bundle server
- **imagemin** - Image optimization
- **UPX** - Binary compression
- **cargo-machete** - Find unused Rust deps
- **bundle-analyzer** - Analyze bundle composition

## 📈 Success Metrics

- Initial app size: ~20-25MB (estimated)
- Target size: <10MB
- Startup time: Should not increase
- Memory usage: Should decrease
- User experience: No degradation

## 🚫 What NOT to Do (Will Break App)

- Don't remove `--print` flag from Claude CLI
- Don't modify core message processing logic  
- Don't remove Socket.IO if not replacing WebSocket handling
- Don't break session management
- Don't remove wrapper module (token tracking)
- Don't modify embedded server without testing
- Don't remove required Tauri plugins

## 📝 Next Steps

1. Measure exact current .app/.dmg size
2. Create size tracking spreadsheet
3. Implement Phase 1 optimizations
4. Measure impact and document
5. Proceed with Phase 2 if needed
6. Create automated size regression tests

---

**Note:** This plan focuses on reducing distribution size while maintaining 100% functionality. Each optimization has been evaluated for safety and won't break the app when implemented correctly.
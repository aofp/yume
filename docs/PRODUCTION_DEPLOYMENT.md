# Yume Production Deployment Guide

**Version:** 0.6.6
**Last Updated:** January 29, 2026
**Status:** Beta (macOS release-ready, Windows/Linux binaries pending)

## Table of Contents

1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [Build Process](#2-build-process)
3. [Code Signing](#3-code-signing)
4. [Platform-Specific Deployment](#4-platform-specific-deployment)
5. [Distribution](#5-distribution)
6. [Post-Deployment](#6-post-deployment)
7. [Monitoring & Support](#7-monitoring--support)

---

## 1. Pre-Deployment Checklist

### 1.1 Code Quality

#### Required Checks
- [ ] **No console.log statements** - Replaced with logger (cleanup in progress)
- [x] **Error boundaries implemented** - All major components wrapped
- [x] **Memory leaks fixed** - Bounded buffers, proper cleanup
- [x] **Security CSP enabled** - Content Security Policy configured
- [x] **Process cleanup working** - Drop trait implemented
- [x] **Crash recovery tested** - Session restoration functional
- [x] **No hardcoded secrets** - Environment variables used
- [x] **No telemetry/tracking** - All removed per requirement

#### Code Review
```bash
# Check for console.log statements
grep -r "console.log" src/ --include="*.ts" --include="*.tsx"

# Check for hardcoded secrets
grep -r -E "(api_key|secret|password|token)" src/ --include="*.ts"

# Check for unsafe Rust code
grep -r "unsafe" src-tauri/src/

# Type checking
npx tsc --noEmit
```

### 1.2 Testing

#### Automated Tests
```bash
# Run Rust tests
cd src-tauri
cargo test --release

# Run frontend tests (Vitest 3.x with jsdom)
npm run test

# Watch mode for development
npm run test:watch

# Build and verify frontend compiles
npm run build
```

**Frontend Test Suites (8 files):**
- Config: `app.test.ts`, `tools.test.ts`
- Services: `licenseManager.test.ts`
- Types: `ucf.test.ts`
- Utils: `chatHelpers.test.ts`, `helpers.test.ts`, `performance.test.ts`, `regexValidator.test.ts`

#### Manual Testing Checklist
- [ ] Fresh installation on clean system
- [ ] Session creation and management
- [ ] Auto-compaction at 75%
- [ ] Token tracking accuracy
- [ ] Cost calculation correctness
- [ ] Crash recovery functionality
- [ ] All keyboard shortcuts
- [ ] File operations
- [ ] Database operations
- [ ] Hook system
- [ ] MCP connections

### 1.3 Performance Validation

#### Benchmarks Required
| Metric | Target | Actual | Pass |
|--------|--------|--------|------|
| Startup time | <3s | 2.3s | ✅ |
| Memory (idle) | <200MB | 145MB | ✅ |
| Memory (active) | <500MB | 380MB | ✅ |
| Bundle size | <50MB | 42MB | ✅ |
| FPS scrolling | 60fps | 58fps | ✅ |

### 1.4 Documentation

- [x] README.md updated
- [x] CHANGELOG.md current
- [x] API documentation (CLAUDE.md)
- [ ] Video tutorials
- [ ] FAQ

### 1.5 Legal

- [ ] License file
- [ ] Third-party licenses
- [ ] Privacy policy
- [ ] Terms of service

---

## 2. Build Process

### 2.1 Environment Setup

#### Required Tools
```bash
# Node.js 18+ and Rust stable
node --version && rustc --version

# Tauri CLI
npm install -g @tauri-apps/cli

# macOS: Xcode Command Line Tools
xcode-select --install

# Windows: Visual Studio Build Tools
# https://visualstudio.microsoft.com/downloads/
```

### 2.2 Build Configuration

#### Update Version
Update in three files:
- `package.json` - `"version": "X.Y.Z"`
- `src-tauri/tauri.conf.json` - `"version": "X.Y.Z"`
- `src-tauri/Cargo.toml` - `version = "X.Y.Z"`

#### Production Environment Variables
```bash
# .env.production
NODE_ENV=production
TAURI_SKIP_DEVSERVER_CHECK=true
RUST_LOG=error
```

### 2.3 Build Commands

#### Build Commands by Platform
```bash
# Clean and install
rm -rf dist/ src-tauri/target/ && npm ci

# macOS (arm64 default, or specify x64)
npm run tauri:build:mac          # alias for arm64
npm run tauri:build:mac:arm64
npm run tauri:build:mac:x64

# Windows
npm run tauri:build:win          # x86_64-pc-windows-msvc

# Linux
npm run tauri:build:linux        # x86_64-unknown-linux-gnu
```

All commands automatically build unified binaries and prepare resources.

### 2.4 Server Binary Builds

Node.js server compiled via @yao-pkg/pkg (hides source, removes Node.js dependency).

#### Binary Commands
```bash
# Unified binaries (server + yume-cli) - recommended
npm run build:unified:macos    # arm64 + x64
npm run build:unified:windows  # x64
npm run build:unified:linux    # x64

# Server-only (for debugging)
npm run build:server:macos
npm run build:server:windows
npm run build:server:linux

# yume-cli only
npm run build:yume-cli && npm run build:yume-cli:binary:all
```

#### Binary Locations (`src-tauri/resources/`)
| Platform | Binary | Status |
|----------|--------|--------|
| macOS arm64 | `yume-bin-macos-arm64` | Bundled |
| macOS x64 | `yume-bin-macos-x64` | Bundled |
| Windows | `yume-bin-windows-x64.exe` | Script exists |
| Linux | `yume-bin-linux-x64` | Script exists |

#### Development Workflow
1. Edit `.cjs` files at project root
2. Run `npm run build:server:<platform>`
3. Restart `npm run tauri:dev`

### 2.5 Build Optimization

#### Rust Optimizations
```toml
# src-tauri/Cargo.toml
[profile.release]
opt-level = 3            # Maximum speed optimization
lto = "fat"              # Full LTO for best cross-crate optimization
codegen-units = 1        # Single codegen unit for better optimization
strip = true             # Strip symbols from binary
panic = "abort"          # Faster panic handling, removes unwind info
debug = false            # No debug info
debug-assertions = false # Remove debug assertions
overflow-checks = false  # Remove overflow checks
incremental = false      # Disable incremental for better optimization
```

#### Frontend Optimizations
```javascript
// vite.config.mjs
export default {
  build: {
    minify: 'esbuild',  // esbuild handles complex regex patterns correctly
    esbuild: {
      drop: ['debugger'],
      legalComments: 'none',
    },
    sourcemap: false,  // Disabled for production
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('shiki') || id.includes('@shikijs')) return 'shiki';
          if (id.includes('node_modules/react-dom')) return 'vendor';
          if (id.includes('node_modules/react/')) return 'vendor';
          if (id.includes('node_modules/zustand')) return 'vendor';
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark-gfm')) return 'markdown';
          if (id.includes('node_modules/@tabler/icons-react')) return 'icons';
          if (id.includes('node_modules/socket.io-client')) return 'socket';
          if (id.includes('node_modules/@tauri-apps')) return 'tauri';
        }
      }
    }
  }
}
```

---

## 3. Code Signing

### 3.1 macOS Code Signing

#### Requirements
- Apple Developer Account ($99/year)
- Developer ID Application certificate
- Developer ID Installer certificate

#### Setup
```bash
# List available certificates
security find-identity -v -p codesigning

# Set environment variable
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
```

#### Sign Application
```bash
# Sign the app bundle (architecture-specific paths)
# For arm64:
codesign --deep --force --verify --verbose \
  --sign "$APPLE_SIGNING_IDENTITY" \
  --options runtime \
  --entitlements src-tauri/entitlements.plist \
  "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/yume.app"

# For x64:
codesign --deep --force --verify --verbose \
  --sign "$APPLE_SIGNING_IDENTITY" \
  --options runtime \
  --entitlements src-tauri/entitlements.plist \
  "src-tauri/target/x86_64-apple-darwin/release/bundle/macos/yume.app"

# Verify signature
codesign --verify --verbose=4 \
  "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/yume.app"

# Check notarization readiness
spctl --assess --verbose=4 \
  "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/yume.app"
```

#### Notarization
```bash
# Create ZIP for notarization (arm64 example)
ditto -c -k --keepParent \
  "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/yume.app" \
  "yume.zip"

# Submit for notarization
xcrun notarytool submit yume.zip \
  --apple-id "your-apple-id@example.com" \
  --team-id "TEAMID" \
  --password "app-specific-password" \
  --wait

# Staple the notarization
xcrun stapler staple \
  "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/yume.app"
```

### 3.2 Windows Code Signing

#### Requirements
- EV Code Signing Certificate ($300-600/year)
- Or Standard Certificate (less trusted)

#### Setup
```powershell
# Import certificate
certutil -importpfx certificate.pfx

# Set environment variables
$env:WINDOWS_CERTIFICATE_PATH = "path\to\certificate.pfx"
$env:WINDOWS_CERTIFICATE_PASSWORD = "password"
```

#### Sign Application
```powershell
# Sign the executable
signtool sign /f certificate.pfx /p password /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "src-tauri\target\release\yume.exe"

# Sign the installer
signtool sign /f certificate.pfx /p password /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "src-tauri\target\release\bundle\msi\yume_1.0.0_x64.msi"

# Verify signature
signtool verify /pa "src-tauri\target\release\yume.exe"
```

---

## 4. Platform-Specific Deployment

### 4.1 macOS Deployment

#### DMG Creation
DMG files are automatically created by the build process. Output locations:
- arm64: `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`
- x64: `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/`

To open the built DMG:
```bash
npm run open:dmg
```

Post-build scripts (`scripts/post-build-mac.cjs` and `scripts/build-pkg.sh`) handle additional packaging.

#### Distribution Requirements
- Sign DMG file
- Notarize DMG
- Create release notes
- Generate checksums

### 4.2 Windows Deployment

#### MSI Configuration
```xml
<!-- wix/main.wxs -->
<Product Id="*" 
  Name="Yume"
  Language="1033"
  Version="1.0.0"
  Manufacturer="Yuru Software"
  UpgradeCode="YOUR-UPGRADE-CODE">
  
  <Package InstallerVersion="500"
    Compressed="yes"
    InstallScope="perMachine"/>
    
  <Feature Id="MainApplication">
    <ComponentRef Id="MainExecutable"/>
    <ComponentRef Id="StartMenuShortcut"/>
    <ComponentRef Id="DesktopShortcut"/>
  </Feature>
</Product>
```

#### NSIS Configuration
```nsis
; installer.nsi
!define PRODUCT_NAME "Yume"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "Yuru Software"

InstallDir "$PROGRAMFILES64\Yume"
RequestExecutionLevel admin

Section "Main"
  SetOutPath "$INSTDIR"
  File /r "dist\*.*"
  
  CreateShortcut "$DESKTOP\Yume.lnk" "$INSTDIR\yume.exe"
  CreateShortcut "$SMPROGRAMS\Yume\Yume.lnk" "$INSTDIR\yume.exe"
SectionEnd
```

### 4.3 Linux Deployment

#### AppImage Creation
```bash
# Ensure AppImage tools installed
sudo apt install appimage-builder

# Build AppImage
appimage-builder --recipe AppImageBuilder.yml
```

#### DEB Package
```bash
# Create debian structure
mkdir -p debian/DEBIAN
mkdir -p debian/usr/bin
mkdir -p debian/usr/share/applications

# Copy files
cp target/release/yume debian/usr/bin/
cp assets/yume.desktop debian/usr/share/applications/

# Create control file
cat > debian/DEBIAN/control << EOF
Package: yume
Version: 1.0.0
Architecture: amd64
Maintainer: Your Name <email@example.com>
Description: Claude GUI with auto-compaction
EOF

# Build package
dpkg-deb --build debian yume_1.0.0_amd64.deb
```

#### RPM Package
```bash
# Create spec file
cat > yume.spec << EOF
Name: yume
Version: 1.0.0
Release: 1
Summary: Claude GUI with auto-compaction
License: Proprietary
URL: https://yume.app

%description
Yume is a sophisticated GUI for Claude CLI

%install
mkdir -p %{buildroot}/usr/bin
cp target/release/yume %{buildroot}/usr/bin/

%files
/usr/bin/yume
EOF

# Build RPM
rpmbuild -ba yume.spec
```

---

## 5. Distribution

### 5.1 Direct Download

#### File Hosting
```bash
# Generate checksums
sha256sum yume_*.dmg > checksums.txt
sha256sum yume_*.msi >> checksums.txt
sha256sum yume_*.AppImage >> checksums.txt

# Upload structure (example for v0.6.0)
releases/
├── v0.6.0/
│   ├── mac/
│   │   ├── yume_0.6.0_aarch64.dmg        # Apple Silicon
│   │   ├── yume_0.6.0_x64.dmg            # Intel
│   │   └── checksums.sha256
│   ├── windows/
│   │   ├── yume_0.6.0_x64-setup.exe
│   │   ├── yume_0.6.0_x64_en-US.msi
│   │   └── checksums.sha256
│   └── linux/
│       ├── yume_0.6.0_amd64.AppImage
│       ├── yume_0.6.0_amd64.deb
│       └── checksums.sha256
```

### 5.2 GitHub Releases

#### Create Release
```bash
# Tag version (use semantic versioning)
git tag -a v0.6.0 -m "Release version 0.6.0"
git push origin v0.6.0

# Create release with GitHub CLI
gh release create v0.6.0 \
  --title "Yume v0.6.0" \
  --notes "Release notes here" \
  --draft

# Upload assets
gh release upload v0.6.0 \
  yume_0.6.0_aarch64.dmg \
  yume_0.6.0_x64.dmg \
  yume_0.6.0_x64-setup.exe \
  yume_0.6.0_amd64.AppImage
```

#### Auto-Update System
Yume uses a two-tier update mechanism:
1. **App updates**: `versionCheck.ts` fetches `https://aofp.github.io/yume/version.txt` on startup
2. **Claude CLI updates**: Runs `claude update` on startup (enabled by default)

### 5.3 Package Managers

#### Package Managers (Planned)

**Homebrew (macOS):** `brew install --cask yume` - Not yet published

**Chocolatey (Windows):** `choco install yume` - Not yet published

**Snap (Linux):** `snap install yume` - Not yet published

---

## 6. Post-Deployment

### 6.1 Version Management

#### Semantic Versioning
```
MAJOR.MINOR.PATCH

1.0.0 - Initial release
1.0.1 - Bug fixes
1.1.0 - New features
2.0.0 - Breaking changes
```

#### Update Channels
- **Stable**: Production releases
- **Beta**: Pre-release testing
- **Nightly**: Development builds

### 6.2 Release Notes

#### Template
```markdown
# Yume vX.Y.Z

Released: [Date]

## New Features
- Feature 1
- Feature 2

## Bug Fixes
- Fix 1

## Security
- Security improvement 1

## Breaking Changes
- None

## Downloads
- [macOS arm64](link) | [macOS x64](link)
- [Windows x64](link)
- [Linux AppImage](link)
```

### 6.3 User Communication

#### Announcement Channels
- Website blog post
- GitHub release page
- Discord/Slack announcement
- Email newsletter
- Social media

#### Update Notification
Yume uses a simple version.txt file hosted on GitHub Pages:
```
# https://aofp.github.io/yume/version.txt
0.6.0
```

The app checks this on startup and shows an `[update available]` badge in window controls when a newer version is detected.

---

## 7. Monitoring & Support

### 7.1 Error Tracking

#### Local Error Logs
```typescript
// Errors stored in localStorage
const errors = JSON.parse(
  localStorage.getItem('yume_errors') || '[]'
);
```

#### Log Collection
```bash
# macOS server logs
~/Library/Logs/yume/server.log

# Windows server logs
%LOCALAPPDATA%\yume\logs\server.log

# Linux server logs
~/.yume/logs/server.log

# Database location (all platforms)
~/.yume/yume.db

# Memory V2 storage (all platforms)
~/.yume/memory/
```

### 7.2 Performance Monitoring

#### Metrics to Track
- Startup time distribution
- Memory usage patterns
- Crash frequency
- Feature usage statistics
- Error rates

### 7.3 Support Infrastructure

#### Support Channels
- **GitHub Issues**: https://github.com/aofp/yume/issues
- **Documentation**: `docs/` directory

#### Issue Templates
```markdown
<!-- bug_report.md -->
**Description:**
Brief description of the bug

**Steps to Reproduce:**
1. First step
2. Second step

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Environment:**
- OS: [e.g., macOS 14.0]
- Version: [e.g., 1.0.0]
```

### 7.4 Rollback Procedure

#### Emergency Rollback
```bash
# Remove problematic release
gh release delete v1.0.1 --yes

# Point users to previous version
echo "v1.0.0" > LATEST_STABLE

# Communicate issue
# - Update website
# - Send notification
# - Post on social media
```

---

## Deployment Checklist

### Pre-Release
- [ ] Code quality checks passed
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Legal requirements fulfilled

### Build
- [ ] Version numbers updated
- [ ] Production build created
- [ ] Code signing completed
- [ ] Installers generated
- [ ] Checksums calculated

### Distribution
- [ ] Files uploaded to CDN
- [ ] GitHub release created
- [ ] Package managers updated
- [ ] Update manifest published

### Post-Release
- [ ] Release notes published
- [ ] Announcements sent
- [ ] Monitoring enabled
- [ ] Support team notified

### Validation
- [ ] Download links working
- [ ] Installation tested
- [ ] Update mechanism verified
- [ ] Rollback plan ready

---

## Troubleshooting Deployment Issues

### Common Issues

#### macOS Notarization Failed
```bash
# Check for unsigned libraries (arm64 example)
find src-tauri/target/aarch64-apple-darwin/release/bundle/macos/yume.app \
  -type f -exec codesign -dv {} \; 2>&1 | grep "not signed"

# Re-sign with hardened runtime
codesign --deep --force --verify --verbose \
  --options runtime \
  --sign "$APPLE_SIGNING_IDENTITY" \
  src-tauri/target/aarch64-apple-darwin/release/bundle/macos/yume.app
```

#### Windows SmartScreen Warning
- Use EV certificate for immediate reputation
- Or build reputation over time with standard cert
- Submit to Microsoft for analysis

#### Linux AppImage Won't Run
```bash
# Make executable
chmod +x yume_*.AppImage

# Check dependencies
ldd yume_*.AppImage

# Run with debug
APPIMAGE_DEBUG=1 ./yume_*.AppImage

# If FUSE is missing
sudo apt install fuse libfuse2  # Ubuntu/Debian
```

---

## Security Considerations

### Release Security
1. Sign all binaries
2. Use HTTPS for downloads
3. Provide checksums
4. GPG sign releases
5. Scan for vulnerabilities

### Distribution Security
1. Use CDN with DDoS protection
2. Enable rate limiting
3. Monitor for tampering
4. Regular security audits
5. Incident response plan

---

## Current Build Status

| Platform | Status | Output |
|----------|--------|--------|
| macOS arm64 | Ready | DMG + PKG |
| macOS x64 | Ready | DMG + PKG |
| Windows | Scripts exist | Not bundled |
| Linux | Scripts exist | Not bundled |

## Key Files

- Build scripts: `scripts/`
- Tauri configs: `src-tauri/tauri.conf.json`, `tauri.arm64.conf.json`, `tauri.x64.conf.json`
- Rust config: `src-tauri/Cargo.toml`
- Vite config: `vite.config.mjs`
- Resources: `src-tauri/resources/`

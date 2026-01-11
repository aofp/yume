# Yurucode Production Deployment Guide

**Version:** 0.1.0
**Last Updated:** January 9, 2026
**Status:** Development

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
- [x] **No console.log statements** - Replaced with logger
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
grep -r "console.log" src/ --exclude-dir=node_modules

# Check for hardcoded secrets
grep -r -E "(api_key|secret|password|token)" src/ --exclude-dir=node_modules

# Check for unsafe Rust code
grep -r "unsafe" src-tauri/src/

# Run type checking (requires tsc to be available)
npx tsc --noEmit
```

### 1.2 Testing

#### Automated Tests
```bash
# Run Rust tests
cd src-tauri
cargo test --release

# Build and verify frontend compiles
npm run build
```

#### Manual Testing Checklist
- [ ] Fresh installation on clean system
- [ ] Session creation and management
- [ ] Auto-compaction at 60%
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
- [x] API documentation complete
- [x] User manual ready
- [ ] Video tutorials recorded
- [ ] FAQ compiled

### 1.5 Legal

- [ ] License file included
- [ ] Third-party licenses documented
- [ ] Privacy policy written
- [ ] Terms of service prepared
- [ ] Copyright notices added

---

## 2. Build Process

### 2.1 Environment Setup

#### Required Tools
```bash
# Node.js (v18+)
node --version

# Rust (latest stable)
rustc --version
cargo --version

# Tauri CLI
npm install -g @tauri-apps/cli

# Platform-specific tools
# macOS: Xcode Command Line Tools
xcode-select --install

# Windows: Visual Studio Build Tools
# Download from: https://visualstudio.microsoft.com/downloads/
```

### 2.2 Build Configuration

#### Update Version
```json
// package.json
{
  "version": "X.Y.Z"
}

// src-tauri/tauri.conf.json
{
  "version": "X.Y.Z"
}

// src-tauri/Cargo.toml
[package]
version = "X.Y.Z"
```

#### Production Environment Variables
```bash
# .env.production
NODE_ENV=production
TAURI_SKIP_DEVSERVER_CHECK=true
RUST_LOG=error
```

### 2.3 Build Commands

#### macOS Build
```bash
# Clean previous builds
rm -rf dist/ src-tauri/target/

# Install dependencies
npm ci

# Build frontend
npm run build

# Build Tauri app
npm run tauri:build:mac

# For universal binary (Intel + Apple Silicon)
npm run tauri build -- --target universal-apple-darwin
```

#### Windows Build
```bash
# Clean previous builds
Remove-Item -Recurse -Force dist\
Remove-Item -Recurse -Force src-tauri\target\

# Install dependencies
npm ci

# Build frontend
npm run build

# Build Tauri app
npm run tauri:build:win

# Build both MSI and NSIS installers
npm run tauri build -- --bundles msi,nsis
```

#### Linux Build
```bash
# Clean previous builds
rm -rf dist/ src-tauri/target/

# Install dependencies
npm ci

# Build frontend
npm run build

# Build Tauri app
npm run tauri:build:linux

# Build multiple formats
npm run tauri build -- --bundles appimage,deb,rpm
```

### 2.4 Server Binary Builds

The Node.js server is compiled into platform-specific binaries using @yao-pkg/pkg. These binaries hide source code and remove the Node.js dependency for end users.

#### Server Binary Commands
```bash
# Build macOS server binary (arm64 and x64)
npm run build:server:macos

# Build Windows server binary (x64)
npm run build:server:windows

# Build Linux server binary (x64)
npm run build:server:linux

# Build all platform binaries
npm run build:server:all
```

#### Server Binary Locations
After building, binaries are placed in `src-tauri/resources/`:
- macOS Apple Silicon: `yurucode-server-macos-arm64`
- macOS Intel: `yurucode-server-macos-x64`
- Windows: `yurucode-server-windows-x64.exe`
- Linux: `yurucode-server-linux-x64`

#### Fallback .cjs Files
For backwards compatibility, .cjs fallback files exist:
- `server-claude-macos.cjs`
- `server-claude-windows.cjs`
- `server-claude-linux.cjs`

These are used when the compiled binary is not found or fails to execute.

### 2.5 Build Optimization

#### Rust Optimizations
```toml
# src-tauri/Cargo.toml
[profile.release]
opt-level = 3          # Maximum optimizations
lto = true            # Link-time optimization
codegen-units = 1     # Single codegen unit
strip = true          # Strip symbols
panic = "abort"       # Smaller panic handler
```

#### Frontend Optimizations
```javascript
// vite.config.mjs
export default {
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['@radix-ui/*'],
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
# Sign the app bundle
codesign --deep --force --verify --verbose \
  --sign "$APPLE_SIGNING_IDENTITY" \
  --options runtime \
  --entitlements src-tauri/entitlements.plist \
  "src-tauri/target/release/bundle/macos/Yurucode.app"

# Verify signature
codesign --verify --verbose=4 \
  "src-tauri/target/release/bundle/macos/Yurucode.app"

# Check notarization readiness
spctl --assess --verbose=4 \
  "src-tauri/target/release/bundle/macos/Yurucode.app"
```

#### Notarization
```bash
# Create ZIP for notarization
ditto -c -k --keepParent \
  "src-tauri/target/release/bundle/macos/Yurucode.app" \
  "Yurucode.zip"

# Submit for notarization
xcrun notarytool submit Yurucode.zip \
  --apple-id "your-apple-id@example.com" \
  --team-id "TEAMID" \
  --password "app-specific-password" \
  --wait

# Staple the notarization
xcrun stapler staple \
  "src-tauri/target/release/bundle/macos/Yurucode.app"
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
signtool sign /f certificate.pfx /p password /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "src-tauri\target\release\yurucode.exe"

# Sign the installer
signtool sign /f certificate.pfx /p password /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "src-tauri\target\release\bundle\msi\yurucode_1.0.0_x64.msi"

# Verify signature
signtool verify /pa "src-tauri\target\release\yurucode.exe"
```

---

## 4. Platform-Specific Deployment

### 4.1 macOS Deployment

#### DMG Creation
```bash
# Use create-dmg tool
npm install -g create-dmg

create-dmg \
  --volname "Yurucode" \
  --volicon "assets/icons/mac/yurucode.icns" \
  --background "assets/dmg-background.png" \
  --window-size 600 400 \
  --icon-size 100 \
  --icon "Yurucode.app" 175 190 \
  --hide-extension "Yurucode.app" \
  --app-drop-link 425 190 \
  "Yurucode-1.0.0.dmg" \
  "src-tauri/target/release/bundle/macos/"
```

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
  Name="Yurucode"
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
!define PRODUCT_NAME "Yurucode"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "Yuru Software"

InstallDir "$PROGRAMFILES64\Yurucode"
RequestExecutionLevel admin

Section "Main"
  SetOutPath "$INSTDIR"
  File /r "dist\*.*"
  
  CreateShortcut "$DESKTOP\Yurucode.lnk" "$INSTDIR\yurucode.exe"
  CreateShortcut "$SMPROGRAMS\Yurucode\Yurucode.lnk" "$INSTDIR\yurucode.exe"
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
cp target/release/yurucode debian/usr/bin/
cp assets/yurucode.desktop debian/usr/share/applications/

# Create control file
cat > debian/DEBIAN/control << EOF
Package: yurucode
Version: 1.0.0
Architecture: amd64
Maintainer: Your Name <email@example.com>
Description: Claude GUI with auto-compaction
EOF

# Build package
dpkg-deb --build debian yurucode_1.0.0_amd64.deb
```

#### RPM Package
```bash
# Create spec file
cat > yurucode.spec << EOF
Name: yurucode
Version: 1.0.0
Release: 1
Summary: Claude GUI with auto-compaction
License: Proprietary
URL: https://yurucode.app

%description
Yurucode is a sophisticated GUI for Claude CLI

%install
mkdir -p %{buildroot}/usr/bin
cp target/release/yurucode %{buildroot}/usr/bin/

%files
/usr/bin/yurucode
EOF

# Build RPM
rpmbuild -ba yurucode.spec
```

---

## 5. Distribution

### 5.1 Direct Download

#### File Hosting
```bash
# Generate checksums
sha256sum Yurucode-*.dmg > checksums.txt
sha256sum yurucode-*.msi >> checksums.txt
sha256sum yurucode-*.AppImage >> checksums.txt

# Upload structure
releases/
├── v1.0.0/
│   ├── mac/
│   │   ├── Yurucode-1.0.0-universal.dmg
│   │   └── Yurucode-1.0.0-universal.dmg.sha256
│   ├── windows/
│   │   ├── yurucode-1.0.0-x64.msi
│   │   ├── yurucode-1.0.0-x64.msi.sha256
│   │   ├── yurucode-1.0.0-x64-setup.exe
│   │   └── yurucode-1.0.0-x64-setup.exe.sha256
│   └── linux/
│       ├── yurucode-1.0.0.AppImage
│       ├── yurucode-1.0.0.deb
│       └── yurucode-1.0.0.rpm
```

### 5.2 GitHub Releases

#### Create Release
```bash
# Tag version
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# Create release with GitHub CLI
gh release create v1.0.0 \
  --title "Yurucode v1.0.0" \
  --notes "Release notes here" \
  --draft

# Upload assets
gh release upload v1.0.0 \
  Yurucode-1.0.0-universal.dmg \
  yurucode-1.0.0-x64.msi \
  yurucode-1.0.0.AppImage
```

### 5.3 Package Managers

#### Homebrew (macOS)
```ruby
# yurucode.rb
class Yurucode < Formula
  desc "Claude GUI with auto-compaction"
  homepage "https://yurucode.app"
  url "https://github.com/yurucode/releases/download/v1.0.0/Yurucode-1.0.0.tar.gz"
  sha256 "SHA256_HERE"
  version "1.0.0"
  
  def install
    bin.install "yurucode"
  end
end
```

#### Chocolatey (Windows)
```xml
<!-- yurucode.nuspec -->
<?xml version="1.0"?>
<package>
  <metadata>
    <id>yurucode</id>
    <version>1.0.0</version>
    <title>Yurucode</title>
    <authors>Yuru Software</authors>
    <description>Claude GUI with auto-compaction</description>
    <projectUrl>https://yurucode.app</projectUrl>
  </metadata>
</package>
```

#### Snap (Linux)
```yaml
# snapcraft.yaml
name: yurucode
version: '1.0.0'
summary: Claude GUI with auto-compaction
description: |
  Yurucode is a sophisticated GUI for Claude CLI
  
confinement: strict
grade: stable

parts:
  yurucode:
    plugin: rust
    source: .
```

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
# Yurucode v1.0.0

Released: January 3, 2025

## ✨ New Features
- Auto-compaction at 60% context usage
- Crash recovery system
- Performance monitoring

## 🐛 Bug Fixes
- Fixed memory leaks in message buffers
- Resolved process cleanup issues

## 🔒 Security
- Enabled Content Security Policy
- Added input validation

## 💔 Breaking Changes
- None

## 📦 Downloads
- [macOS Universal](link)
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
```json
// update-manifest.json
{
  "version": "1.0.0",
  "releaseDate": "2025-01-03",
  "notes": "Major release with auto-compaction",
  "downloads": {
    "darwin": "https://...",
    "win32": "https://...",
    "linux": "https://..."
  }
}
```

---

## 7. Monitoring & Support

### 7.1 Error Tracking

#### Local Error Logs
```typescript
// Errors stored in localStorage
const errors = JSON.parse(
  localStorage.getItem('yurucode_errors') || '[]'
);
```

#### Log Collection
```bash
# macOS server logs
~/Library/Logs/yurucode/server.log

# Windows server logs
%LOCALAPPDATA%\yurucode\logs\server.log

# Linux server logs
~/.yurucode/logs/server.log
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
1. **GitHub Issues**: Bug reports
2. **Discord Server**: Community support
3. **Email Support**: Premium users
4. **Documentation**: Self-service

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
# Check for unsigned libraries
find Yurucode.app -type f -exec codesign -dv {} \; 2>&1 | grep "not signed"

# Re-sign with hardened runtime
codesign --deep --force --verify --verbose \
  --options runtime \
  --sign "$APPLE_SIGNING_IDENTITY" \
  Yurucode.app
```

#### Windows SmartScreen Warning
- Use EV certificate for immediate reputation
- Or build reputation over time with standard cert
- Submit to Microsoft for analysis

#### Linux AppImage Won't Run
```bash
# Make executable
chmod +x Yurucode.AppImage

# Check dependencies
ldd Yurucode.AppImage

# Run with debug
APPIMAGE_DEBUG=1 ./Yurucode.AppImage
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

## Conclusion

This deployment guide ensures a smooth, secure, and professional release of Yurucode. Follow each step carefully and maintain a deployment log for future reference. Remember: quality over speed for production releases.
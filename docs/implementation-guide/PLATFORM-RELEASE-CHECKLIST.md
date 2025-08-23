# Platform-Specific Release Checklist

## Pre-Release Requirements

### Code Complete
- [ ] All embedded server code removed from `logged_server.rs`
- [ ] ProcessRegistry implemented with platform-specific kill
- [ ] Direct CLI spawning via Rust (no Node.js server)
- [ ] Tauri events replacing Socket.IO
- [ ] Stream parsing without accumulation
- [ ] Binary detection for all platforms

### Testing Complete
- [ ] 5-minute tasks: 100% success rate
- [ ] 30-minute tasks: 100% success rate
- [ ] 2-hour tasks: 100% success rate
- [ ] Memory usage: Stable at 250-300MB
- [ ] No orphaned processes after exit
- [ ] All keyboard shortcuts working

## macOS Release Checklist

### Development Environment
- [ ] Tested on macOS 12 (Monterey) or later
- [ ] Xcode Command Line Tools installed
- [ ] Rust toolchain updated
- [ ] Node.js 18+ installed

### Binary Detection Testing
- [ ] ✅ Homebrew installation (`/opt/homebrew/bin/claude`)
- [ ] ✅ Intel Mac Homebrew (`/usr/local/bin/claude`)
- [ ] ✅ NVM installations (`~/.nvm/versions/node/*/bin/claude`)
- [ ] ✅ Direct installation (`~/.local/bin/claude`)
- [ ] ✅ `which claude` command works
- [ ] ✅ $CLAUDE_PATH environment variable

### Platform-Specific Features
- [ ] `--dangerously-skip-permissions` flag included
- [ ] Sandbox restrictions handled
- [ ] Process termination: SIGTERM → SIGKILL
- [ ] .DS_Store files ignored in session directories
- [ ] Gatekeeper approval for unsigned binary

### Build Process
```bash
# Clean build
rm -rf target/
rm -rf src-tauri/target/

# Install dependencies
npm install

# Build for macOS
npm run tauri:build:mac

# Output location
# Intel: target/release/bundle/dmg/yurucode_*_x64.dmg
# ARM: target/release/bundle/dmg/yurucode_*_aarch64.dmg
```

### Testing Matrix
- [ ] Intel Mac - macOS 12
- [ ] Intel Mac - macOS 13
- [ ] Intel Mac - macOS 14
- [ ] M1 Mac - macOS 12
- [ ] M1 Mac - macOS 13
- [ ] M2 Mac - macOS 14
- [ ] M3 Mac - macOS 14

### Release Artifacts
- [ ] .dmg installer created
- [ ] .app bundle signed (if certificates available)
- [ ] File size < 50MB
- [ ] Version number updated in tauri.conf.json
- [ ] Release notes prepared

## Windows Release Checklist

### Development Environment
- [ ] Windows 10 version 1903+ or Windows 11
- [ ] Visual Studio Build Tools 2022
- [ ] WebView2 runtime installed
- [ ] Rust toolchain with MSVC target
- [ ] Node.js 18+ installed

### Binary Detection Testing
- [ ] ✅ Native installation (`%LOCALAPPDATA%\Claude\claude.exe`)
- [ ] ✅ Program Files (`C:\Program Files\Claude\claude.exe`)
- [ ] ✅ WSL detection and fallback
- [ ] ✅ WSL user home (`/home/$USER/.claude/`)
- [ ] ✅ %CLAUDE_PATH% environment variable

### Platform-Specific Features
- [ ] taskkill /F for process termination
- [ ] 8KB command line limit handled
- [ ] Path translation (C:\ → /mnt/c/)
- [ ] CRLF → LF conversion in streams
- [ ] Windows Defender exceptions
- [ ] Stdin fallback for large prompts

### WSL Testing
- [ ] WSL 1 - Ubuntu 20.04
- [ ] WSL 1 - Ubuntu 22.04
- [ ] WSL 2 - Ubuntu 20.04
- [ ] WSL 2 - Ubuntu 22.04
- [ ] WSL 2 - Debian 11
- [ ] Dynamic user detection (`whoami`)
- [ ] Path translation both directions

### Build Process
```bash
# Clean build
rmdir /s /q target
rmdir /s /q src-tauri\target

# Install dependencies
npm install

# Build for Windows
npm run tauri:build:win

# Output location
# target\release\bundle\msi\yurucode_*_x64_en-US.msi
# target\release\bundle\nsis\yurucode_*_x64-setup.exe
```

### Testing Matrix
- [ ] Windows 10 Home x64
- [ ] Windows 10 Pro x64
- [ ] Windows 11 Home x64
- [ ] Windows 11 Pro x64
- [ ] Windows 10 + WSL 1
- [ ] Windows 10 + WSL 2
- [ ] Windows 11 + WSL 2

### Antivirus Testing
- [ ] Windows Defender
- [ ] Bitdefender
- [ ] Norton
- [ ] McAfee
- [ ] Kaspersky
- [ ] No false positives
- [ ] Process spawning not blocked

### Release Artifacts
- [ ] .msi installer created
- [ ] .exe setup created
- [ ] File size < 80MB
- [ ] Version number updated
- [ ] Code signed (if certificates available)

## Linux Release Checklist (Bonus)

### Distributions to Test
- [ ] Ubuntu 20.04 LTS
- [ ] Ubuntu 22.04 LTS
- [ ] Debian 11
- [ ] Fedora 38
- [ ] Arch Linux (latest)

### Binary Formats
- [ ] .deb package
- [ ] .rpm package
- [ ] .AppImage
- [ ] .tar.gz archive

### Platform Features
- [ ] Binary detection in standard paths
- [ ] Process termination with signals
- [ ] No platform-specific flags needed
- [ ] Works with Wayland and X11

## Cross-Platform Validation

### Feature Parity Tests
Run these on EVERY platform before release:

**Core Functionality:**
- [ ] Send simple message
- [ ] Send code block
- [ ] Send multi-line message
- [ ] Stop streaming (Escape key)
- [ ] Clear context (Ctrl+L)

**Session Management:**
- [ ] New session (Ctrl+T)
- [ ] Resume session
- [ ] Switch tabs
- [ ] Close tab (Ctrl+W)
- [ ] Multiple concurrent sessions

**Long Running Tasks:**
- [ ] 5-minute task completes
- [ ] 30-minute task completes
- [ ] 2-hour task completes
- [ ] No freezes
- [ ] Memory stable

**Large Output:**
- [ ] 10MB output handled
- [ ] 100MB output handled
- [ ] No data loss
- [ ] Smooth scrolling
- [ ] Copy/paste works

**Process Management:**
- [ ] All processes killed on exit
- [ ] No orphaned processes
- [ ] Kill during streaming works
- [ ] Crash recovery works

## Performance Benchmarks

Run on each platform and record:

| Metric | Target | macOS | Windows | WSL | Pass? |
|--------|--------|-------|---------|-----|-------|
| Startup time | <2s | ___ | ___ | ___ | ☐ |
| Memory idle | <150MB | ___ | ___ | ___ | ☐ |
| Memory streaming | <300MB | ___ | ___ | ___ | ☐ |
| CPU idle | <5% | ___ | ___ | ___ | ☐ |
| CPU streaming | <15% | ___ | ___ | ___ | ☐ |
| Message latency | <50ms | ___ | ___ | ___ | ☐ |
| 5-min task | 100% | ___ | ___ | ___ | ☐ |
| 30-min task | 100% | ___ | ___ | ___ | ☐ |
| 2-hour task | 100% | ___ | ___ | ___ | ☐ |

## Release Process

### 1. Version Bump
```bash
# Update version in:
# - package.json
# - src-tauri/Cargo.toml
# - src-tauri/tauri.conf.json
```

### 2. Changelog
```markdown
## v2.0.0 - Direct CLI Architecture

### 🚀 Major Changes
- Replaced embedded server with direct CLI spawning
- Fixed freeze bug on long-running tasks
- Reduced memory usage by 85%

### ✨ Improvements
- 10x faster message processing
- 100% reliable process cleanup
- Native performance on all platforms

### 🐛 Bug Fixes
- Fixed 2-hour timeout killing Claude
- Fixed 50MB buffer overflow
- Fixed memory leaks growing to 4GB
- Fixed orphaned processes on crash

### 📦 Platform Support
- macOS: 12+ (Intel & Apple Silicon)
- Windows: 10 1903+ / 11
- Linux: Ubuntu 20.04+, Debian 11+
```

### 3. Build All Platforms
```bash
# macOS (on Mac)
npm run tauri:build:mac

# Windows (on Windows)
npm run tauri:build:win

# Linux (on Linux)
npm run tauri:build:linux
```

### 4. Test Artifacts
- [ ] Install on clean system
- [ ] First run experience works
- [ ] Auto-update works (if configured)
- [ ] Uninstall cleanly

### 5. Upload Release
- [ ] GitHub releases page
- [ ] Include all platform builds
- [ ] Attach checksums
- [ ] Tag with version
- [ ] Publish release notes

## Post-Release Monitoring

### First 24 Hours
- [ ] Monitor GitHub issues
- [ ] Check crash reports
- [ ] Verify download counts
- [ ] Test auto-update

### First Week
- [ ] Gather user feedback
- [ ] Track performance metrics
- [ ] Document any issues
- [ ] Plan hotfix if needed

## Rollback Plan

If critical issues discovered:

1. **Immediate Actions:**
   - [ ] Unlist release from GitHub
   - [ ] Post known issues
   - [ ] Revert auto-update

2. **Communication:**
   - [ ] GitHub issue explaining problem
   - [ ] Workaround instructions
   - [ ] Timeline for fix

3. **Fix Process:**
   - [ ] Identify root cause
   - [ ] Develop fix
   - [ ] Extra testing round
   - [ ] Release as hotfix

## Sign-off Requirements

### Technical Review
- [ ] Code reviewed by team
- [ ] Architecture documented
- [ ] Tests passing

### Quality Assurance
- [ ] All checklists completed
- [ ] Performance targets met
- [ ] No known P0 bugs

### Business Approval
- [ ] Version number confirmed
- [ ] Release notes approved
- [ ] Distribution plan confirmed

### Final Confirmation
- [ ] Ready for production
- [ ] Rollback plan prepared
- [ ] Team available for support

---

**Release Date:** ___________
**Version:** ___________
**Approved By:** ___________

## Notes

This migration from embedded server to direct CLI spawning is the most significant architectural change in yurucode's history. It eliminates the root cause of all freezing issues and provides a foundation for reliable, long-running Claude interactions.

Success is measured not just by features working, but by the complete elimination of freezes and memory leaks that have plagued users. This release must deliver on the promise of reliability.
# Building yurucode for Windows

## Prerequisites
- Node.js 18+ installed
- Windows 10/11
- Git Bash or Command Prompt

## Build Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Build React App
```bash
npm run build
```

### 3. Build Windows Installer and Portable Version

#### Option A: Use the batch script (Recommended)
Double-click `build-windows.bat` in Windows Explorer

#### Option B: Manual build
```bash
# Build installer (.exe)
npx electron-builder --win nsis --x64

# Build portable version
npx electron-builder --win portable --x64
```

## Output Files

After successful build, you'll find:

- **Installer**: `release-final/yurucode-setup-1.0.0.exe`
  - Full Windows installer with Start Menu shortcuts
  - Desktop shortcut option
  - Uninstaller included
  
- **Portable**: `release-final/yurucode-portable-1.0.0.exe`
  - Single executable file
  - No installation required
  - Can run from USB drive

## Troubleshooting

### Build hangs or times out
- Run the build from Windows Command Prompt or PowerShell instead of WSL
- Close any running instances of yurucode before building
- Ensure you have enough disk space (at least 2GB free)

### Icon not showing
- Make sure `assets/yurucode.ico` exists
- The icon file should be 256x256 pixels

### Missing dependencies
```bash
npm ci
```

## Distribution

The installer is ready for distribution. Users can:
1. Download `yurucode-setup-1.0.0.exe`
2. Run the installer
3. Choose installation directory (optional)
4. Launch yurucode from Start Menu or Desktop shortcut

The portable version can be distributed as-is and run from any location.
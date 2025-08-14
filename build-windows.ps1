Write-Host "========================================"
Write-Host "Building yurucode for Windows..."
Write-Host "========================================"
Write-Host ""

# Build the frontend and Tauri app
npm run tauri:build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "BUILD SUCCESS!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "Executable: src-tauri\target\release\yurucode.exe"
Write-Host ""
Write-Host "The exe will:"
Write-Host "- Auto-start Node.js server"
Write-Host "- Open in native window"
Write-Host "- Close properly when you exit"
Write-Host ""

$run = Read-Host "Run it now? (Y/N)"
if ($run -eq 'Y' -or $run -eq 'y') {
    Start-Process "src-tauri\target\release\yurucode.exe"
}
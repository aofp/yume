# Installing Yume on macOS

## ✅ Recommended: Use the .pkg Installer (Automatic)

**Download `yume_[version]_arm64.pkg`** from the releases page.

1. Double-click the `.pkg` file
2. Click through the installer
3. ✅ Done! The app opens without any errors.

The `.pkg` installer **automatically removes quarantine flags** during installation. No commands needed!

---

## Alternative: Manual Fix for .dmg (30 seconds)

If you downloaded the `.dmg` instead:

### The Problem

macOS Gatekeeper blocks unsigned applications downloaded from the internet with a "damaged" error. This is a security feature to protect users from malware.

### Quick Fix

After downloading and opening the DMG, **before dragging to Applications**, run this command in Terminal:

```bash
xattr -cr ~/Downloads/yume.app
```

Then drag to Applications and open normally.

### Alternative: If Already in Applications

If you already moved it to Applications:

```bash
xattr -cr /Applications/yume.app
```

Then right-click the app and select **Open** (first time only).

## Why This Happens

Yume is currently distributed without Apple Developer notarization ($99/year). The app itself is safe and open-source, but macOS requires manual approval for unsigned apps.

## Permanent Solution (For Developers)

To distribute without this workaround, the developer needs to:

1. **Get Apple Developer account** ($99/year)
2. **Sign with Developer ID**: Update `tauri.conf.json`:
   ```json
   "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)"
   ```
3. **Enable Hardened Runtime**:
   ```json
   "hardenedRuntime": true
   ```
4. **Notarize the app**:
   ```bash
   ./scripts/notarize.sh /path/to/yume.app
   ```

See `scripts/notarize.sh` for the notarization workflow.

## Security Note

You can verify the app is safe by:
- Checking the [open source code](https://github.com/aofp/yume)
- Running `codesign -dvv /Applications/yume.app` to verify integrity
- Building from source yourself: `npm run tauri:build:mac`

---

**Need help?** [Report issues on GitHub](https://github.com/aofp/yume/issues)

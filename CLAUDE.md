# CLAUDE.md - yume-io Repository

This repository hosts the GitHub Pages site and release management for the aofp/yume project.

## CRITICAL: Release Management with PAT

**ALWAYS use the Personal Access Token (PAT) for creating releases on aofp/yume:**

```bash
export GH_TOKEN="<PAT_TOKEN_HERE>"
```

**NEVER use the yuruko GitHub account for aofp/yume releases** - it only has read access.

## Repository Structure

- `releases/` - Release artifacts and metadata
  - `releases.json` - Version manifest with checksums (CRITICAL - powers the website)
  - `v*.md` - Release notes for each version
  - `yume_X.X.X_*.pkg/exe` - Installer files (current version only)

- `scripts/` - Automated release scripts
  - `validate-release.sh` - Pre-publish validation
  - `publish-release.sh` - Automated publishing
  - `verify-release.sh` - Post-publish verification

- `index.html` - Main website
- `version.txt` - Current version (used by app update checker)

## Automated Release Process

### Prerequisites

1. Build all artifacts in yume repo (ARM64, x64, Windows)
2. Copy installers to `~/yume-io/releases/`
3. Calculate checksums
4. Update `releases.json` with new version entry
5. Create release notes file `v{VERSION}-release-notes.md`
6. Create GitHub release with assets uploaded

### Step 1: Validate Everything

```bash
cd ~/yume-io
./scripts/validate-release.sh 0.2.2
```

Checks:
- GitHub release exists with all 3 assets
- Local installer files exist
- Release notes file exists
- releases.json has correct version as latest
- version.txt will be auto-updated
- Checksums are present

### Step 2: Publish to GitHub Pages

```bash
./scripts/publish-release.sh 0.2.2
```

Automates:
- Updates version.txt
- Commits all changes
- Pushes to origin/main
- Waits for GitHub Pages deployment
- Shows status

**CRITICAL**: This script does what you kept forgetting:
- ✅ Commits releases.json
- ✅ Updates version.txt
- ✅ Pushes to GitHub
- ✅ Waits for deployment

### Step 3: Verify Live Site

```bash
./scripts/verify-release.sh 0.2.2
```

Verifies:
- version.txt shows correct version
- releases.json shows correct latest
- Download links work (HTTP 302 redirects)
- GitHub release is accessible

## Manual Release Process (Fallback)

If scripts fail, manual steps:

### 1. Update version.txt

```bash
echo "X.X.X" > ~/yume-io/version.txt
```

### 2. Update releases.json

Add new entry at TOP of releases array with:
- version, date, notes, releaseNotes
- downloads (filenames only)
- checksums (SHA256)

Update "latest" field to new version.

### 3. Commit and Push

```bash
cd ~/yume-io
git add version.txt releases/releases.json releases/v{VERSION}-release-notes.md
git commit -m "release: v{VERSION}"
git push origin main
```

### 4. Wait for GitHub Pages

```bash
gh api repos/aofp/yume/pages | jq '.status'
```

Wait until status is "built" (usually 30-60 seconds).

### 5. Verify

```bash
curl https://aofp.github.io/yume/version.txt
curl https://aofp.github.io/yume/releases/releases.json | jq '.latest'
```

## How Download Links Work

Website downloads from **GitHub Releases**, not this repo.

URL format: `https://github.com/aofp/yume/releases/download/v{VERSION}/filename`

releases.json tells the website what versions exist and filenames to use.

## Troubleshooting

**Website shows old version?**
1. Check releases.json was committed and pushed
2. Wait for GitHub Pages to rebuild (check status with gh api)
3. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
4. Verify: `curl https://aofp.github.io/yume/releases/releases.json | jq '.latest'`

**Downloads not working?**
1. Verify GitHub Release exists: `gh release view v{VERSION} --repo aofp/yume`
2. Check assets uploaded: `gh release view v{VERSION} --repo aofp/yume --json assets`
3. Filenames in releases.json must match GitHub Release assets exactly

**Update notification not showing?**
1. Check version.txt: `curl https://aofp.github.io/yume/version.txt`
2. If wrong, update and push to trigger GitHub Pages rebuild
3. App checks this file every startup after 5 second delay

## Important Notes

- **Always use PAT** for GitHub operations on aofp/yume
- releases.json MUST match GitHub Releases
- Checksums must be SHA256
- Bundle identifier: `io.github.aofp.yume`
- Old installer files can be deleted after release (served from GitHub Releases)
- GitHub Pages serves from main branch root

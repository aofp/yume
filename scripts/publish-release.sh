#!/bin/bash
# Publish release to GitHub Pages
# Usage: ./scripts/publish-release.sh 0.2.2

set -e

VERSION=$1
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ -z "$VERSION" ]; then
    echo -e "${RED}❌ Error: Version required${NC}"
    echo "Usage: ./scripts/publish-release.sh 0.2.2"
    exit 1
fi

echo -e "${BLUE}📦 Publishing yume v$VERSION to GitHub Pages...${NC}"
echo ""

# Step 1: Validate first
echo "Step 1/5: Running validation..."
if ! ./scripts/validate-release.sh "$VERSION"; then
    echo -e "${RED}❌ Validation failed. Fix errors before publishing.${NC}"
    exit 1
fi
echo ""

# Step 2: Update version.txt
echo "Step 2/5: Updating version.txt..."
echo "$VERSION" > version.txt
echo -e "${GREEN}✓${NC} version.txt updated to $VERSION"
echo ""

# Step 3: Git commit and push
echo "Step 3/5: Committing to git..."
git add version.txt releases/releases.json releases/v${VERSION}-release-notes.md 2>/dev/null || true
git add releases/yume_${VERSION}_arm64.pkg releases/yume_${VERSION}_x64.pkg releases/yume_${VERSION}_x64-setup.exe 2>/dev/null || true

if [ -z "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠${NC}  No changes to commit"
else
    git commit -m "release: v$VERSION - publish to GitHub Pages

- Update releases.json with v$VERSION
- Update version.txt to $VERSION
- Add release notes and installers"

    echo -e "${GREEN}✓${NC} Changes committed"
fi
echo ""

# Step 4: Push to GitHub
echo "Step 4/5: Pushing to GitHub..."
git push origin main
echo -e "${GREEN}✓${NC} Pushed to origin/main"
echo ""

# Step 5: Wait for GitHub Pages to build
echo "Step 5/5: Waiting for GitHub Pages deployment..."
echo -n "  Status: "

MAX_WAIT=120 # 2 minutes max
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    STATUS=$(gh api repos/aofp/yume/pages 2>/dev/null | jq -r '.status' || echo "unknown")

    if [ "$STATUS" = "built" ]; then
        echo -e "\n${GREEN}✓${NC} GitHub Pages deployed successfully"
        break
    elif [ "$STATUS" = "building" ]; then
        echo -n "."
        sleep 5
        ELAPSED=$((ELAPSED + 5))
    else
        echo -e "\n${YELLOW}⚠${NC}  Status: $STATUS (waiting...)"
        sleep 5
        ELAPSED=$((ELAPSED + 5))
    fi
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo -e "\n${YELLOW}⚠${NC}  Timeout waiting for deployment. Check status manually:"
    echo "    gh api repos/aofp/yume/pages | jq '.status'"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Release v$VERSION published!${NC}"
echo ""
echo "🔗 URLs:"
echo "  Website:        https://aofp.github.io/yume/"
echo "  GitHub Release: https://github.com/aofp/yume/releases/tag/v$VERSION"
echo "  releases.json:  https://aofp.github.io/yume/releases/releases.json"
echo "  version.txt:    https://aofp.github.io/yume/version.txt"
echo ""
echo "Next steps:"
echo "  ./scripts/verify-release.sh $VERSION"

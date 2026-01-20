#!/bin/bash
set -e

VERSION=$1
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$VERSION" ]; then
    echo -e "${RED}❌ Version required${NC}"
    echo "Usage: ./scripts/verify-release.sh 0.2.2"
    exit 1
fi

echo "🔍 Verifying release v$VERSION is live..."
echo ""

ERRORS=0

echo -n "version.txt on website... "
LIVE_VERSION=$(curl -sf "https://aofp.github.io/yume/version.txt?t=$(date +%s)" | tr -d '\n')
if [ "$LIVE_VERSION" = "$VERSION" ]; then
    echo -e "${GREEN}✓${NC} $LIVE_VERSION"
else
    echo -e "${RED}✗${NC} Expected $VERSION, got $LIVE_VERSION"
    ERRORS=$((ERRORS + 1))
fi

echo -n "releases.json latest version... "
LIVE_LATEST=$(curl -sf "https://aofp.github.io/yume/releases/releases.json?t=$(date +%s)" | jq -r '.latest')
if [ "$LIVE_LATEST" = "$VERSION" ]; then
    echo -e "${GREEN}✓${NC} $LIVE_LATEST"
else
    echo -e "${RED}✗${NC} Expected $VERSION, got $LIVE_LATEST"
    ERRORS=$((ERRORS + 1))
fi

echo -n "releases.json first release... "
FIRST_RELEASE=$(curl -sf "https://aofp.github.io/yume/releases/releases.json?t=$(date +%s)" | jq -r '.releases[0].version')
if [ "$FIRST_RELEASE" = "$VERSION" ]; then
    echo -e "${GREEN}✓${NC} $FIRST_RELEASE"
else
    echo -e "${RED}✗${NC} Expected $VERSION, got $FIRST_RELEASE"
    ERRORS=$((ERRORS + 1))
fi

echo -n "GitHub release exists... "
if gh release view "v$VERSION" --repo aofp/yume >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo -n "Download links work... "
BASE_URL="https://github.com/aofp/yume/releases/download/v$VERSION"
ARM_HTTP=$(curl -sI "$BASE_URL/yume_${VERSION}_arm64.pkg" | head -1 | awk '{print $2}')
X64_HTTP=$(curl -sI "$BASE_URL/yume_${VERSION}_x64.pkg" | head -1 | awk '{print $2}')
WIN_HTTP=$(curl -sI "$BASE_URL/yume_${VERSION}_x64-setup.exe" | head -1 | awk '{print $2}')

if [ "$ARM_HTTP" = "302" ] && [ "$X64_HTTP" = "302" ] && [ "$WIN_HTTP" = "302" ]; then
    echo -e "${GREEN}✓${NC} All 3 assets downloadable"
else
    echo -e "${RED}✗${NC} HTTP codes: ARM=$ARM_HTTP, x64=$X64_HTTP, WIN=$WIN_HTTP"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ Release v$VERSION is fully live and working!${NC}"
    echo ""
    echo "Users can now:"
    echo "  • Visit https://aofp.github.io/yume/"
    echo "  • See v$VERSION as the latest version"
    echo "  • Download all 3 installers"
    echo "  • Get update notifications in the app"
    exit 0
else
    echo -e "${RED}❌ $ERRORS error(s) detected${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  • Wait a few minutes for GitHub Pages to sync"
    echo "  • Clear browser cache and try again"
    echo "  • Check: gh api repos/aofp/yume/pages | jq '.status'"
    exit 1
fi

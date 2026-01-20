#!/bin/bash
# Validate all requirements are met before releasing
# Usage: ./scripts/validate-release.sh 0.2.2

set -e

VERSION=$1
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$VERSION" ]; then
    echo -e "${RED}❌ Error: Version required${NC}"
    echo "Usage: ./scripts/validate-release.sh 0.2.2"
    exit 1
fi

echo "🔍 Validating release v$VERSION..."
echo ""

ERRORS=0
WARNINGS=0

# Check 1: GitHub release exists
echo -n "Checking GitHub release v$VERSION exists... "
if gh release view "v$VERSION" --repo aofp/yume >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${YELLOW}  Run: gh release create v$VERSION --repo aofp/yume${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: Release assets exist on GitHub
echo -n "Checking release assets... "
ASSETS=$(gh release view "v$VERSION" --repo aofp/yume --json assets -q '.assets[].name' 2>/dev/null || echo "")
if echo "$ASSETS" | grep -q "yume_${VERSION}_arm64.pkg" && \
   echo "$ASSETS" | grep -q "yume_${VERSION}_x64.pkg" && \
   echo "$ASSETS" | grep -q "yume_${VERSION}_x64-setup.exe"; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${YELLOW}  Missing assets. Expected:${NC}"
    echo "    - yume_${VERSION}_arm64.pkg"
    echo "    - yume_${VERSION}_x64.pkg"
    echo "    - yume_${VERSION}_x64-setup.exe"
    ERRORS=$((ERRORS + 1))
fi

# Check 3: Local installer files exist
echo -n "Checking local installer files... "
if [ -f "releases/yume_${VERSION}_arm64.pkg" ] && \
   [ -f "releases/yume_${VERSION}_x64.pkg" ] && \
   [ -f "releases/yume_${VERSION}_x64-setup.exe" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${YELLOW}  Missing local files in releases/${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 4: Release notes exist
echo -n "Checking release notes file... "
if [ -f "releases/v${VERSION}-release-notes.md" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${YELLOW}  Create: releases/v${VERSION}-release-notes.md${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 5: releases.json has correct version
echo -n "Checking releases.json... "
LATEST=$(jq -r '.latest' releases/releases.json 2>/dev/null || echo "")
FIRST_VERSION=$(jq -r '.releases[0].version' releases/releases.json 2>/dev/null || echo "")
if [ "$LATEST" = "$VERSION" ] && [ "$FIRST_VERSION" = "$VERSION" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${YELLOW}  Expected latest=$VERSION, got latest=$LATEST${NC}"
    echo -e "${YELLOW}  Expected releases[0]=$VERSION, got releases[0]=$FIRST_VERSION${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 6: version.txt matches
echo -n "Checking version.txt... "
VERSION_TXT=$(cat version.txt 2>/dev/null | tr -d '\n' || echo "")
if [ "$VERSION_TXT" = "$VERSION" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${YELLOW}  Expected $VERSION, got $VERSION_TXT${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 7: Checksums in releases.json match GitHub release
echo -n "Checking checksums... "
LOCAL_ARM_SHA=$(jq -r ".releases[] | select(.version==\"$VERSION\") | .checksums.mac_arm" releases/releases.json 2>/dev/null || echo "")
LOCAL_X64_SHA=$(jq -r ".releases[] | select(.version==\"$VERSION\") | .checksums.mac" releases/releases.json 2>/dev/null || echo "")
LOCAL_WIN_SHA=$(jq -r ".releases[] | select(.version==\"$VERSION\") | .checksums.windows" releases/releases.json 2>/dev/null || echo "")

if [ -n "$LOCAL_ARM_SHA" ] && [ -n "$LOCAL_X64_SHA" ] && [ -n "$LOCAL_WIN_SHA" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC}"
    echo -e "${YELLOW}  Missing checksums in releases.json${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Check 8: Git status clean
echo -n "Checking git status... "
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC}"
    echo -e "${YELLOW}  Uncommitted changes detected${NC}"
    git status --short
    WARNINGS=$((WARNINGS + 1))
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready to publish.${NC}"
    echo ""
    echo "Next steps:"
    echo "  ./scripts/publish-release.sh $VERSION"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  $WARNINGS warning(s), but can proceed${NC}"
    exit 0
else
    echo -e "${RED}❌ $ERRORS error(s) found. Fix before publishing.${NC}"
    exit 1
fi

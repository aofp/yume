#!/bin/bash
# Deploy yurucode.com website
# This script deploys the website files to your server

set -e

echo "yurucode.com Deployment Script"
echo "=============================="
echo ""

# Configuration
LOCAL_PATH="/Users/yuru/yurucode/yurucode.com"
REMOTE_HOST="your-server.com"  # UPDATE THIS
REMOTE_USER="your-username"     # UPDATE THIS
REMOTE_PATH="/var/www/yurucode.com"  # UPDATE THIS

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Pre-deployment checks...${NC}"

# Check if keygen.php exists in parent directory
if [ ! -f "$LOCAL_PATH/../keygen.php" ]; then
    echo -e "${RED}Error: keygen.php not found in parent directory${NC}"
    exit 1
fi

# Check if .env.secret exists
if [ ! -f "$LOCAL_PATH/.env.secret" ]; then
    echo -e "${RED}Error: .env.secret not found${NC}"
    echo "Please create yurucode.com/.env.secret with your secrets"
    exit 1
fi

echo -e "${GREEN}✓ All required files found${NC}"

# Files to deploy
echo ""
echo "Files to deploy:"
echo "- Website files (HTML, PHP, images)"
echo "- keygen.php (from parent directory)"
echo "- .env.secret (secrets file)"
echo ""

read -p "Deploy to $REMOTE_HOST? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

echo ""
echo -e "${YELLOW}Deploying files...${NC}"

# Create deployment package
TEMP_DIR=$(mktemp -d)
echo "Creating deployment package in $TEMP_DIR"

# Copy website files
cp -r "$LOCAL_PATH"/* "$TEMP_DIR/"

# Copy keygen.php to parent level
cp "$LOCAL_PATH/../keygen.php" "$TEMP_DIR/../keygen.php"

# Copy .env.secret
cp "$LOCAL_PATH/.env.secret" "$TEMP_DIR/.env.secret"

# Create necessary directories
mkdir -p "$TEMP_DIR/rate_limits"
mkdir -p "$TEMP_DIR/licenses"

# Set permissions
chmod 755 "$TEMP_DIR"
chmod 644 "$TEMP_DIR"/*.php
chmod 644 "$TEMP_DIR"/*.html
chmod 600 "$TEMP_DIR/.env.secret"
chmod 755 "$TEMP_DIR/rate_limits"
chmod 755 "$TEMP_DIR/licenses"

echo -e "${GREEN}✓ Deployment package created${NC}"

# Deploy via rsync (if you have SSH access)
if command -v rsync &> /dev/null; then
    echo ""
    echo -e "${YELLOW}Deploying via rsync...${NC}"
    echo "Command: rsync -avz --exclude='.git' --exclude='*.md' $TEMP_DIR/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"
    
    # Uncomment this when you have configured the remote server
    # rsync -avz --exclude='.git' --exclude='*.md' "$TEMP_DIR/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"
    
    echo -e "${GREEN}✓ Files deployed${NC}"
else
    echo -e "${YELLOW}rsync not available. Please manually upload files from:${NC}"
    echo "$TEMP_DIR"
fi

# Clean up
# rm -rf "$TEMP_DIR"

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "Post-deployment checklist:"
echo "1. [ ] Verify .env.secret is uploaded and has correct permissions (600)"
echo "2. [ ] Verify keygen.php is in the parent directory of the web root"
echo "3. [ ] Test license generation at https://yurucode.com/license-system.php"
echo "4. [ ] Test validation API at https://yurucode.com/validate-license-api.php"
echo "5. [ ] Verify PayPal integration on the website"
echo "6. [ ] Test purchasing a license"
echo ""
echo "Security reminders:"
echo "- Never commit .env.secret to git"
echo "- Keep rate_limits/ and licenses/ directories writable by web server"
echo "- Monitor license_log files in licenses/ directory"
echo "- CC emails go to muukoa@gmail.com"
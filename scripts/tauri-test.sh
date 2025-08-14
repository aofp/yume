#!/bin/bash

echo "🚀 yurucode Tauri Test Script"
echo "=============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Rust installation
echo -e "${YELLOW}Checking Rust installation...${NC}"
if command -v cargo &> /dev/null; then
    echo -e "${GREEN}✓ Rust installed: $(cargo --version)${NC}"
else
    echo -e "${RED}✗ Rust not found. Please install Rust first.${NC}"
    exit 1
fi

# Check Node installation
echo -e "${YELLOW}Checking Node.js installation...${NC}"
if command -v node &> /dev/null; then
    echo -e "${GREEN}✓ Node.js installed: $(node --version)${NC}"
else
    echo -e "${RED}✗ Node.js not found. Please install Node.js first.${NC}"
    exit 1
fi

# Check Tauri CLI
echo -e "${YELLOW}Checking Tauri CLI...${NC}"
if npm list @tauri-apps/cli &> /dev/null; then
    echo -e "${GREEN}✓ Tauri CLI installed${NC}"
else
    echo -e "${YELLOW}Installing Tauri CLI...${NC}"
    npm install --save-dev @tauri-apps/cli
fi

# Build Rust backend
echo -e "${YELLOW}Building Rust backend...${NC}"
cd src-tauri
cargo build --release
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Rust backend built successfully${NC}"
else
    echo -e "${RED}✗ Rust build failed${NC}"
    exit 1
fi
cd ..

# Build frontend
echo -e "${YELLOW}Building frontend...${NC}"
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend built successfully${NC}"
else
    echo -e "${RED}✗ Frontend build failed${NC}"
    exit 1
fi

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✓ All checks passed!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "You can now run:"
echo "  npm run tauri:dev    # Development mode"
echo "  npm run tauri:build  # Production build"
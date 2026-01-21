#!/bin/bash
# Build Yume for Linux using Docker

set -e

echo "🐧 Building Yume for Linux..."

# Build the docker image
docker build -f Dockerfile.linux -t yume-linux-builder .

# Create output directory
mkdir -p dist-linux

# Copy built artifacts from container
docker run --rm -v "$(pwd)/dist-linux:/output" yume-linux-builder sh -c \
    "cp -r /app/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/* /output/ 2>/dev/null || echo 'No bundle found, checking release dir...' && ls -la /app/src-tauri/target/x86_64-unknown-linux-gnu/release/"

echo "✅ Linux build complete!"
echo "📁 Output: dist-linux/"
ls -la dist-linux/

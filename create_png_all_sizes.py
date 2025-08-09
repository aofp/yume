#!/usr/bin/env python3
"""
Create all PNG sizes from yurucode.png
"""

from PIL import Image
import os

# Input file
input_png = "yurucode.png"

# PNG sizes needed
png_sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

try:
    # Open the source image
    img = Image.open(input_png)
    
    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Create PNG files for each size
    for size in png_sizes:
        output_path = f"assets/icons/png/{size}x{size}.png"
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(output_path, "PNG")
        print(f"Created {output_path}")
    
    # Copy the 256x256 to main mac icon
    import shutil
    shutil.copy2("assets/icons/png/256x256.png", "assets/icons/mac/icon.png")
    print("Updated assets/icons/mac/icon.png")
    
    # Copy main image to various locations
    shutil.copy2(input_png, "assets/yurucode.png")
    shutil.copy2(input_png, "public/yurucode.png")
    shutil.copy2(input_png, "public/assets/yurucode.png")
    shutil.copy2(input_png, "build/icon.png")
    shutil.copy2(input_png, "icon.png")
    print("\nCopied main PNG to all locations")
    
    print("\nAll PNG files created successfully!")
    
except Exception as e:
    print("Error: " + str(e))
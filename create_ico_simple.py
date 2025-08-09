#!/usr/bin/env python3
"""
Convert yurucode.png to ICO format with multiple sizes
"""

from PIL import Image
import shutil

# Input and output paths
input_png = "yurucode.png"
output_ico = "assets/yurucode.ico"
output_ico_build = "build/icon.ico"
output_ico_win = "assets/icons/win/icon.ico"

# ICO sizes (Windows requires these specific sizes)
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

try:
    # Open the source image
    img = Image.open(input_png)
    
    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Create list of resized images
    icon_images = []
    for size in ico_sizes:
        # Resize with high quality
        resized = img.resize(size, Image.Resampling.LANCZOS)
        icon_images.append(resized)
    
    # Save as ICO with all sizes
    icon_images[0].save(output_ico, format='ICO', sizes=ico_sizes, append_images=icon_images[1:])
    print("Created " + output_ico)
    
    # Copy to other locations
    shutil.copy2(output_ico, output_ico_build)
    print("Copied to " + output_ico_build)
    
    shutil.copy2(output_ico, output_ico_win)
    print("Copied to " + output_ico_win)
    
    # Also update favicon
    shutil.copy2(output_ico, "public/favicon.ico")
    print("Updated public/favicon.ico")
    
    print("\nICO files created successfully!")
    
except Exception as e:
    print("Error: " + str(e))
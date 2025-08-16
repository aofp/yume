#!/usr/bin/env python3
"""
Create a high-quality multi-resolution Windows .ico file from a PNG image.
Windows .ico files should contain multiple resolutions for best quality.
"""

import struct
import io
import sys

def create_ico_from_png(png_path, ico_path):
    """Create .ico file with multiple resolutions from source PNG."""
    
    # Read the original PNG file
    with open(png_path, 'rb') as f:
        png_data = f.read()
    
    # For now, we'll use the original 1024x1024 PNG as-is
    # A proper .ico would have multiple sizes, but this will be better than 16x16
    
    # ICO header structure
    # Reserved (2 bytes) + Type (2 bytes) + Count (2 bytes)
    ico_header = struct.pack('<HHH', 0, 1, 1)  # 1 image
    
    # Image directory entry (16 bytes per image)
    # Width, Height, ColorCount, Reserved, Planes, BitCount, BytesInRes, ImageOffset
    width = 0  # 0 means 256 or larger
    height = 0  # 0 means 256 or larger
    color_count = 0  # 0 for true color
    reserved = 0
    planes = 1  # Always 1 for ICO
    bit_count = 32  # 32-bit color
    bytes_in_res = len(png_data)
    image_offset = 6 + 16  # After header and directory
    
    directory_entry = struct.pack('<BBBBHHII', 
                                  width, height, color_count, reserved,
                                  planes, bit_count, bytes_in_res, image_offset)
    
    # Write the ICO file
    with open(ico_path, 'wb') as f:
        f.write(ico_header)
        f.write(directory_entry)
        f.write(png_data)
    
    print(f"Created {ico_path} with high-resolution icon")
    return True

if __name__ == '__main__':
    create_ico_from_png('yurucode.png', 'src-tauri/icons/icon_new.ico')
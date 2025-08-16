#!/usr/bin/env python
"""
Create proper Windows icons with transparency and multiple resolutions.
Uses Pillow to properly convert and resize the image.
"""

from PIL import Image
import os
import struct
import io

def create_high_quality_ico(source_png_path, ico_path):
    """Create a high-quality multi-resolution ICO file with transparency."""
    
    # Open the source image
    img = Image.open(source_png_path)
    
    # Convert to RGBA to ensure transparency is preserved
    if img.mode != 'RGBA':
        # If indexed, convert to RGBA to preserve any transparency
        if img.mode == 'P':
            # Check if palette has transparency
            if 'transparency' in img.info:
                img = img.convert('RGBA')
            else:
                # Add alpha channel
                img = img.convert('RGBA')
        else:
            img = img.convert('RGBA')
    
    print(f"Source image: {img.size}, mode: {img.mode}")
    
    # Windows icon sizes for best quality at all DPI settings
    # Including larger sizes for high DPI displays
    sizes = [
        (16, 16),
        (24, 24),
        (32, 32),
        (48, 48),
        (64, 64),
        (128, 128),
        (256, 256)
    ]
    
    # Create resized versions
    icon_images = []
    for size in sizes:
        # Use high-quality resampling for downsizing
        resized = img.resize(size, Image.Resampling.LANCZOS)
        icon_images.append(resized)
        print(f"Created {size[0]}x{size[1]} icon")
    
    # Save as ICO with all sizes
    icon_images[0].save(
        ico_path,
        format='ICO',
        sizes=[img.size for img in icon_images],
        append_images=icon_images[1:]
    )
    
    print(f"Saved multi-resolution ICO: {ico_path}")
    return True

def create_png_icons(source_png_path, output_dir):
    """Create PNG icons in various sizes with proper transparency."""
    
    # Open source image
    img = Image.open(source_png_path)
    
    # Convert to RGBA for transparency
    if img.mode != 'RGBA':
        if img.mode == 'P':
            img = img.convert('RGBA')
        else:
            img = img.convert('RGBA')
    
    # Define the PNG files to create
    png_files = {
        '32x32.png': (32, 32),
        '128x128.png': (128, 128),
        '128x128@2x.png': (256, 256),
        'icon.png': img.size,  # Keep original size
        'Square44x44Logo.png': (44, 44),
        'Square71x71Logo.png': (71, 71),
        'Square89x89Logo.png': (89, 89),
        'Square107x107Logo.png': (107, 107),
        'Square142x142Logo.png': (142, 142),
        'Square150x150Logo.png': (150, 150),
        'Square284x284Logo.png': (284, 284),
        'Square310x310Logo.png': (310, 310),
        'StoreLogo.png': (50, 50),
    }
    
    for filename, size in png_files.items():
        output_path = os.path.join(output_dir, filename)
        
        if size == img.size:
            # Keep original
            img.save(output_path, 'PNG', optimize=True)
        else:
            # Resize with high quality
            resized = img.resize(size, Image.Resampling.LANCZOS)
            resized.save(output_path, 'PNG', optimize=True)
        
        print(f"Created {filename} ({size[0]}x{size[1]})")
    
    return True

def fix_icon_for_taskbar(source_png_path):
    """Ensure the icon works properly in Windows taskbar with transparency."""
    
    # Open and convert to RGBA
    img = Image.open(source_png_path)
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Save as RGB PNG for better compatibility
    output_rgb = 'yurucode_rgb.png'
    img.save(output_rgb, 'PNG', optimize=True)
    print(f"Created RGB PNG: {output_rgb}")
    
    return output_rgb

if __name__ == '__main__':
    source_file = 'yurucode.png'
    icons_dir = 'src-tauri/icons'
    
    if not os.path.exists(source_file):
        print(f"Error: {source_file} not found!")
        exit(1)
    
    # First create a proper RGB version
    rgb_source = fix_icon_for_taskbar(source_file)
    
    # Create the multi-resolution ICO file
    print("\nCreating multi-resolution ICO file...")
    create_high_quality_ico(source_file, os.path.join(icons_dir, 'icon.ico'))
    
    # Create all PNG icons
    print("\nCreating PNG icons...")
    create_png_icons(source_file, icons_dir)
    
    print("\n✅ All icons created successfully!")
    print("The icons now include proper transparency and multiple resolutions.")
    print("Windows will use the appropriate size for taskbar, window decorations, etc.")
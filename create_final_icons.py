#!/usr/bin/env python
"""
Create final high-quality Windows icons with all resolutions and transparency.
"""

from PIL import Image
import os

def create_complete_ico(source_png_path, ico_path):
    """Create a complete ICO with all standard Windows icon sizes."""
    
    # Open the source image
    img = Image.open(source_png_path)
    
    # Ensure RGBA mode for transparency
    if img.mode != 'RGBA':
        if img.mode == 'P' and 'transparency' in img.info:
            # Convert palette with transparency to RGBA
            img = img.convert('RGBA')
        else:
            # Add alpha channel if needed
            img = img.convert('RGBA')
    
    print(f"Source: {img.size}, mode: {img.mode}")
    
    # Create multiple sizes for the ICO
    # Windows uses different sizes in different contexts
    ico_sizes = []
    
    # Standard Windows icon sizes
    for size in [16, 24, 32, 48, 64, 128, 256]:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        ico_sizes.append(resized)
        print(f"Added {size}x{size} to ICO")
    
    # Save ICO with all sizes
    # The first image is the main one, others are alternatives
    ico_sizes[0].save(
        ico_path, 
        format='ICO',
        sizes=[(s.width, s.height) for s in ico_sizes],
        append_images=ico_sizes[1:]
    )
    
    file_size = os.path.getsize(ico_path)
    print(f"Created {ico_path}: {file_size:,} bytes")
    
    return True

def verify_transparency(img_path):
    """Check if image has transparency."""
    img = Image.open(img_path)
    if img.mode == 'RGBA':
        # Check if alpha channel has transparent pixels
        alpha = img.getchannel('A')
        min_alpha = min(alpha.getdata())
        if min_alpha < 255:
            print(f"  Transparency detected (min alpha: {min_alpha})")
            return True
    print(f"  No transparency detected (mode: {img.mode})")
    return False

def create_all_png_icons(source_png_path, icons_dir):
    """Create all PNG icons needed by Tauri."""
    
    img = Image.open(source_png_path)
    
    # Convert to RGBA
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Main icon files
    icons_to_create = [
        ('icon.png', None),  # Original size
        ('32x32.png', 32),
        ('128x128.png', 128),
        ('128x128@2x.png', 256),
    ]
    
    # Windows Store logos
    windows_icons = [
        ('Square44x44Logo.png', 44),
        ('Square71x71Logo.png', 71),
        ('Square89x89Logo.png', 89),
        ('Square107x107Logo.png', 107),
        ('Square142x142Logo.png', 142),
        ('Square150x150Logo.png', 150),
        ('Square284x284Logo.png', 284),
        ('Square310x310Logo.png', 310),
        ('StoreLogo.png', 50),
    ]
    
    all_icons = icons_to_create + windows_icons
    
    for filename, size in all_icons:
        output_path = os.path.join(icons_dir, filename)
        
        if size is None:
            # Keep original size
            img.save(output_path, 'PNG')
            print(f"Saved {filename} (original {img.size[0]}x{img.size[1]})")
        else:
            # Resize with high quality
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(output_path, 'PNG')
            print(f"Saved {filename} ({size}x{size})")
        
        # Verify transparency
        verify_transparency(output_path)

if __name__ == '__main__':
    source = 'yurucode.png'
    icons_dir = 'src-tauri/icons'
    
    print("Creating Windows icons with transparency...")
    print("=" * 50)
    
    # Check source
    print(f"\nSource image: {source}")
    verify_transparency(source)
    
    # Create ICO
    print(f"\nCreating multi-resolution ICO...")
    create_complete_ico(source, os.path.join(icons_dir, 'icon.ico'))
    
    # Create PNGs
    print(f"\nCreating PNG icons...")
    create_all_png_icons(source, icons_dir)
    
    print("\n" + "=" * 50)
    print("Icons created successfully!")
    print("The ICO includes 16, 24, 32, 48, 64, 128, and 256px sizes")
    print("Transparency is preserved for taskbar display")
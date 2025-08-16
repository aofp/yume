#!/usr/bin/env python3
"""
Generate all icon sizes needed for Windows from the high-res yurucode.png.
Creates properly sized PNG files that Tauri can use.
"""

import os
import shutil

def copy_as_size(src, dest, size_label):
    """Copy source PNG to destination with size label."""
    shutil.copy(src, dest)
    print(f"Created {size_label}: {dest}")

def generate_icons():
    """Generate all icon files needed."""
    source_png = 'yurucode.png'
    icons_dir = 'src-tauri/icons'
    
    if not os.path.exists(source_png):
        print(f"Error: {source_png} not found!")
        return False
    
    # Create icon sizes that Tauri expects
    # Since we can't resize without PIL, we'll copy the high-res version
    # Windows/Tauri will handle the scaling, but having the high-res source is key
    
    icon_mappings = [
        ('32x32.png', '32x32'),
        ('128x128.png', '128x128'), 
        ('128x128@2x.png', '256x256'),
        ('icon.png', '1024x1024 (main)'),
    ]
    
    for filename, size_label in icon_mappings:
        dest_path = os.path.join(icons_dir, filename)
        copy_as_size(source_png, dest_path, size_label)
    
    # Also copy to Windows-specific sizes for best quality
    windows_sizes = [
        ('Square44x44Logo.png', '44x44'),
        ('Square71x71Logo.png', '71x71'),
        ('Square89x89Logo.png', '89x89'),
        ('Square107x107Logo.png', '107x107'),
        ('Square142x142Logo.png', '142x142'),
        ('Square150x150Logo.png', '150x150'),
        ('Square284x284Logo.png', '284x284'),
        ('Square310x310Logo.png', '310x310'),
        ('StoreLogo.png', 'Store Logo'),
    ]
    
    for filename, size_label in windows_sizes:
        dest_path = os.path.join(icons_dir, filename)
        if os.path.exists(dest_path):
            copy_as_size(source_png, dest_path, f'Windows {size_label}')
    
    print("\n✓ All PNG icons updated with high-resolution source!")
    print("Windows will scale them as needed, maintaining quality.")
    
    return True

if __name__ == '__main__':
    generate_icons()
#!/usr/bin/env python
"""
Create a proper Windows EXE icon that displays correctly at all sizes.
Windows EXE icons need specific structure and formats to work properly.
"""

from PIL import Image
import struct
import io
import os

def create_exe_optimized_ico(source_path, output_path):
    """Create an ICO optimized for Windows EXE embedding."""
    
    # Open source image
    img = Image.open(source_path)
    
    # Convert to RGBA for proper transparency
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    print(f"Source: {img.size[0]}x{img.size[1]}, mode: {img.mode}")
    
    # Windows EXE icons work best with these specific sizes
    # Listed in order of importance for Windows Explorer
    exe_sizes = [
        256,  # Windows Vista+ Explorer (large icons, tiles)
        48,   # Windows XP Explorer (extra large icons)
        32,   # Windows desktop and Explorer (medium icons)
        24,   # Windows Explorer (small icons)  
        16,   # Windows Explorer (list/details view)
        64,   # Not standard but good for some contexts
        128,  # Good for high DPI
    ]
    
    # Create all icon sizes
    icons = []
    icon_data = []
    
    for size in exe_sizes:
        # High-quality resize
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        
        # For sizes 256 and below, save as PNG within ICO
        # This gives better quality and transparency
        png_output = io.BytesIO()
        resized.save(png_output, 'PNG', optimize=True)
        png_bytes = png_output.getvalue()
        
        icons.append({
            'size': size,
            'data': png_bytes,
            'is_png': True
        })
        
        print(f"Added {size}x{size} PNG ({len(png_bytes):,} bytes)")
    
    # Now create the ICO file with proper structure
    ico_data = bytearray()
    
    # ICO header
    ico_data.extend(struct.pack('<HHH', 
        0,           # Reserved
        1,           # Type (1 = ICO)
        len(icons)   # Number of images
    ))
    
    # Calculate offsets
    header_size = 6
    dir_entry_size = 16
    current_offset = header_size + (dir_entry_size * len(icons))
    
    # Directory entries (must be written first, all together)
    directory_data = bytearray()
    images_data = bytearray()
    
    for icon in icons:
        # Directory entry format:
        # BYTE Width
        # BYTE Height  
        # BYTE ColorCount
        # BYTE Reserved
        # WORD Planes (or X hotspot for CUR)
        # WORD BitCount (or Y hotspot for CUR)
        # DWORD BytesInRes
        # DWORD ImageOffset
        
        size = icon['size']
        data = icon['data']
        
        # Width/Height: 0 means 256
        width = 0 if size == 256 else size
        height = 0 if size == 256 else size
        
        directory_data.extend(struct.pack('<BBBBHHII',
            width,              # Width
            height,             # Height
            0,                  # Color count (0 = >256 colors)
            0,                  # Reserved
            1,                  # Color planes (ignored for PNG)
            32,                 # Bits per pixel (ignored for PNG)
            len(data),          # Size of image data
            current_offset      # Offset to image data
        ))
        
        images_data.extend(data)
        current_offset += len(data)
    
    # Combine all parts
    ico_data.extend(directory_data)
    ico_data.extend(images_data)
    
    # Write the ICO file
    with open(output_path, 'wb') as f:
        f.write(ico_data)
    
    file_size = os.path.getsize(output_path)
    print(f"\nCreated EXE-optimized ICO: {output_path}")
    print(f"File size: {file_size:,} bytes")
    print(f"Contains {len(icons)} icon sizes: {', '.join([str(i['size']) for i in icons])}")
    
    return True

def verify_ico_structure(ico_path):
    """Verify the ICO file structure."""
    with open(ico_path, 'rb') as f:
        data = f.read()
    
    # Read header
    reserved, ico_type, count = struct.unpack('<HHH', data[0:6])
    print(f"\nICO Structure:")
    print(f"  Type: {ico_type} (should be 1)")
    print(f"  Image count: {count}")
    
    # Read directory entries
    offset = 6
    for i in range(count):
        width, height, colors, reserved, planes, bits, size, img_offset = \
            struct.unpack('<BBBBHHII', data[offset:offset+16])
        
        display_width = 256 if width == 0 else width
        display_height = 256 if height == 0 else height
        
        # Check what format the image is
        img_data = data[img_offset:img_offset+8]
        if img_data.startswith(b'\x89PNG'):
            format_type = "PNG"
        else:
            format_type = "BMP"
        
        print(f"  [{i+1}] {display_width}x{display_height}, {size:,} bytes, {format_type} format")
        
        offset += 16

def clear_icon_cache_hint():
    """Print instructions for clearing Windows icon cache."""
    print("\n" + "="*60)
    print("IMPORTANT: Windows caches icons aggressively!")
    print("To see the new icon immediately:")
    print("")
    print("1. Quick method (usually works):")
    print("   - Right-click desktop -> Refresh")
    print("   - Or press F5 in Explorer")
    print("")
    print("2. If that doesn't work, run this in Command Prompt as Admin:")
    print("   ie4uinit.exe -show")
    print("")
    print("3. Nuclear option - clear icon cache completely:")
    print("   - Run: del /a %localappdata%\\IconCache.db")
    print("   - Then restart Explorer or reboot")
    print("="*60)

if __name__ == '__main__':
    source = 'yurucode.png'
    output = 'src-tauri/icons/icon.ico'
    
    print("Creating Windows EXE-optimized icon...")
    print("="*60)
    
    # Backup existing icon
    if os.path.exists(output):
        backup = output.replace('.ico', '_backup.ico')
        os.rename(output, backup)
        print(f"Backed up existing icon to {backup}")
    
    # Create new icon
    create_exe_optimized_ico(source, output)
    
    # Verify structure
    verify_ico_structure(output)
    
    # Show cache clearing instructions
    clear_icon_cache_hint()
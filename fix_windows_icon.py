#!/usr/bin/env python
"""
Fix Windows icon to show properly with transparency in taskbar.
Creates a proper multi-resolution ICO file.
"""

from PIL import Image
import os
import io

def create_robust_ico(source_path, output_path):
    """Create a robust ICO file with multiple embedded PNG images."""
    
    # Open source
    source = Image.open(source_path)
    
    # Ensure RGBA for transparency
    if source.mode != 'RGBA':
        source = source.convert('RGBA')
    
    print(f"Source image: {source.size}, mode: {source.mode}")
    
    # Check for transparency
    has_alpha = False
    if source.mode == 'RGBA':
        alpha = source.getchannel('A')
        min_alpha = min(alpha.getdata())
        max_alpha = max(alpha.getdata())
        has_alpha = min_alpha < 255
        print(f"Alpha channel: min={min_alpha}, max={max_alpha}, transparent={has_alpha}")
    
    # Create sizes - include all standard Windows sizes
    sizes_to_create = [256, 128, 64, 48, 32, 24, 16]
    
    images = []
    for size in sizes_to_create:
        # Create high-quality resize
        resized = source.resize((size, size), Image.Resampling.LANCZOS)
        
        # Ensure RGBA mode is preserved
        if resized.mode != 'RGBA':
            resized = resized.convert('RGBA')
        
        images.append(resized)
        print(f"Created {size}x{size} icon")
    
    # Save as ICO - try different approaches
    try:
        # Method 1: Save with all images at once
        images[0].save(
            output_path,
            format='ICO',
            sizes=[(img.width, img.height) for img in images],
            append_images=images[1:],
            save_all=True
        )
        
        file_size = os.path.getsize(output_path)
        print(f"\nMethod 1 - Created ICO: {file_size:,} bytes")
        
        # If file is too small, try alternative method
        if file_size < 10000:  # Less than 10KB seems wrong for 7 images
            print("File seems too small, trying alternative method...")
            
            # Method 2: Save each size individually then combine
            temp_images = []
            for img in images:
                # Convert to bytes
                byte_arr = io.BytesIO()
                img.save(byte_arr, format='PNG', optimize=False)
                byte_arr.seek(0)
                temp_img = Image.open(byte_arr)
                temp_images.append(temp_img)
            
            # Save with unoptimized PNGs
            temp_images[0].save(
                output_path,
                format='ICO',
                bitmap_format='png',
                sizes=[(img.width, img.height) for img in temp_images],
                append_images=temp_images[1:]
            )
            
            file_size = os.path.getsize(output_path)
            print(f"Method 2 - Created ICO: {file_size:,} bytes")
            
    except Exception as e:
        print(f"Error creating ICO: {e}")
        
        # Fallback: Create simple ICO with just a few sizes
        print("Using fallback method...")
        fallback_images = [images[0], images[2], images[4]]  # 256, 64, 32
        fallback_images[0].save(
            output_path,
            format='ICO',
            sizes=[(img.width, img.height) for img in fallback_images],
            append_images=fallback_images[1:]
        )
        
        file_size = os.path.getsize(output_path)
        print(f"Fallback - Created ICO: {file_size:,} bytes")
    
    return True

def test_ico_file(ico_path):
    """Test if ICO file contains multiple images."""
    try:
        ico = Image.open(ico_path)
        ico.load()
        
        # Try to get info about embedded images
        if hasattr(ico, 'ico'):
            if hasattr(ico.ico, 'sizes'):
                print(f"ICO contains sizes: {ico.ico.sizes()}")
        
        # Count frames
        frame_count = 1
        try:
            while True:
                ico.seek(frame_count)
                frame_count += 1
        except EOFError:
            pass
        
        print(f"ICO contains {frame_count} frame(s)")
        
    except Exception as e:
        print(f"Error testing ICO: {e}")

if __name__ == '__main__':
    source = 'yurucode.png'
    output = 'src-tauri/icons/icon.ico'
    
    print("Creating Windows ICO with proper transparency...")
    print("=" * 50)
    
    # Create the ICO
    create_robust_ico(source, output)
    
    # Test the result
    print("\nTesting created ICO...")
    test_ico_file(output)
    
    print("\n" + "=" * 50)
    print("Done! The ICO should now work properly in Windows taskbar.")
    print("If still having issues, the problem might be with the source PNG.")
    print("Consider converting the source PNG to true RGB+Alpha first.")
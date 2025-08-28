#!/usr/bin/env python3
import struct
import os
import sys

def read_png_dimensions(filepath):
    with open(filepath, 'rb') as f:
        f.seek(16)
        width = struct.unpack('>I', f.read(4))[0]
        height = struct.unpack('>I', f.read(4))[0]
    return width, height

def create_ico(icon_files, output_path):
    icon_data = []
    
    for filepath in icon_files:
        with open(filepath, 'rb') as f:
            data = f.read()
        width, height = read_png_dimensions(filepath)
        
        display_width = width if width < 256 else 0
        display_height = height if height < 256 else 0
        
        icon_data.append({
            'width': display_width,
            'height': display_height,
            'data': data
        })
    
    with open(output_path, 'wb') as ico:
        ico.write(struct.pack('<HHH', 0, 1, len(icon_data)))
        
        offset = 6 + 16 * len(icon_data)
        
        for icon in icon_data:
            ico.write(struct.pack('<BBBBHHII',
                icon['width'] & 0xFF,
                icon['height'] & 0xFF,
                0,
                0,
                1,
                32,
                len(icon['data']),
                offset
            ))
            offset += len(icon['data'])
        
        for icon in icon_data:
            ico.write(icon['data'])

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons_dir = os.path.join(base_dir, 'src-tauri', 'icons')
    
    icon_files = [
        os.path.join(icons_dir, '16x16.png'),
        os.path.join(icons_dir, '24x24.png'),
        os.path.join(icons_dir, '32x32.png'),
        os.path.join(icons_dir, '48x48.png'),
        os.path.join(icons_dir, '64x64.png'),
        os.path.join(icons_dir, '128x128.png'),
        os.path.join(icons_dir, '256x256.png')
    ]
    
    for f in icon_files:
        if not os.path.exists(f):
            print(f"Warning: {f} not found, skipping")
            icon_files.remove(f)
    
    output_path = os.path.join(icons_dir, 'icon.ico')
    
    print(f"Creating {output_path} with {len(icon_files)} sizes")
    create_ico(icon_files, output_path)
    print(f"Created {output_path} successfully")
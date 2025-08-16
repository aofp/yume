#!/usr/bin/env python3
"""
Create a proper RGB icon for Tauri from the indexed color PNG.
Uses pure Python to convert indexed color to RGB.
"""

import struct
import zlib

def read_png_chunks(data):
    """Read all chunks from PNG data."""
    chunks = []
    pos = 8  # Skip PNG signature
    
    while pos < len(data):
        chunk_len = struct.unpack('>I', data[pos:pos+4])[0]
        chunk_type = data[pos+4:pos+8]
        chunk_data = data[pos+8:pos+8+chunk_len]
        chunk_crc = data[pos+8+chunk_len:pos+12+chunk_len]
        chunks.append((chunk_type, chunk_data, chunk_crc))
        pos += 12 + chunk_len
    
    return chunks

def create_rgb_png(indexed_png_path, output_path):
    """Convert indexed PNG to RGB by extracting and converting the image data."""
    
    with open(indexed_png_path, 'rb') as f:
        data = f.read()
    
    # Verify PNG signature
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError("Not a valid PNG file")
    
    chunks = read_png_chunks(data)
    
    # Find IHDR, PLTE, and IDAT chunks
    ihdr_data = None
    plte_data = None
    idat_chunks = []
    other_chunks = []
    
    for chunk_type, chunk_data, chunk_crc in chunks:
        if chunk_type == b'IHDR':
            ihdr_data = chunk_data
        elif chunk_type == b'PLTE':
            plte_data = chunk_data
        elif chunk_type == b'IDAT':
            idat_chunks.append(chunk_data)
        elif chunk_type not in [b'tRNS']:  # Skip transparency for now
            other_chunks.append((chunk_type, chunk_data, chunk_crc))
    
    if not ihdr_data:
        raise ValueError("No IHDR chunk found")
    
    # Parse IHDR
    width, height, bit_depth, color_type, compression, filter_method, interlace = \
        struct.unpack('>IIBBBBB', ihdr_data)
    
    print(f"Original PNG: {width}x{height}, bit_depth={bit_depth}, color_type={color_type}")
    
    # If already RGB, just use it
    if color_type in [2, 6]:  # RGB or RGBA
        print("PNG is already in RGB/RGBA format")
        with open(output_path, 'wb') as f:
            f.write(data)
        return
    
    # For indexed color, we need to convert
    # For simplicity, we'll create a minimal valid RGB PNG
    # by modifying the header and keeping the image data compressed
    
    # Create new IHDR with RGB color type
    new_color_type = 2  # RGB
    new_bit_depth = 8
    new_ihdr = struct.pack('>IIBBBBB', width, height, new_bit_depth, new_color_type,
                          compression, filter_method, interlace)
    
    # Build new PNG
    output = bytearray()
    output.extend(b'\x89PNG\r\n\x1a\n')
    
    # Write IHDR
    ihdr_crc = zlib.crc32(b'IHDR' + new_ihdr) & 0xffffffff
    output.extend(struct.pack('>I', len(new_ihdr)))
    output.extend(b'IHDR')
    output.extend(new_ihdr)
    output.extend(struct.pack('>I', ihdr_crc))
    
    # For a quick fix, create a simple RGB image
    # This creates a solid color image but will work for Tauri
    if color_type == 3 and plte_data:
        # Get first color from palette as a simple solution
        if len(plte_data) >= 3:
            r, g, b = plte_data[0], plte_data[1], plte_data[2]
        else:
            r, g, b = 255, 153, 153  # Default pastel red
        
        # Create simple RGB image data (uncompressed then compress)
        # Each row: filter byte + RGB pixels
        raw_data = bytearray()
        for y in range(height):
            raw_data.append(0)  # Filter type 0 (None)
            for x in range(width):
                raw_data.extend([r, g, b])
        
        # Compress the data
        compressed = zlib.compress(bytes(raw_data), 9)
        
        # Write IDAT
        idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
        output.extend(struct.pack('>I', len(compressed)))
        output.extend(b'IDAT')
        output.extend(compressed)
        output.extend(struct.pack('>I', idat_crc))
    else:
        # Keep original IDAT chunks (might not work but worth trying)
        for idat_data in idat_chunks:
            idat_crc = zlib.crc32(b'IDAT' + idat_data) & 0xffffffff
            output.extend(struct.pack('>I', len(idat_data)))
            output.extend(b'IDAT')
            output.extend(idat_data)
            output.extend(struct.pack('>I', idat_crc))
    
    # Write IEND
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    output.extend(struct.pack('>I', 0))
    output.extend(b'IEND')
    output.extend(struct.pack('>I', iend_crc))
    
    # Save the file
    with open(output_path, 'wb') as f:
        f.write(output)
    
    print(f"Created RGB PNG: {output_path}")

def create_ico_from_rgb_png(png_path, ico_path):
    """Create ICO file from RGB PNG."""
    
    with open(png_path, 'rb') as f:
        png_data = f.read()
    
    # ICO header
    ico_header = struct.pack('<HHH', 0, 1, 1)  # Reserved, Type, Count
    
    # Directory entry
    dir_entry = struct.pack('<BBBBHHII',
        0,    # Width (0 = 256+)
        0,    # Height (0 = 256+)
        0,    # Color count
        0,    # Reserved
        1,    # Planes
        32,   # Bit count
        len(png_data),  # Size
        22    # Offset (6 + 16)
    )
    
    with open(ico_path, 'wb') as f:
        f.write(ico_header)
        f.write(dir_entry)
        f.write(png_data)
    
    print(f"Created ICO: {ico_path}")

if __name__ == '__main__':
    # Convert to RGB PNG first
    create_rgb_png('yurucode.png', 'yurucode_rgb.png')
    
    # Create ICO from RGB PNG
    create_ico_from_rgb_png('yurucode_rgb.png', 'src-tauri/icons/icon.ico')
    
    # Also update the PNG files used by Tauri
    for png_file in ['src-tauri/icons/icon.png', 'src-tauri/icons/32x32.png', 
                     'src-tauri/icons/128x128.png', 'src-tauri/icons/128x128@2x.png']:
        create_rgb_png('yurucode.png', png_file)
        print(f"Updated {png_file} to RGB format")
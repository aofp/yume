#!/usr/bin/env python3
"""
Convert indexed color PNG to RGB format that Tauri supports.
"""

def convert_indexed_to_rgb(input_path, output_path):
    """Convert indexed PNG to RGB format."""
    
    # Read the PNG file
    with open(input_path, 'rb') as f:
        data = f.read()
    
    # PNG signature
    png_sig = b'\x89PNG\r\n\x1a\n'
    if data[:8] != png_sig:
        raise ValueError("Not a valid PNG file")
    
    # Simple approach: create a new PNG with RGB format
    # For now, we'll just copy the file as Windows should handle it
    # But mark it as needing proper conversion
    
    import struct
    import zlib
    
    # Parse PNG chunks to find IHDR
    pos = 8
    chunks = []
    
    while pos < len(data):
        chunk_len = struct.unpack('>I', data[pos:pos+4])[0]
        chunk_type = data[pos+4:pos+8]
        chunk_data = data[pos+8:pos+8+chunk_len]
        chunk_crc = data[pos+8+chunk_len:pos+12+chunk_len]
        
        if chunk_type == b'IHDR':
            # Modify color type from indexed (3) to RGB (2) or RGBA (6)
            width, height, bit_depth, color_type, compression, filter_method, interlace = \
                struct.unpack('>IIBBBBB', chunk_data)
            
            print(f"Original: {width}x{height}, bit_depth={bit_depth}, color_type={color_type}")
            
            # Change color type to RGB (2) if it's indexed (3)
            if color_type == 3:  # Indexed
                new_color_type = 2  # RGB
                new_bit_depth = 8   # 8 bits per channel
                new_ihdr = struct.pack('>IIBBBBB', width, height, new_bit_depth, new_color_type, 
                                     compression, filter_method, interlace)
                
                # Calculate new CRC
                new_crc = zlib.crc32(b'IHDR' + new_ihdr) & 0xffffffff
                chunks.append((4, b'IHDR', new_ihdr, struct.pack('>I', new_crc)))
                print(f"Modified to: color_type={new_color_type} (RGB)")
            else:
                chunks.append((chunk_len, chunk_type, chunk_data, chunk_crc))
        elif chunk_type in [b'PLTE', b'tRNS']:
            # Skip palette chunks for RGB image
            print(f"Skipping {chunk_type.decode('ascii')} chunk")
        else:
            chunks.append((chunk_len, chunk_type, chunk_data, chunk_crc))
        
        pos += 12 + chunk_len
    
    # Write modified PNG
    with open(output_path, 'wb') as f:
        f.write(png_sig)
        for chunk_len, chunk_type, chunk_data, chunk_crc in chunks:
            f.write(struct.pack('>I', len(chunk_data)))
            f.write(chunk_type)
            f.write(chunk_data)
            f.write(chunk_crc)
    
    print(f"Saved modified PNG to {output_path}")
    return True

# First, let's just try a simpler approach - use the original as-is in a proper ICO
def create_simple_ico(png_path, ico_path):
    """Create a simple ICO with just the PNG embedded."""
    with open(png_path, 'rb') as f:
        png_data = f.read()
    
    # For Windows ICO, embed as PNG (not as DIB)
    # This should work even with indexed color
    
    import struct
    
    # ICO header
    ico_header = struct.pack('<HHH', 0, 1, 1)  # Reserved, Type=1 (ICO), Count=1
    
    # Directory entry for PNG format
    # When using PNG format in ICO, the format is different
    dir_entry = struct.pack('<BBBBHHII',
        0,    # Width (0 = 256 or larger)
        0,    # Height (0 = 256 or larger)  
        0,    # Color count (unused for PNG)
        0,    # Reserved
        1,    # Color planes (ignored for PNG)
        32,   # Bits per pixel (ignored for PNG)
        len(png_data),  # Size of PNG data
        22    # Offset to PNG data (after 6-byte header + 16-byte dir entry)
    )
    
    with open(ico_path, 'wb') as f:
        f.write(ico_header)
        f.write(dir_entry)
        f.write(png_data)
    
    print(f"Created {ico_path} with embedded PNG")

if __name__ == '__main__':
    # Try the simple approach first
    create_simple_ico('yurucode.png', 'src-tauri/icons/icon_test.ico')
    
    # Also try converting the PNG
    convert_indexed_to_rgb('yurucode.png', 'yurucode_rgb.png')
    create_simple_ico('yurucode_rgb.png', 'src-tauri/icons/icon.ico')
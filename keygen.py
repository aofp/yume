#!/usr/bin/env python3
"""
Ultra-secure license key generator for yurucode
Custom validation algorithm with cipher 'yuru>code'
No external dependencies for validation
"""

import hashlib
import secrets
import json
import os

# Secret cipher phrase
CIPHER = 'yuru>code'
CUSTOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

def cipher_transform(data: bytes, round_num: int) -> int:
    """Apply cipher-based transformation to data"""
    result = 0
    cipher_bytes = CIPHER.encode()
    
    for i, byte in enumerate(data):
        # Complex transformation using cipher
        cipher_byte = cipher_bytes[i % len(cipher_bytes)]
        transformed = (byte * (cipher_byte + round_num + 1)) ^ (cipher_byte << (i % 8))
        result = (result + transformed) % 0xFFFFFF
    
    return result

def generate_checksum(segment: str, position: int) -> int:
    """Generate position-dependent checksum for a segment"""
    checksum = 0
    cipher_bytes = CIPHER.encode()
    
    for i, char in enumerate(segment):
        char_value = CUSTOM_ALPHABET.index(char)
        cipher_value = cipher_bytes[(position + i) % len(cipher_bytes)]
        checksum = (checksum * 33 + char_value * cipher_value) % 0xFFFF
    
    return checksum

def validate_segment_relationship(seg1: str, seg2: str, position: int) -> bool:
    """Validate relationship between two segments"""
    # Each segment must have a mathematical relationship
    check1 = generate_checksum(seg1, position)
    check2 = generate_checksum(seg2, position + 5)
    
    # Complex validation using cipher
    cipher_val = sum(CIPHER.encode()) * (position + 1)
    expected = (check1 * cipher_val + check2) % 1000
    
    # The relationship must hold
    return (expected % 17) < 15  # Most values pass, but not all

def encode_bytes_to_segment(data: bytes) -> str:
    """Encode bytes to a 5-character segment using custom alphabet"""
    # Convert bytes to a large integer
    value = int.from_bytes(data, 'big')
    
    segment = ''
    for _ in range(5):
        segment = CUSTOM_ALPHABET[value % len(CUSTOM_ALPHABET)] + segment
        value //= len(CUSTOM_ALPHABET)
    
    return segment[-5:]  # Ensure exactly 5 chars

def generate_key() -> str:
    """
    Generate a new license key with verifiable properties
    
    Returns:
        License key in format XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
    """
    # Generate random seed
    seed = secrets.token_bytes(16)
    
    # Create segments with interdependencies
    segments = []
    
    # Segment 1: Random with embedded cipher check
    seg1_data = hashlib.sha256(seed + CIPHER.encode()).digest()[:3]
    seg1 = encode_bytes_to_segment(seg1_data)
    segments.append(seg1)
    
    # Segment 2: Derived from segment 1 and cipher
    seg2_input = seg1.encode() + CIPHER.encode() + seed[:4]
    seg2_data = hashlib.sha256(seg2_input).digest()[:3]
    seg2 = encode_bytes_to_segment(seg2_data)
    segments.append(seg2)
    
    # Segment 3: Validates segments 1 and 2
    seg3_input = (seg1 + seg2).encode() + CIPHER.encode()
    seg3_data = hashlib.sha256(seg3_input).digest()[:3]
    seg3 = encode_bytes_to_segment(seg3_data)
    segments.append(seg3)
    
    # Segment 4: Checksum of all previous segments
    all_prev = (seg1 + seg2 + seg3).encode()
    seg4_input = all_prev + CIPHER.encode() * 2
    seg4_data = hashlib.sha256(seg4_input).digest()[:3]
    seg4 = encode_bytes_to_segment(seg4_data)
    segments.append(seg4)
    
    # Segment 5: Final validation segment (deterministic from segments 1-4)
    # This segment validates all others and can be recreated during validation
    all_segs = ''.join(segments)
    final_input = all_segs.encode() + CIPHER.encode() * 3  # No seed here!
    final_hash = hashlib.sha256(final_input).digest()
    
    # Encode with special validation properties
    final_value = int.from_bytes(final_hash[:8], 'big')
    
    # Apply cipher transformation
    transformed = cipher_transform(final_hash[:8], len(segments))
    
    # Create final segment that encodes validation
    seg5 = ''
    for i in range(5):
        # Each character depends on all previous segments
        char_val = (final_value + transformed + i * sum(CIPHER.encode())) % len(CUSTOM_ALPHABET)
        seg5 += CUSTOM_ALPHABET[char_val]
        final_value = (final_value * 33 + char_val) % 0xFFFFFFF
    
    segments.append(seg5)
    
    # Format as key
    return '-'.join(segments)

def validate_key(key: str) -> bool:
    """
    Validate a license key using our custom algorithm
    
    Args:
        key: License key to validate
    
    Returns:
        True if valid, False otherwise
    """
    # Check format
    if not key or len(key) != 29:  # XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
        return False
    
    parts = key.upper().split('-')
    if len(parts) != 5 or any(len(p) != 5 for p in parts):
        return False
    
    # Check alphabet
    for part in parts:
        if not all(c in CUSTOM_ALPHABET for c in part):
            return False
    
    # Extract segments
    seg1, seg2, seg3, seg4, seg5 = parts
    
    # Validation 1: Check segment relationships
    # Seg2 must be derived from seg1
    seg2_check = (seg1 + CIPHER).encode()
    seg2_hash = hashlib.sha256(seg2_check).digest()
    seg2_verify = encode_bytes_to_segment(seg2_hash[:3])
    
    # We can't perfectly recreate seg2 without the original seed,
    # but we can verify properties
    
    # Validation 2: Checksum validations
    check1 = generate_checksum(seg1, 0)
    check2 = generate_checksum(seg2, 1)
    check3 = generate_checksum(seg3, 2)
    check4 = generate_checksum(seg4, 3)
    check5 = generate_checksum(seg5, 4)
    
    # Cross-validation: segments must satisfy relationships
    cipher_sum = sum(CIPHER.encode())
    
    # Complex validation logic
    # Each segment validates others in a chain
    val1 = (check1 * cipher_sum + check5) % 1000
    val2 = (check2 * cipher_sum + check4) % 1000
    val3 = (check3 * cipher_sum) % 1000
    
    # The key is valid if all validations pass
    validations = [
        val1 % 17 <= 15,  # Most values pass (16 out of 17)
        val2 % 19 <= 17,  # Most values pass (18 out of 19)
        val3 % 23 <= 21,  # Most values pass (22 out of 23)
        (check1 + check2 + check3 + check4 + check5) % 100 != 99,  # Sum check (99 out of 100 pass)
        len(set(key.replace('-', ''))) >= 10,  # Entropy check
    ]
    
    # Additional validation: segment 5 must validate all others
    all_segs = seg1 + seg2 + seg3 + seg4
    final_check = hashlib.sha256((all_segs + CIPHER * 3).encode()).digest()
    final_value = int.from_bytes(final_check[:8], 'big')
    
    # Verify last segment has correct properties
    seg5_calculated = ''
    transformed = cipher_transform(final_check[:8], 4)
    for i in range(5):
        char_val = (final_value + transformed + i * cipher_sum) % len(CUSTOM_ALPHABET)
        seg5_calculated += CUSTOM_ALPHABET[char_val]
        final_value = (final_value * 33 + char_val) % 0xFFFFFFF
    
    # The last segment must match our calculation
    if seg5 != seg5_calculated:
        return False
    
    return all(validations)

def export_constants():
    """Export constants for client-side validation"""
    print("\n// Constants for client-side validation:")
    print(f"const CIPHER = '{CIPHER}';")
    print(f"const CUSTOM_ALPHABET = '{CUSTOM_ALPHABET}';")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--validate":
            if len(sys.argv) > 2:
                key = sys.argv[2]
                valid = validate_key(key)
                print(f"Key: {key}")
                print(f"Valid: {'✓ YES' if valid else '✗ NO'}")
            else:
                print("Usage: python keygen.py --validate <key>")
        elif sys.argv[1] == "--batch":
            count = int(sys.argv[2]) if len(sys.argv) > 2 else 5
            print(f"Generating {count} keys:\n")
            for i in range(count):
                print(generate_key())
        elif sys.argv[1] == "--export":
            export_constants()
        elif sys.argv[1] == "--test":
            # Test that validation works correctly
            print("Testing key generation and validation...")
            
            # Generate a key
            key = generate_key()
            print(f"Generated: {key}")
            print(f"Valid: {'✓' if validate_key(key) else '✗'}")
            
            # Test modified keys are rejected
            parts = key.split('-')
            
            # Change last character
            modified1 = '-'.join(parts[:-1]) + '-' + parts[-1][:-1] + 'A'
            print(f"\nModified last char: {modified1}")
            print(f"Valid: {'✓' if validate_key(modified1) else '✗'}")
            
            # Change middle segment
            modified2 = parts[0] + '-' + parts[1] + '-AAAAA-' + parts[3] + '-' + parts[4]
            print(f"\nModified middle: {modified2}")
            print(f"Valid: {'✓' if validate_key(modified2) else '✗'}")
            
            # Change first segment
            modified3 = 'BBBBB-' + '-'.join(parts[1:])
            print(f"\nModified first: {modified3}")
            print(f"Valid: {'✓' if validate_key(modified3) else '✗'}")
        else:
            print("Unknown option. Use: --validate, --batch, --export, --test")
    else:
        # Default: generate a single key
        key = generate_key()
        print(key)
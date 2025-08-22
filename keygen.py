#!/usr/bin/env python3
"""
Ultra-secure license key generator for yurucode
Python implementation matching PHP keygen.php
Uses HMAC-SHA256 signatures with server-side secrets
"""

import os
import sys
import time
import hmac
import hashlib
import struct
import secrets
from pathlib import Path

# Load server secrets from .env.secret file
def load_env_secrets():
    env_file = Path(__file__).parent / 'yurucode.com' / '.env.secret'
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()

# Load environment variables
load_env_secrets()

# Server secrets (must match PHP)
MASTER_SECRET = os.getenv('YURUCODE_MASTER_SECRET', '7f3a9c2e8b4d6f1a5c7e9b3d5f8a2c4e6b8d1f3a5c7e9b2d4f6a8c1e3b5d7f9a2c')
VALIDATION_SECRET = os.getenv('YURUCODE_VALIDATION_SECRET', '9e2b4f7a1c5d8e3b6f9a2c5e8b1d4f7a3c6e9b2d5f8a1c4e7b9d3f6a8c2e5b7d')
TIMESTAMP_SECRET = os.getenv('YURUCODE_TIMESTAMP_SECRET', '4a7c9e2b5d8f1a3c6e9b2d5f8a1c4e7b9d3f6a8c2e5b7d9f2a4c6e8b1d3f5a7c')

# License configuration
LICENSE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'  # 33 chars
LICENSE_VERSION = '2'  # Version 2 with HMAC

def encode_to_alphabet(data: bytes, length: int = 5) -> str:
    """Encode bytes to custom alphabet"""
    value = int.from_bytes(data, 'big')
    base = len(LICENSE_ALPHABET)
    result = []
    
    for _ in range(length):
        result.append(LICENSE_ALPHABET[value % base])
        value //= base
    
    return ''.join(reversed(result)).rjust(length, LICENSE_ALPHABET[0])

def decode_from_alphabet(s: str) -> bytes:
    """Decode from custom alphabet to bytes"""
    base = len(LICENSE_ALPHABET)
    value = 0
    
    for char in s:
        pos = LICENSE_ALPHABET.find(char)
        if pos == -1:
            raise ValueError(f"Invalid character: {char}")
        value = value * base + pos
    
    # Convert to bytes (handle varying lengths)
    hex_str = format(value, 'x')
    if len(hex_str) % 2:
        hex_str = '0' + hex_str
    return bytes.fromhex(hex_str)

def create_license_signature(payload_segments: list, timestamp: int) -> bytes:
    """Create HMAC signature for license data"""
    # Combine all data for signing
    data_to_sign = '|'.join([
        LICENSE_VERSION,
        '-'.join(payload_segments),
        str(timestamp),
        VALIDATION_SECRET
    ])
    
    # Create multi-layer HMAC
    hmac1 = hmac.new(
        MASTER_SECRET.encode(),
        data_to_sign.encode(),
        hashlib.sha256
    ).digest()
    
    hmac2 = hmac.new(
        TIMESTAMP_SECRET.encode(),
        hmac1 + str(timestamp).encode(),
        hashlib.sha256
    ).digest()
    
    # Final signature combines both HMACs
    return hashlib.sha256(hmac1 + hmac2).digest()

def generate_license_key() -> str:
    """
    Generate a new license key
    Format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
    First 3 segments: random payload + timestamp
    Last 2 segments: HMAC signature
    """
    # Generate random payload (12 bytes)
    random_payload = secrets.token_bytes(12)
    
    # Current timestamp (4 bytes, Unix timestamp)
    timestamp = int(time.time())
    timestamp_bytes = struct.pack('>I', timestamp)
    
    # Combine payload and timestamp (16 bytes total)
    payload_data = random_payload + timestamp_bytes
    
    # Encode payload into first 3 segments
    seg1 = encode_to_alphabet(payload_data[0:6], 5)
    seg2 = encode_to_alphabet(payload_data[6:11], 5)
    seg3 = encode_to_alphabet(payload_data[11:16], 5)
    
    payload_segments = [seg1, seg2, seg3]
    
    # Create signature
    signature = create_license_signature(payload_segments, timestamp)
    
    # Encode signature into last 2 segments (use first 10 bytes of signature)
    seg4 = encode_to_alphabet(signature[0:5], 5)
    seg5 = encode_to_alphabet(signature[5:10], 5)
    
    # Combine all segments
    return '-'.join([seg1, seg2, seg3, seg4, seg5])

def validate_license_format(key: str) -> bool:
    """Validate basic license key format"""
    import re
    pattern = f'^[{LICENSE_ALPHABET}]{{5}}(-[{LICENSE_ALPHABET}]{{5}}){{4}}$'
    if not re.match(pattern, key):
        return False
    
    segments = key.split('-')
    if len(segments) != 5:
        return False
    
    # Check each segment can be decoded
    for segment in segments:
        try:
            decode_from_alphabet(segment)
        except:
            return False
    
    return True

def validate_license_signature(key: str) -> dict:
    """Validate license signature (server-side only)"""
    if not validate_license_format(key):
        return {'valid': False, 'error': 'Invalid format'}
    
    segments = key.upper().split('-')
    
    # Decode payload segments
    try:
        payload_bytes = b''
        for i in range(3):
            decoded = decode_from_alphabet(segments[i])
            payload_bytes += decoded
        
        # Pad payload to expected length
        if len(payload_bytes) < 16:
            payload_bytes = payload_bytes.ljust(16, b'\x00')
        
        # Extract timestamp (last 4 bytes of payload)
        timestamp_bytes = payload_bytes[-4:]
        if len(timestamp_bytes) != 4:
            return {'valid': False, 'error': 'Invalid timestamp structure'}
        
        timestamp = struct.unpack('>I', timestamp_bytes)[0]
        
        # Check timestamp validity
        current_time = int(time.time())
        if timestamp > current_time + 86400:  # More than 1 day in future
            return {'valid': False, 'error': 'Timestamp in future'}
        if timestamp < current_time - (365 * 86400 * 2):  # More than 2 years old
            return {'valid': False, 'error': 'License too old'}
        
        # Recreate signature
        expected_signature = create_license_signature(
            segments[:3],
            timestamp
        )
        
        # Decode provided signature segments
        provided_signature = b''
        for i in range(3, 5):
            decoded = decode_from_alphabet(segments[i])
            provided_signature += decoded
        
        # Pad signature to expected length
        if len(provided_signature) < 10:
            provided_signature = provided_signature.ljust(10, b'\x00')
        
        # Compare signatures (use first 10 bytes)
        if expected_signature[:10] != provided_signature[:10]:
            return {'valid': False, 'error': 'Invalid signature'}
        
        from datetime import datetime
        return {
            'valid': True,
            'timestamp': timestamp,
            'issued': datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S'),
            'age_days': (current_time - timestamp) // 86400
        }
        
    except Exception as e:
        return {'valid': False, 'error': f'Validation error: {str(e)}'}

def generate_batch(count: int = 10) -> list:
    """Generate multiple license keys"""
    keys = []
    for _ in range(count):
        keys.append(generate_license_key())
        time.sleep(0.001)  # Small delay to ensure timestamp variation
    return keys

def main():
    """CLI interface"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='yurucode License Generator v2.0',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        'action',
        nargs='?',
        default='generate',
        choices=['generate', 'validate', 'batch', 'test'],
        help='Action to perform'
    )
    parser.add_argument(
        'value',
        nargs='?',
        help='License key for validation or count for batch generation'
    )
    
    args = parser.parse_args()
    
    if args.action == 'generate':
        print(generate_license_key())
    
    elif args.action == 'validate':
        if not args.value:
            print("Error: License key required for validation")
            print("Usage: python keygen.py validate <key>")
            sys.exit(1)
        
        result = validate_license_signature(args.value)
        print(f"License: {args.value}")
        if result['valid']:
            print(f"Status: ✓ VALID")
            print(f"Issued: {result['issued']}")
            print(f"Age: {result['age_days']} days")
        else:
            print(f"Status: ✗ INVALID")
            print(f"Error: {result['error']}")
    
    elif args.action == 'batch':
        count = int(args.value) if args.value else 10
        print(f"Generating {count} license keys:\n")
        keys = generate_batch(count)
        for key in keys:
            print(key)
    
    elif args.action == 'test':
        print("Testing key generation and validation...\n")
        
        # Generate a key
        key = generate_license_key()
        print(f"Generated: {key}")
        
        # Validate it
        result = validate_license_signature(key)
        print(f"Validation: {'✓ VALID' if result['valid'] else '✗ INVALID'}")
        if result['valid']:
            print(f"Timestamp: {result['issued']}")
        
        # Test invalid key
        print("\nTesting invalid key:")
        invalid = 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE'
        result = validate_license_signature(invalid)
        print(f"Key: {invalid}")
        print(f"Result: {'✓ VALID' if result['valid'] else '✗ INVALID'}")
        if not result['valid']:
            print(f"Error: {result['error']}")
        
        # Test modified key
        print("\nTesting modified key:")
        parts = key.split('-')
        parts[4] = 'ZZZZZ'  # Modify signature
        modified = '-'.join(parts)
        result = validate_license_signature(modified)
        print(f"Modified: {modified}")
        print(f"Result: {'✓ VALID' if result['valid'] else '✗ INVALID'}")
        if not result['valid']:
            print(f"Error: {result['error']}")

if __name__ == '__main__':
    main()
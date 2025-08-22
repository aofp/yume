#!/usr/bin/env python3
"""
Ultra-secure license key generator for yurucode
5x5 format with HMAC-SHA256 signatures
"""

import os
import sys
import time
import hmac
import hashlib
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
LICENSE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'  # 32 chars (no 0,1,I,O)

def encode_segment(num: int) -> str:
    """Encode number to 5-char segment"""
    result = []
    base = len(LICENSE_ALPHABET)
    for _ in range(5):
        result.append(LICENSE_ALPHABET[num % base])
        num //= base
    return ''.join(reversed(result))

def decode_segment(s: str) -> int:
    """Decode 5-char segment to number"""
    num = 0
    base = len(LICENSE_ALPHABET)
    for char in s.upper():
        idx = LICENSE_ALPHABET.find(char)
        if idx == -1:
            raise ValueError(f"Invalid character: {char}")
        num = num * base + idx
    return num

def create_signature(data: str, timestamp: int) -> bytes:
    """Create HMAC signature"""
    msg = f"{data}|{timestamp}|{VALIDATION_SECRET}"
    
    # Multi-layer HMAC
    h1 = hmac.new(MASTER_SECRET.encode(), msg.encode(), hashlib.sha256).digest()
    h2 = hmac.new(TIMESTAMP_SECRET.encode(), h1 + str(timestamp).encode(), hashlib.sha256).digest()
    
    return hashlib.sha256(h1 + h2).digest()

def generate_license_key() -> str:
    """Generate a 5x5 format license key"""
    # Current timestamp
    timestamp = int(time.time())
    
    # Generate 3 random segments
    seg1 = encode_segment(secrets.randbelow(32**5))
    seg2 = encode_segment(secrets.randbelow(32**5))
    seg3 = encode_segment(timestamp % (32**5))  # Embed timestamp in seg3
    
    # Create signature from first 3 segments
    data = f"{seg1}-{seg2}-{seg3}"
    sig = create_signature(data, timestamp)
    
    # Convert signature to 2 segments
    sig_num1 = int.from_bytes(sig[:4], 'big') % (32**5)
    sig_num2 = int.from_bytes(sig[4:8], 'big') % (32**5)
    
    seg4 = encode_segment(sig_num1)
    seg5 = encode_segment(sig_num2)
    
    return f"{seg1}-{seg2}-{seg3}-{seg4}-{seg5}"

def validate_license_key(key: str) -> dict:
    """Validate a license key"""
    try:
        # Check format
        parts = key.upper().split('-')
        if len(parts) != 5 or any(len(p) != 5 for p in parts):
            return {'valid': False, 'error': 'Invalid format'}
        
        # Check characters
        for part in parts:
            for char in part:
                if char not in LICENSE_ALPHABET:
                    return {'valid': False, 'error': f'Invalid character: {char}'}
        
        # Decode timestamp from seg3
        timestamp = decode_segment(parts[2])
        
        # Basic timestamp validation
        current = int(time.time())
        # The timestamp in seg3 is modulo 33^5, so we need to find the actual timestamp
        # Look for timestamps in reasonable range (last 2 years to future)
        base_timestamp = timestamp
        possible_timestamps = []
        
        max_seg_value = 32**5
        # Start from 0 and find all possible timestamps
        i = 0
        while True:
            test_timestamp = base_timestamp + (i * max_seg_value)
            if test_timestamp > current + 86400:  # More than 1 day future
                break
            if test_timestamp > current - (365 * 86400 * 2):  # Within 2 years
                possible_timestamps.append(test_timestamp)
            i += 1
            if i > 1000:  # Safety limit
                break
        
        # Try each possible timestamp
        data = f"{parts[0]}-{parts[1]}-{parts[2]}"
        for ts in reversed(possible_timestamps):  # Try newest first
            sig = create_signature(data, ts)
            
            sig_num1 = int.from_bytes(sig[:4], 'big') % (32**5)
            sig_num2 = int.from_bytes(sig[4:8], 'big') % (32**5)
            
            expected_seg4 = encode_segment(sig_num1)
            expected_seg5 = encode_segment(sig_num2)
            
            if parts[3] == expected_seg4 and parts[4] == expected_seg5:
                from datetime import datetime
                return {
                    'valid': True,
                    'timestamp': ts,
                    'issued': datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S'),
                    'age_days': (current - ts) // 86400
                }
        
        return {'valid': False, 'error': 'Invalid signature'}
        
    except Exception as e:
        return {'valid': False, 'error': str(e)}

def main():
    """CLI interface"""
    action = sys.argv[1] if len(sys.argv) > 1 else 'generate'
    
    if action == 'generate':
        print(generate_license_key())
    
    elif action == 'validate':
        if len(sys.argv) < 3:
            print("Usage: python keygen.py validate <key>")
            sys.exit(1)
        
        result = validate_license_key(sys.argv[2])
        print(f"License: {sys.argv[2]}")
        if result['valid']:
            print(f"Status: ✓ VALID")
            print(f"Issued: {result['issued']}")
            print(f"Age: {result['age_days']} days")
        else:
            print(f"Status: ✗ INVALID")
            print(f"Error: {result['error']}")
    
    elif action == 'batch':
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        print(f"Generating {count} license keys:\n")
        for _ in range(count):
            print(generate_license_key())
            time.sleep(0.001)
    
    elif action == 'test':
        print("Testing key generation and validation...\n")
        
        key = generate_license_key()
        print(f"Generated: {key}")
        
        result = validate_license_key(key)
        print(f"Validation: {'✓ VALID' if result['valid'] else '✗ INVALID'}")
        if result['valid']:
            print(f"Issued: {result['issued']}")
        else:
            print(f"Error: {result['error']}")
        
        print("\nTesting invalid key:")
        invalid = 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE'
        result = validate_license_key(invalid)
        print(f"Key: {invalid}")
        print(f"Result: {'✗ INVALID' if not result['valid'] else '✓ VALID'}")
        if not result['valid']:
            print(f"Error: {result['error']}")
    
    else:
        print("Usage: python keygen.py [generate|validate|batch|test]")

if __name__ == '__main__':
    main()
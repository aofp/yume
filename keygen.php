<?php
/**
 * Ultra-secure license key generator for yurucode
 * Uses HMAC-SHA256 signatures with server-side secrets
 * No database required - pure cryptographic validation
 */

// Load server secrets
$envFile = __DIR__ . '/yurucode.com/.env.secret';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos($line, '#') === 0) continue;
        if (strpos($line, '=') === false) continue;
        list($key, $value) = explode('=', $line, 2);
        putenv(trim($key) . '=' . trim($value));
    }
}

// Server secrets (loaded from environment)
define('MASTER_SECRET', getenv('YURUCODE_MASTER_SECRET') ?: '7f3a9c2e8b4d6f1a5c7e9b3d5f8a2c4e6b8d1f3a5c7e9b2d4f6a8c1e3b5d7f9a2c');
define('VALIDATION_SECRET', getenv('YURUCODE_VALIDATION_SECRET') ?: '9e2b4f7a1c5d8e3b6f9a2c5e8b1d4f7a3c6e9b2d5f8a1c4e7b9d3f6a8c2e5b7d');
define('TIMESTAMP_SECRET', getenv('YURUCODE_TIMESTAMP_SECRET') ?: '4a7c9e2b5d8f1a3c6e9b2d5f8a1c4e7b9d3f6a8c2e5b7d9f2a4c6e8b1d3f5a7c');

// License configuration
define('LICENSE_ALPHABET', '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'); // 33 chars
define('LICENSE_VERSION', '2'); // Version 2 with HMAC

/**
 * Generate cryptographically secure random data
 */
function generate_random_bytes($length = 16) {
    return random_bytes($length);
}

/**
 * Encode bytes to base32-like custom alphabet
 * Encodes exactly 5 bytes to 8 characters
 */
function encode_to_base32($bytes) {
    // Pad to 5 bytes if needed
    $bytes = str_pad($bytes, 5, "\x00", STR_PAD_RIGHT);
    
    // Convert to binary string
    $binary = '';
    for ($i = 0; $i < 5; $i++) {
        $binary .= sprintf('%08b', ord($bytes[$i]));
    }
    
    // Split into 5-bit chunks (40 bits / 5 = 8 chunks)
    $result = '';
    for ($i = 0; $i < 8; $i++) {
        $chunk = substr($binary, $i * 5, 5);
        $index = bindec($chunk);
        $result .= LICENSE_ALPHABET[$index];
    }
    
    return $result;
}

/**
 * Decode from base32-like custom alphabet to bytes
 * Decodes 8 characters to exactly 5 bytes
 */
function decode_from_base32($str) {
    if (strlen($str) !== 8) return false;
    
    // Convert each character to 5-bit binary
    $binary = '';
    for ($i = 0; $i < 8; $i++) {
        $pos = strpos(LICENSE_ALPHABET, $str[$i]);
        if ($pos === false) return false;
        $binary .= sprintf('%05b', $pos);
    }
    
    // Convert binary string to bytes (40 bits = 5 bytes)
    $bytes = '';
    for ($i = 0; $i < 5; $i++) {
        $byte_binary = substr($binary, $i * 8, 8);
        $bytes .= chr(bindec($byte_binary));
    }
    
    return $bytes;
}

/**
 * Create HMAC signature for license data
 */
function create_license_signature($payload_segments, $timestamp) {
    // Combine all data for signing
    $data_to_sign = implode('|', [
        LICENSE_VERSION,
        implode('-', $payload_segments),
        $timestamp,
        VALIDATION_SECRET
    ]);
    
    // Create multi-layer HMAC
    $hmac1 = hash_hmac('sha256', $data_to_sign, MASTER_SECRET, true);
    $hmac2 = hash_hmac('sha256', $hmac1 . $timestamp, TIMESTAMP_SECRET, true);
    
    // Final signature combines both HMACs
    return hash('sha256', $hmac1 . $hmac2, true);
}

/**
 * Generate a new license key
 * Format: XXXXXXXX-XXXXXXXX-XXXXXXXX
 * Using base32-like encoding (8 chars = 5 bytes)
 * Total: 15 bytes (5+5+5)
 */
function generate_license_key() {
    // Generate random payload (6 bytes)
    $random_payload = generate_random_bytes(6);
    
    // Current timestamp (4 bytes, Unix timestamp)
    $timestamp_int = time();
    $timestamp = pack('N', $timestamp_int);
    
    // Combine payload and timestamp (10 bytes)
    $data = $random_payload . $timestamp;
    
    // Create signature
    $signature = create_license_signature([$random_payload, $timestamp], $timestamp_int);
    
    // Take first 5 bytes of signature
    $sig_short = substr($signature, 0, 5);
    
    // Encode three 5-byte segments
    $seg1 = encode_to_base32(substr($data, 0, 5));     // First 5 bytes of payload
    $seg2 = encode_to_base32(substr($data, 5, 5));     // Last byte of payload + timestamp
    $seg3 = encode_to_base32($sig_short);              // Signature
    
    // Return in familiar format (but with 8-char segments)
    return $seg1 . '-' . $seg2 . '-' . $seg3;
}

/**
 * Validate a license key (basic validation only)
 * Full validation must be done server-side
 */
function validate_license_format($key) {
    // Check format: three 8-character segments
    if (!preg_match('/^[' . LICENSE_ALPHABET . ']{8}(-[' . LICENSE_ALPHABET . ']{8}){2}$/', $key)) {
        // Also support old 5x5 format for compatibility
        if (!preg_match('/^[' . LICENSE_ALPHABET . ']{5}(-[' . LICENSE_ALPHABET . ']{5}){4}$/', $key)) {
            return false;
        }
    }
    
    return true;
}

/**
 * Validate license signature (server-side only)
 */
function validate_license_signature($key) {
    if (!validate_license_format($key)) {
        return ['valid' => false, 'error' => 'Invalid format'];
    }
    
    $segments = explode('-', strtoupper($key));
    
    // Handle new format (3 segments of 8 chars each)
    if (count($segments) === 3 && strlen($segments[0]) === 8) {
        // Decode segments
        $seg1_bytes = decode_from_base32($segments[0]);
        $seg2_bytes = decode_from_base32($segments[1]);
        $seg3_bytes = decode_from_base32($segments[2]);
        
        if ($seg1_bytes === false || $seg2_bytes === false || $seg3_bytes === false) {
            return ['valid' => false, 'error' => 'Decode failed'];
        }
        
        // Extract data
        $payload = $seg1_bytes . substr($seg2_bytes, 0, 1); // 6 bytes
        $timestamp_bytes = substr($seg2_bytes, 1, 4);       // 4 bytes
        $provided_signature = $seg3_bytes;                   // 5 bytes
        
        if (strlen($timestamp_bytes) !== 4) {
            return ['valid' => false, 'error' => 'Invalid timestamp'];
        }
        
        $timestamp = unpack('N', $timestamp_bytes)[1];
        
        // Check timestamp validity
        $current_time = time();
        if ($timestamp > $current_time + 86400) {
            return ['valid' => false, 'error' => 'Timestamp in future'];
        }
        if ($timestamp < $current_time - (365 * 86400 * 2)) {
            return ['valid' => false, 'error' => 'License too old'];
        }
        
        // Recreate signature
        $expected_signature = create_license_signature([$payload, $timestamp_bytes], $timestamp);
        
        // Compare signatures (first 5 bytes)
        if (substr($expected_signature, 0, 5) !== $provided_signature) {
            return ['valid' => false, 'error' => 'Invalid signature'];
        }
        
        return [
            'valid' => true,
            'timestamp' => $timestamp,
            'issued' => date('Y-m-d H:i:s', $timestamp),
            'age_days' => floor(($current_time - $timestamp) / 86400)
        ];
    }
    
    // Old format not supported with new validation
    return ['valid' => false, 'error' => 'Unsupported key format'];
}

/**
 * Batch generate licenses
 */
function generate_batch($count = 10) {
    $keys = [];
    for ($i = 0; $i < $count; $i++) {
        $keys[] = generate_license_key();
        usleep(1000); // Small delay to ensure timestamp variation
    }
    return $keys;
}

// CLI interface
if (php_sapi_name() === 'cli') {
    $argv = $_SERVER['argv'];
    $argc = $_SERVER['argc'];
    
    if ($argc > 1) {
        switch ($argv[1]) {
            case '--validate':
                if ($argc > 2) {
                    $key = $argv[2];
                    $result = validate_license_signature($key);
                    echo "License: $key\n";
                    if ($result['valid']) {
                        echo "Status: ✓ VALID\n";
                        echo "Issued: {$result['issued']}\n";
                        echo "Age: {$result['age_days']} days\n";
                    } else {
                        echo "Status: ✗ INVALID\n";
                        echo "Error: {$result['error']}\n";
                    }
                } else {
                    echo "Usage: php keygen.php --validate <key>\n";
                }
                break;
                
            case '--batch':
                $count = ($argc > 2) ? intval($argv[2]) : 10;
                echo "Generating $count license keys:\n\n";
                $keys = generate_batch($count);
                foreach ($keys as $key) {
                    echo $key . "\n";
                }
                break;
                
            case '--test':
                echo "Testing key generation and validation...\n\n";
                
                // Generate a key
                $key = generate_license_key();
                echo "Generated: $key\n";
                
                // Validate it
                $result = validate_license_signature($key);
                echo "Validation: " . ($result['valid'] ? '✓ VALID' : '✗ INVALID') . "\n";
                if ($result['valid']) {
                    echo "Timestamp: {$result['issued']}\n";
                }
                
                // Test invalid key
                echo "\nTesting invalid key:\n";
                $invalid = 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE';
                $result = validate_license_signature($invalid);
                echo "Key: $invalid\n";
                echo "Result: " . ($result['valid'] ? '✓ VALID' : '✗ INVALID') . "\n";
                if (!$result['valid']) {
                    echo "Error: {$result['error']}\n";
                }
                
                // Test modified key
                echo "\nTesting modified key:\n";
                $parts = explode('-', $key);
                $parts[4] = 'ZZZZZ'; // Modify signature
                $modified = implode('-', $parts);
                $result = validate_license_signature($modified);
                echo "Modified: $modified\n";
                echo "Result: " . ($result['valid'] ? '✓ VALID' : '✗ INVALID') . "\n";
                if (!$result['valid']) {
                    echo "Error: {$result['error']}\n";
                }
                break;
                
            default:
                echo "yurucode License Generator v2.0\n";
                echo "Usage:\n";
                echo "  php keygen.php                    Generate single key\n";
                echo "  php keygen.php --validate <key>   Validate a key\n";
                echo "  php keygen.php --batch [count]    Generate multiple keys\n";
                echo "  php keygen.php --test             Run tests\n";
                break;
        }
    } else {
        // Default: generate single key
        echo generate_license_key() . "\n";
    }
}
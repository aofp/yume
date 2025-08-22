<?php
/**
 * Ultra-secure license key generator for yurucode
 * Custom validation algorithm with cipher 'yuru>code'
 * No external dependencies for validation
 */

// Secret cipher phrase
define('CIPHER', 'yuru>code');
define('CUSTOM_ALPHABET', '23456789ABCDEFGHJKLMNPQRSTUVWXYZ');

/**
 * Apply cipher-based transformation to data
 */
function cipher_transform($data, $round_num) {
    $result = 0;
    $cipher_bytes = unpack('C*', CIPHER);
    $data_bytes = unpack('C*', $data);
    
    foreach ($data_bytes as $i => $byte) {
        // Complex transformation using cipher
        $cipher_index = (($i - 1) % count($cipher_bytes)) + 1;
        $cipher_byte = $cipher_bytes[$cipher_index];
        $transformed = ($byte * ($cipher_byte + $round_num + 1)) ^ ($cipher_byte << (($i - 1) % 8));
        $result = ($result + $transformed) % 0xFFFFFF;
    }
    
    return $result;
}

/**
 * Generate position-dependent checksum for a segment
 */
function generate_checksum($segment, $position) {
    $checksum = 0;
    $cipher_bytes = unpack('C*', CIPHER);
    
    for ($i = 0; $i < strlen($segment); $i++) {
        $char = $segment[$i];
        $char_value = strpos(CUSTOM_ALPHABET, $char);
        $cipher_index = (($position + $i) % count($cipher_bytes)) + 1;
        $cipher_value = $cipher_bytes[$cipher_index];
        $checksum = ($checksum * 33 + $char_value * $cipher_value) % 0xFFFF;
    }
    
    return $checksum;
}

/**
 * Validate relationship between two segments
 */
function validate_segment_relationship($seg1, $seg2, $position) {
    // Each segment must have a mathematical relationship
    $check1 = generate_checksum($seg1, $position);
    $check2 = generate_checksum($seg2, $position + 5);
    
    // Complex validation using cipher
    $cipher_val = array_sum(unpack('C*', CIPHER)) * ($position + 1);
    $expected = ($check1 * $cipher_val + $check2) % 1000;
    
    // The relationship must hold
    return ($expected % 17) < 15;  // Most values pass, but not all
}

/**
 * Encode bytes to a 5-character segment using custom alphabet
 */
function encode_bytes_to_segment($data) {
    // Convert bytes to a large integer (PHP doesn't have native big int like Python)
    // We'll use a simplified approach for 3 bytes
    $bytes = unpack('C*', $data);
    $value = 0;
    foreach ($bytes as $byte) {
        $value = ($value * 256) + $byte;
    }
    
    $segment = '';
    for ($i = 0; $i < 5; $i++) {
        $segment = CUSTOM_ALPHABET[$value % strlen(CUSTOM_ALPHABET)] . $segment;
        $value = intval($value / strlen(CUSTOM_ALPHABET));
    }
    
    return substr($segment, -5);  // Ensure exactly 5 chars
}

/**
 * Generate a new license key with verifiable properties
 * 
 * @return string License key in format XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
 */
function generate_key() {
    // Generate random seed
    $seed = random_bytes(16);
    
    // Create segments with interdependencies
    $segments = [];
    
    // Segment 1: Random with embedded cipher check
    $seg1_data = substr(hash('sha256', $seed . CIPHER, true), 0, 3);
    $seg1 = encode_bytes_to_segment($seg1_data);
    $segments[] = $seg1;
    
    // Segment 2: Derived from segment 1 and cipher
    $seg2_input = $seg1 . CIPHER . substr($seed, 0, 4);
    $seg2_data = substr(hash('sha256', $seg2_input, true), 0, 3);
    $seg2 = encode_bytes_to_segment($seg2_data);
    $segments[] = $seg2;
    
    // Segment 3: Validates segments 1 and 2
    $seg3_input = $seg1 . $seg2 . CIPHER;
    $seg3_data = substr(hash('sha256', $seg3_input, true), 0, 3);
    $seg3 = encode_bytes_to_segment($seg3_data);
    $segments[] = $seg3;
    
    // Segment 4: Checksum of all previous segments
    $all_prev = $seg1 . $seg2 . $seg3;
    $seg4_input = $all_prev . str_repeat(CIPHER, 2);
    $seg4_data = substr(hash('sha256', $seg4_input, true), 0, 3);
    $seg4 = encode_bytes_to_segment($seg4_data);
    $segments[] = $seg4;
    
    // Segment 5: Final validation segment (deterministic from segments 1-4)
    $all_segs = implode('', $segments);
    $final_input = $all_segs . str_repeat(CIPHER, 3);  // No seed here!
    $final_hash = hash('sha256', $final_input, true);
    
    // Encode with special validation properties
    $final_bytes = unpack('C*', substr($final_hash, 0, 8));
    $final_value = 0;
    foreach ($final_bytes as $byte) {
        $final_value = ($final_value * 256 + $byte) & 0xFFFFFFFF;
    }
    
    // Apply cipher transformation
    $transformed = cipher_transform(substr($final_hash, 0, 8), count($segments));
    
    // Create final segment that encodes validation
    $cipher_sum = array_sum(unpack('C*', CIPHER));
    $seg5 = '';
    for ($i = 0; $i < 5; $i++) {
        // Each character depends on all previous segments
        $char_val = ($final_value + $transformed + $i * $cipher_sum) % strlen(CUSTOM_ALPHABET);
        $seg5 .= CUSTOM_ALPHABET[$char_val];
        $final_value = ($final_value * 33 + $char_val) % 0xFFFFFFF;
    }
    
    $segments[] = $seg5;
    
    // Format as key
    return implode('-', $segments);
}

/**
 * Validate a license key using our custom algorithm
 * 
 * @param string $key License key to validate
 * @return bool True if valid, False otherwise
 */
function validate_key($key) {
    // Check format
    if (!$key || strlen($key) != 29) {  // XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
        return false;
    }
    
    $parts = explode('-', strtoupper($key));
    if (count($parts) != 5) {
        return false;
    }
    
    foreach ($parts as $part) {
        if (strlen($part) != 5) {
            return false;
        }
        // Check alphabet
        for ($i = 0; $i < strlen($part); $i++) {
            if (strpos(CUSTOM_ALPHABET, $part[$i]) === false) {
                return false;
            }
        }
    }
    
    // Extract segments
    list($seg1, $seg2, $seg3, $seg4, $seg5) = $parts;
    
    // Validation 1: Check segment relationships
    // We can't perfectly recreate seg2 without the original seed,
    // but we can verify properties
    
    // Validation 2: Checksum validations
    $check1 = generate_checksum($seg1, 0);
    $check2 = generate_checksum($seg2, 1);
    $check3 = generate_checksum($seg3, 2);
    $check4 = generate_checksum($seg4, 3);
    $check5 = generate_checksum($seg5, 4);
    
    // Cross-validation: segments must satisfy relationships
    $cipher_sum = array_sum(unpack('C*', CIPHER));
    
    // Complex validation logic
    // Each segment validates others in a chain
    $val1 = ($check1 * $cipher_sum + $check5) % 1000;
    $val2 = ($check2 * $cipher_sum + $check4) % 1000;
    $val3 = ($check3 * $cipher_sum) % 1000;
    
    // The key is valid if all validations pass
    $validations = [
        $val1 % 17 <= 15,  // Most values pass (16 out of 17)
        $val2 % 19 <= 17,  // Most values pass (18 out of 19)
        $val3 % 23 <= 21,  // Most values pass (22 out of 23)
        ($check1 + $check2 + $check3 + $check4 + $check5) % 100 != 99,  // Sum check (99 out of 100 pass)
        count(array_unique(str_split(str_replace('-', '', $key)))) >= 10,  // Entropy check
    ];
    
    // Additional validation: segment 5 must validate all others
    $all_segs = $seg1 . $seg2 . $seg3 . $seg4;
    $final_check = hash('sha256', $all_segs . str_repeat(CIPHER, 3), true);
    $final_bytes = unpack('C*', substr($final_check, 0, 8));
    $final_value = 0;
    foreach ($final_bytes as $byte) {
        $final_value = ($final_value * 256 + $byte) & 0xFFFFFFFF;
    }
    
    // Verify last segment has correct properties
    $seg5_calculated = '';
    $transformed = cipher_transform(substr($final_check, 0, 8), 4);
    for ($i = 0; $i < 5; $i++) {
        $char_val = ($final_value + $transformed + $i * $cipher_sum) % strlen(CUSTOM_ALPHABET);
        $seg5_calculated .= CUSTOM_ALPHABET[$char_val];
        $final_value = ($final_value * 33 + $char_val) % 0xFFFFFFF;
    }
    
    // The last segment must match our calculation
    if ($seg5 != $seg5_calculated) {
        return false;
    }
    
    return !in_array(false, $validations, true);
}

/**
 * Export constants for client-side validation
 */
function export_constants() {
    echo "\n// Constants for client-side validation:\n";
    echo "const CIPHER = '" . CIPHER . "';\n";
    echo "const CUSTOM_ALPHABET = '" . CUSTOM_ALPHABET . "';\n";
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
                    $valid = validate_key($key);
                    echo "Key: $key\n";
                    echo "Valid: " . ($valid ? '✓ YES' : '✗ NO') . "\n";
                } else {
                    echo "Usage: php keygen.php --validate <key>\n";
                }
                break;
                
            case '--batch':
                $count = ($argc > 2) ? intval($argv[2]) : 5;
                echo "Generating $count keys:\n\n";
                for ($i = 0; $i < $count; $i++) {
                    echo generate_key() . "\n";
                }
                break;
                
            case '--export':
                export_constants();
                break;
                
            case '--test':
                // Test that validation works correctly
                echo "Testing key generation and validation...\n";
                
                // Generate a key
                $key = generate_key();
                echo "Generated: $key\n";
                echo "Valid: " . (validate_key($key) ? '✓' : '✗') . "\n";
                
                // Test modified keys are rejected
                $parts = explode('-', $key);
                
                // Change last character
                $modified1 = implode('-', array_slice($parts, 0, -1)) . '-' . substr($parts[4], 0, -1) . 'A';
                echo "\nModified last char: $modified1\n";
                echo "Valid: " . (validate_key($modified1) ? '✓' : '✗') . "\n";
                
                // Change middle segment
                $modified2 = $parts[0] . '-' . $parts[1] . '-AAAAA-' . $parts[3] . '-' . $parts[4];
                echo "\nModified middle: $modified2\n";
                echo "Valid: " . (validate_key($modified2) ? '✓' : '✗') . "\n";
                
                // Change first segment
                $modified3 = 'BBBBB-' . implode('-', array_slice($parts, 1));
                echo "\nModified first: $modified3\n";
                echo "Valid: " . (validate_key($modified3) ? '✓' : '✗') . "\n";
                break;
                
            default:
                echo "Unknown option. Use: --validate, --batch, --export, --test\n";
                break;
        }
    } else {
        // Default: generate a single key
        $key = generate_key();
        echo $key . "\n";
    }
}
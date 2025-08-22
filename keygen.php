<?php
/**
 * Ultra-secure license key generator for yurucode
 * 5x5 format with HMAC-SHA256 signatures
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
define('LICENSE_ALPHABET', '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'); // 32 chars (no 0,1,I,O)

/**
 * Encode number to 5-char segment
 */
function encode_segment($num) {
    $result = [];
    $base = strlen(LICENSE_ALPHABET);
    for ($i = 0; $i < 5; $i++) {
        $result[] = LICENSE_ALPHABET[$num % $base];
        $num = intval($num / $base);
    }
    return implode('', array_reverse($result));
}

/**
 * Decode 5-char segment to number
 */
function decode_segment($s) {
    $num = 0;
    $base = strlen(LICENSE_ALPHABET);
    $s = strtoupper($s);
    
    for ($i = 0; $i < strlen($s); $i++) {
        $idx = strpos(LICENSE_ALPHABET, $s[$i]);
        if ($idx === false) {
            throw new Exception("Invalid character: " . $s[$i]);
        }
        $num = $num * $base + $idx;
    }
    return $num;
}

/**
 * Create HMAC signature
 */
function create_signature($data, $timestamp) {
    $msg = "$data|$timestamp|" . VALIDATION_SECRET;
    
    // Multi-layer HMAC
    $h1 = hash_hmac('sha256', $msg, MASTER_SECRET, true);
    $h2 = hash_hmac('sha256', $h1 . $timestamp, TIMESTAMP_SECRET, true);
    
    return hash('sha256', $h1 . $h2, true);
}

/**
 * Generate a 5x5 format license key
 */
function generate_license_key() {
    // Current timestamp
    $timestamp = time();
    
    // Generate 3 random segments
    $max_val = pow(32, 5) - 1;
    $seg1 = encode_segment(random_int(0, $max_val));
    $seg2 = encode_segment(random_int(0, $max_val));
    $seg3 = encode_segment($timestamp % pow(32, 5)); // Embed timestamp in seg3
    
    // Create signature from first 3 segments
    $data = "$seg1-$seg2-$seg3";
    $sig = create_signature($data, $timestamp);
    
    // Convert signature to 2 segments
    $sig_num1 = unpack('N', substr($sig, 0, 4))[1] % pow(32, 5);
    $sig_num2 = unpack('N', substr($sig, 4, 4))[1] % pow(32, 5);
    
    $seg4 = encode_segment($sig_num1);
    $seg5 = encode_segment($sig_num2);
    
    return "$seg1-$seg2-$seg3-$seg4-$seg5";
}

/**
 * Validate a license key
 */
function validate_license_signature($key) {
    try {
        // Check format
        $parts = explode('-', strtoupper($key));
        if (count($parts) !== 5) {
            return ['valid' => false, 'error' => 'Invalid format'];
        }
        
        foreach ($parts as $part) {
            if (strlen($part) !== 5) {
                return ['valid' => false, 'error' => 'Invalid segment length'];
            }
            for ($i = 0; $i < strlen($part); $i++) {
                if (strpos(LICENSE_ALPHABET, $part[$i]) === false) {
                    return ['valid' => false, 'error' => 'Invalid character: ' . $part[$i]];
                }
            }
        }
        
        // Decode timestamp from seg3
        $timestamp = decode_segment($parts[2]);
        
        // Basic timestamp validation
        $current = time();
        $base_timestamp = $timestamp;
        $possible_timestamps = [];
        
        $max_seg_value = pow(32, 5);
        // Start from 0 and find all possible timestamps
        $i = 0;
        while (true) {
            $test_timestamp = $base_timestamp + ($i * $max_seg_value);
            if ($test_timestamp > $current + 86400) { // More than 1 day future
                break;
            }
            if ($test_timestamp > $current - (365 * 86400 * 2)) { // Within 2 years
                $possible_timestamps[] = $test_timestamp;
            }
            $i++;
            if ($i > 1000) { // Safety limit
                break;
            }
        }
        
        // Try each possible timestamp
        $data = $parts[0] . '-' . $parts[1] . '-' . $parts[2];
        foreach (array_reverse($possible_timestamps) as $ts) { // Try newest first
            $sig = create_signature($data, $ts);
            
            $sig_num1 = unpack('N', substr($sig, 0, 4))[1] % pow(32, 5);
            $sig_num2 = unpack('N', substr($sig, 4, 4))[1] % pow(32, 5);
            
            $expected_seg4 = encode_segment($sig_num1);
            $expected_seg5 = encode_segment($sig_num2);
            
            if ($parts[3] === $expected_seg4 && $parts[4] === $expected_seg5) {
                return [
                    'valid' => true,
                    'timestamp' => $ts,
                    'issued' => date('Y-m-d H:i:s', $ts),
                    'age_days' => floor(($current - $ts) / 86400)
                ];
            }
        }
        
        return ['valid' => false, 'error' => 'Invalid signature'];
        
    } catch (Exception $e) {
        return ['valid' => false, 'error' => $e->getMessage()];
    }
}

// CLI interface
if (php_sapi_name() === 'cli') {
    $argv = $_SERVER['argv'];
    $argc = $_SERVER['argc'];
    
    $action = ($argc > 1) ? $argv[1] : 'generate';
    
    switch ($action) {
        case '--validate':
        case 'validate':
            if ($argc < 3) {
                echo "Usage: php keygen.php validate <key>\n";
                exit(1);
            }
            
            $result = validate_license_signature($argv[2]);
            echo "License: {$argv[2]}\n";
            if ($result['valid']) {
                echo "Status: ✓ VALID\n";
                echo "Issued: {$result['issued']}\n";
                echo "Age: {$result['age_days']} days\n";
            } else {
                echo "Status: ✗ INVALID\n";
                echo "Error: {$result['error']}\n";
            }
            break;
            
        case '--batch':
        case 'batch':
            $count = ($argc > 2) ? intval($argv[2]) : 10;
            echo "Generating $count license keys:\n\n";
            for ($i = 0; $i < $count; $i++) {
                echo generate_license_key() . "\n";
                usleep(1000);
            }
            break;
            
        case '--test':
        case 'test':
            echo "Testing key generation and validation...\n\n";
            
            $key = generate_license_key();
            echo "Generated: $key\n";
            
            $result = validate_license_signature($key);
            echo "Validation: " . ($result['valid'] ? '✓ VALID' : '✗ INVALID') . "\n";
            if ($result['valid']) {
                echo "Issued: {$result['issued']}\n";
            } else {
                echo "Error: {$result['error']}\n";
            }
            
            echo "\nTesting invalid key:\n";
            $invalid = 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE';
            $result = validate_license_signature($invalid);
            echo "Key: $invalid\n";
            echo "Result: " . (!$result['valid'] ? '✗ INVALID' : '✓ VALID') . "\n";
            if (!$result['valid']) {
                echo "Error: {$result['error']}\n";
            }
            break;
            
        case 'generate':
        default:
            echo generate_license_key() . "\n";
            break;
    }
}
?>
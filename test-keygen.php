<?php
/**
 * Diagnostic script for license key generation
 */

require_once __DIR__ . '/keygen.php';

echo "=== License Key Generation Test ===\n\n";

// Generate a key
$key = generate_license_key();
echo "Generated key: $key\n\n";

// Break down the key
$segments = explode('-', $key);
echo "Segments:\n";
foreach ($segments as $i => $seg) {
    echo "  Segment " . ($i + 1) . ": $seg\n";
    $decoded = decode_from_alphabet($seg);
    if ($decoded !== false) {
        echo "    Decoded: " . bin2hex($decoded) . "\n";
        echo "    Length: " . strlen($decoded) . " bytes\n";
    }
}

echo "\n=== Payload Analysis ===\n";

// Decode full payload
$payload_bytes = '';
for ($i = 0; $i < 3; $i++) {
    $decoded = decode_from_alphabet($segments[$i]);
    echo "Segment " . ($i + 1) . " decoded length: " . strlen($decoded) . " bytes\n";
    $payload_bytes .= $decoded;
}

echo "Total payload length: " . strlen($payload_bytes) . " bytes\n";
echo "Payload hex: " . bin2hex($payload_bytes) . "\n";

// Check if we need padding
if (strlen($payload_bytes) < 16) {
    $padding_needed = 16 - strlen($payload_bytes);
    echo "Padding needed: $padding_needed bytes\n";
    $payload_bytes = str_pad($payload_bytes, 16, "\x00", STR_PAD_RIGHT);
    echo "Padded payload hex: " . bin2hex($payload_bytes) . "\n";
}

// Extract timestamp
$timestamp_bytes = substr($payload_bytes, -4);
echo "\nTimestamp bytes: " . bin2hex($timestamp_bytes) . "\n";
echo "Timestamp bytes length: " . strlen($timestamp_bytes) . "\n";

if (strlen($timestamp_bytes) === 4) {
    $timestamp = unpack('N', $timestamp_bytes)[1];
    echo "Timestamp: $timestamp\n";
    echo "Date: " . date('Y-m-d H:i:s', $timestamp) . "\n";
    
    $current = time();
    echo "Current time: $current\n";
    echo "Current date: " . date('Y-m-d H:i:s', $current) . "\n";
    echo "Difference: " . ($current - $timestamp) . " seconds\n";
}

echo "\n=== Validation Test ===\n";
$result = validate_license_signature($key);
var_dump($result);
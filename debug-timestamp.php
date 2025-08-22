<?php

require_once __DIR__ . '/keygen.php';

echo "Testing timestamp encoding/decoding:\n\n";

// Create a timestamp
$timestamp_int = time();
echo "Original timestamp: $timestamp_int\n";
echo "Date: " . date('Y-m-d H:i:s', $timestamp_int) . "\n\n";

// Pack it
$timestamp_bytes = pack('N', $timestamp_int);
echo "Packed bytes: " . bin2hex($timestamp_bytes) . " (length: " . strlen($timestamp_bytes) . ")\n\n";

// Test encode/decode with just timestamp
$encoded = encode_to_alphabet($timestamp_bytes . "\x00", 5);
echo "Encoded: $encoded\n";

$decoded = decode_from_alphabet($encoded);
echo "Decoded: " . bin2hex($decoded) . " (length: " . strlen($decoded) . ")\n";

// Extract timestamp back
$timestamp_extracted = substr($decoded, 0, 4);
echo "Extracted timestamp bytes: " . bin2hex($timestamp_extracted) . "\n";

if (strlen($timestamp_extracted) === 4) {
    $timestamp_unpacked = unpack('N', $timestamp_extracted)[1];
    echo "Unpacked timestamp: $timestamp_unpacked\n";
    echo "Matches original: " . ($timestamp_unpacked === $timestamp_int ? "YES" : "NO") . "\n";
}

echo "\n\nNow testing full key generation:\n";
$key = generate_license_key();
echo "Generated key: $key\n";

$segments = explode('-', $key);
$seg3_decoded = decode_from_alphabet($segments[2]);
echo "Segment 3 decoded: " . bin2hex($seg3_decoded) . "\n";

$timestamp_from_seg3 = substr($seg3_decoded, 0, 4);
echo "Timestamp bytes from seg3: " . bin2hex($timestamp_from_seg3) . "\n";

if (strlen($timestamp_from_seg3) === 4) {
    $ts = unpack('N', $timestamp_from_seg3)[1];
    echo "Timestamp: $ts\n";
    echo "Date: " . date('Y-m-d H:i:s', $ts) . "\n";
}
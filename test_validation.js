// Test validation with random keys vs real keys
const CUSTOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// Generate a random key that looks valid
function generateRandomKey() {
  let key = '';
  for (let i = 0; i < 25; i++) {
    if (i > 0 && i % 5 === 0) key += '-';
    key += CUSTOM_ALPHABET[Math.floor(Math.random() * CUSTOM_ALPHABET.length)];
  }
  return key;
}

// Test keys
const realKeys = [
  '2KRWC-BLH9G-C8A8K-B5F92-HRH2Z',
  '6WAQY-9D983-7TTDC-6X4SK-FMZMD',
  'TGAWR-HBVPG-4SENJ-ECDDB-J95EY'
];

const randomKeys = [
  generateRandomKey(),
  generateRandomKey(),
  generateRandomKey(),
  'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE',
  '12345-67890-ABCDE-FGHIJ-KLMNO'
];

console.log('Real keys from keygen.py:');
realKeys.forEach(k => console.log(`  ${k}`));

console.log('\nRandom keys:');
randomKeys.forEach(k => console.log(`  ${k}`));

// Basic validation checks
randomKeys.forEach(key => {
  const clean = key.replace(/-/g, '').toUpperCase();
  const uniqueChars = new Set(clean).size;
  const validAlphabet = [...clean].every(c => CUSTOM_ALPHABET.includes(c));
  console.log(`\n${key}:`);
  console.log(`  Unique chars: ${uniqueChars} (need >=12)`);
  console.log(`  Valid alphabet: ${validAlphabet}`);
});

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Font files to embed
const fonts = [
  { file: 'woff2/FiraCode-Regular.woff2', weight: 400, name: 'Fira Code' },
  { file: 'woff2/FiraCode-Medium.woff2', weight: 500, name: 'Fira Code' },
  { file: 'woff2/FiraCode-SemiBold.woff2', weight: 600, name: 'Fira Code' },
  { file: 'Inter-Regular.ttf', weight: 400, name: 'Inter' },
  { file: 'Inter-Medium.ttf', weight: 500, name: 'Inter' },
  { file: 'Inter-SemiBold.ttf', weight: 600, name: 'Inter' }
];

const fontsDir = path.join(__dirname, '..', 'public', 'fonts');
const outputFile = path.join(__dirname, '..', 'src', 'renderer', 'styles', 'embedded-fonts.css');

let css = '/* Embedded fonts for Windows release - AUTO-GENERATED */\n\n';

fonts.forEach(({ file, weight, name }) => {
  const fontPath = path.join(fontsDir, file);
  if (fs.existsSync(fontPath)) {
    const fontData = fs.readFileSync(fontPath);
    const base64 = fontData.toString('base64');
    const format = file.endsWith('.woff2') ? 'woff2' : 'truetype';
    
    css += `@font-face {
  font-family: '${name}';
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
  src: url('data:font/${format};base64,${base64}') format('${format}');
}\n\n`;
    
    console.log(`✅ Embedded ${name} (weight ${weight})`);
  } else {
    console.error(`❌ Font not found: ${fontPath}`);
  }
});

// Add Helvetica/Arial fallback
css += `@font-face {
  font-family: 'Helvetica Neue';
  font-weight: 400;
  font-style: normal;
  src: local('Arial'), local('Segoe UI');
}\n\n`;

css += `@font-face {
  font-family: 'Helvetica';
  font-weight: 400;
  font-style: normal;
  src: local('Arial'), local('Segoe UI');
}\n`;

fs.writeFileSync(outputFile, css);
console.log(`\n✅ Written embedded fonts to ${outputFile}`);
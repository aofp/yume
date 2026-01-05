#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Font files to embed (Comic fonts only - Regular and Bold weights)
const fonts = [
  // Comic Neue (sans-serif default)
  { file: 'woff2/ComicNeue-Regular.woff2', weight: 400, name: 'Comic Neue' },
  { file: 'woff2/ComicNeue-Bold.woff2', weight: 700, name: 'Comic Neue' },
  // Comic Mono (monospace default)
  { file: 'ComicMono.ttf', weight: 400, name: 'Comic Mono' },
  { file: 'ComicMono-Bold.ttf', weight: 700, name: 'Comic Mono' }
];

const fontsDir = path.join(__dirname, '..', 'public', 'fonts');
const outputFile = path.join(__dirname, '..', 'src', 'renderer', 'styles', 'embedded-fonts.css');

let css = '/* Embedded fonts for release builds - AUTO-GENERATED */\n\n';

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

    console.log(`Embedded ${name} (weight ${weight})`);
  } else {
    console.error(`Font not found: ${fontPath}`);
  }
});

fs.writeFileSync(outputFile, css);
console.log(`\nWritten embedded fonts to ${outputFile}`);

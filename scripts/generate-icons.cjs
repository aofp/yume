const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const SOURCE = path.join(__dirname, '..', 'yume.png');
const ICONS_DIR = path.join(__dirname, '..', 'src-tauri', 'icons');

// All required sizes for Tauri
const SIZES = {
  // Standard PNG icons
  '16x16.png': 16,
  '24x24.png': 24,
  '32x32.png': 32,
  '48x48.png': 48,
  '64x64.png': 64,
  '128x128.png': 128,
  '128x128@2x.png': 256,
  '256x256.png': 256,
  '512x512.png': 512,
  'icon.png': 512,
  // Windows Store logos
  'Square30x30Logo.png': 30,
  'Square44x44Logo.png': 44,
  'Square71x71Logo.png': 71,
  'Square89x89Logo.png': 89,
  'Square107x107Logo.png': 107,
  'Square142x142Logo.png': 142,
  'Square150x150Logo.png': 150,
  'Square284x284Logo.png': 284,
  'Square310x310Logo.png': 310,
  'StoreLogo.png': 50,
};

// iOS sizes
const IOS_SIZES = {
  '20.png': 20,
  '29.png': 29,
  '40.png': 40,
  '60.png': 60,
  '76.png': 76,
  '83.5.png': 83.5,
  '120.png': 120,
  '152.png': 152,
  '167.png': 167,
  '180.png': 180,
  '512.png': 512,
  '1024.png': 1024,
  'AppIcon-20x20@1x.png': 20,
  'AppIcon-20x20@2x.png': 40,
  'AppIcon-20x20@3x.png': 60,
  'AppIcon-29x29@1x.png': 29,
  'AppIcon-29x29@2x.png': 58,
  'AppIcon-29x29@3x.png': 87,
  'AppIcon-40x40@1x.png': 40,
  'AppIcon-40x40@2x.png': 80,
  'AppIcon-40x40@3x.png': 120,
  'AppIcon-60x60@2x.png': 120,
  'AppIcon-60x60@3x.png': 180,
  'AppIcon-76x76@1x.png': 76,
  'AppIcon-76x76@2x.png': 152,
  'AppIcon-83.5x83.5@2x.png': 167,
  'AppIcon-512@2x.png': 1024,
};

// Android sizes
const ANDROID_SIZES = {
  'hdpi': 72,
  'mdpi': 48,
  'xhdpi': 96,
  'xxhdpi': 144,
  'xxxhdpi': 192,
};

async function generatePNG(size, outputPath) {
  const roundedSize = Math.round(size);
  await sharp(SOURCE)
    .resize(roundedSize, roundedSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({
      compressionLevel: 9,
      palette: false, // keep RGBA, no palette
    })
    .toFile(outputPath);
  console.log(`Generated: ${path.basename(outputPath)} (${roundedSize}x${roundedSize})`);
}

async function generateICO(outputPath) {
  // Generate multiple sizes for ICO
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = [];

  for (const size of icoSizes) {
    const buf = await sharp(SOURCE)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    buffers.push({ size, data: buf });
  }

  // Create ICO file manually (PNG compressed)
  const ico = createICO(buffers);
  fs.writeFileSync(outputPath, ico);
  console.log(`Generated: icon.ico (${icoSizes.join(', ')}px)`);
}

function createICO(images) {
  // ICO header: 6 bytes
  // Entry: 16 bytes each
  // Image data follows

  const numImages = images.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + (entrySize * numImages);

  let currentOffset = dataOffset;
  const entries = [];

  for (const img of images) {
    entries.push({
      width: img.size === 256 ? 0 : img.size,
      height: img.size === 256 ? 0 : img.size,
      offset: currentOffset,
      size: img.data.length
    });
    currentOffset += img.data.length;
  }

  const totalSize = currentOffset;
  const buffer = Buffer.alloc(totalSize);

  // ICO header
  buffer.writeUInt16LE(0, 0);      // Reserved
  buffer.writeUInt16LE(1, 2);      // Type: 1 = ICO
  buffer.writeUInt16LE(numImages, 4); // Number of images

  // Directory entries
  let pos = 6;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    buffer.writeUInt8(entry.width, pos);      // Width
    buffer.writeUInt8(entry.height, pos + 1); // Height
    buffer.writeUInt8(0, pos + 2);            // Color palette
    buffer.writeUInt8(0, pos + 3);            // Reserved
    buffer.writeUInt16LE(1, pos + 4);         // Color planes
    buffer.writeUInt16LE(32, pos + 6);        // Bits per pixel
    buffer.writeUInt32LE(entry.size, pos + 8);    // Image size
    buffer.writeUInt32LE(entry.offset, pos + 12); // Image offset
    pos += 16;
  }

  // Image data
  for (let i = 0; i < images.length; i++) {
    images[i].data.copy(buffer, entries[i].offset);
  }

  return buffer;
}

async function generateICNS(outputPath) {
  // For macOS ICNS, we'll use iconutil if available, otherwise create manually
  const tmpDir = path.join(__dirname, '..', '.icon-tmp.iconset');

  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
  fs.mkdirSync(tmpDir);

  const icnsSizes = {
    'icon_16x16.png': 16,
    'icon_16x16@2x.png': 32,
    'icon_32x32.png': 32,
    'icon_32x32@2x.png': 64,
    'icon_128x128.png': 128,
    'icon_128x128@2x.png': 256,
    'icon_256x256.png': 256,
    'icon_256x256@2x.png': 512,
    'icon_512x512.png': 512,
    'icon_512x512@2x.png': 1024,
  };

  for (const [name, size] of Object.entries(icnsSizes)) {
    await sharp(SOURCE)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 9 })
      .toFile(path.join(tmpDir, name));
  }

  // Use iconutil to create icns
  try {
    execSync(`iconutil -c icns "${tmpDir}" -o "${outputPath}"`, { stdio: 'pipe' });
    console.log('Generated: icon.icns');
  } catch (e) {
    console.error('Failed to generate ICNS:', e.message);
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });
}

async function main() {
  console.log('Generating icons from yume.png...\n');

  // Generate standard PNGs
  for (const [name, size] of Object.entries(SIZES)) {
    await generatePNG(size, path.join(ICONS_DIR, name));
  }

  // Generate iOS icons
  const iosDir = path.join(ICONS_DIR, 'ios');
  if (fs.existsSync(iosDir)) {
    for (const [name, size] of Object.entries(IOS_SIZES)) {
      await generatePNG(size, path.join(iosDir, name));
    }
  }

  // Generate Android icons
  const androidDir = path.join(ICONS_DIR, 'android');
  if (fs.existsSync(androidDir)) {
    for (const [folder, size] of Object.entries(ANDROID_SIZES)) {
      const folderPath = path.join(androidDir, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      await generatePNG(size, path.join(folderPath, 'ic_launcher.png'));
      // Also generate round version
      await generatePNG(size, path.join(folderPath, 'ic_launcher_round.png'));
      // Foreground
      await generatePNG(size, path.join(folderPath, 'ic_launcher_foreground.png'));
    }
  }

  // Generate ICO
  await generateICO(path.join(ICONS_DIR, 'icon.ico'));

  // Generate ICNS (macOS only)
  if (process.platform === 'darwin') {
    await generateICNS(path.join(ICONS_DIR, 'icon.icns'));
  }

  // Copy to other locations
  const publicDir = path.join(__dirname, '..', 'public');
  const assetsIconsWin = path.join(__dirname, '..', 'assets', 'icons', 'win');
  const assetsIconsMac = path.join(__dirname, '..', 'assets', 'icons', 'mac');

  // Copy to public
  if (fs.existsSync(publicDir)) {
    await generatePNG(512, path.join(publicDir, 'icon.png'));
    await sharp(SOURCE)
      .resize(512, 512)
      .webp({ quality: 90 })
      .toFile(path.join(publicDir, 'icon.webp'));
    console.log('Generated: public/icon.png & icon.webp');
  }

  // Copy to assets
  if (fs.existsSync(assetsIconsWin)) {
    fs.copyFileSync(path.join(ICONS_DIR, 'icon.ico'), path.join(assetsIconsWin, 'icon.ico'));
    console.log('Copied: assets/icons/win/icon.ico');
  }
  if (fs.existsSync(assetsIconsMac)) {
    await generatePNG(512, path.join(assetsIconsMac, 'icon.png'));
    console.log('Generated: assets/icons/mac/icon.png');
  }

  console.log('\nDone! All icons generated with RGBA format and compressed.');
}

main().catch(console.error);

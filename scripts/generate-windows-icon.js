#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateWindowsIcon() {
  const inputPath = path.join(__dirname, '../yume.png');
  const iconPath = path.join(__dirname, '../src-tauri/icons/icon.ico');
  
  // Read the source image
  const input = sharp(inputPath);
  const metadata = await input.metadata();
  
  console.log(`Source image: ${metadata.width}x${metadata.height}`);
  
  // Generate multiple sizes for Windows .ico
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = [];
  
  for (const size of sizes) {
    const buffer = await sharp(inputPath)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    
    buffers.push(buffer);
    console.log(`Generated ${size}x${size} icon`);
  }
  
  // Create ICO file manually
  const ico = createIco(buffers);
  fs.writeFileSync(iconPath, ico);
  
  console.log(`Windows icon saved to: ${iconPath}`);
  
  // Also update the individual PNG sizes
  const pngSizes = [
    { size: 32, path: '../src-tauri/icons/32x32.png' },
    { size: 128, path: '../src-tauri/icons/128x128.png' },
    { size: 256, path: '../src-tauri/icons/128x128@2x.png' }
  ];
  
  for (const { size, path: pngPath } of pngSizes) {
    await sharp(inputPath)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(__dirname, pngPath));
    
    console.log(`Updated ${pngPath}`);
  }
}

function createIco(pngBuffers) {
  const headerSize = 6;
  const directorySize = 16;
  
  // Calculate offsets
  let offset = headerSize + (directorySize * pngBuffers.length);
  const directories = [];
  const images = [];
  
  for (const buffer of pngBuffers) {
    // Read PNG dimensions from buffer
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const size = width <= 256 ? width : 0;
    
    directories.push({
      width: size,
      height: size,
      colorCount: 0,
      reserved: 0,
      planes: 1,
      bitCount: 32,
      bytesInRes: buffer.length,
      imageOffset: offset
    });
    
    images.push(buffer);
    offset += buffer.length;
  }
  
  // Create ICO header
  const ico = Buffer.alloc(offset);
  
  // ICONDIR structure
  ico.writeUInt16LE(0, 0); // Reserved
  ico.writeUInt16LE(1, 2); // Type (1 = ICO)
  ico.writeUInt16LE(pngBuffers.length, 4); // Count
  
  // Write ICONDIRENTRY structures
  let pos = 6;
  for (const dir of directories) {
    ico.writeUInt8(dir.width === 256 ? 0 : dir.width, pos);
    ico.writeUInt8(dir.height === 256 ? 0 : dir.height, pos + 1);
    ico.writeUInt8(dir.colorCount, pos + 2);
    ico.writeUInt8(dir.reserved, pos + 3);
    ico.writeUInt16LE(dir.planes, pos + 4);
    ico.writeUInt16LE(dir.bitCount, pos + 6);
    ico.writeUInt32LE(dir.bytesInRes, pos + 8);
    ico.writeUInt32LE(dir.imageOffset, pos + 12);
    pos += 16;
  }
  
  // Write image data
  for (let i = 0; i < images.length; i++) {
    images[i].copy(ico, directories[i].imageOffset);
  }
  
  return ico;
}

generateWindowsIcon().catch(console.error);

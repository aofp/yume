#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function convertToWebP() {
  console.log('🖼️  Converting PNG images to WebP...');
  
  const imagePaths = [
    // Public directory
    { dir: path.join(__dirname, '../public'), files: ['yume.png', 'icon.png', 'favicon.png'] },
    // Dist directory (if exists)
    { dir: path.join(__dirname, '../dist/renderer'), files: ['yume.png', 'icon.png'] },
    { dir: path.join(__dirname, '../dist/renderer/assets'), files: [] }  // Will scan for PNG files
  ];
  
  let totalSaved = 0;
  
  for (const { dir, files } of imagePaths) {
    try {
      await fs.access(dir);
    } catch {
      continue; // Directory doesn't exist
    }
    
    let pngFiles = files;
    
    // If no specific files, scan for all PNGs
    if (files.length === 0) {
      const allFiles = await fs.readdir(dir);
      pngFiles = allFiles.filter(f => f.endsWith('.png'));
    }
    
    for (const pngFile of pngFiles) {
      const pngPath = path.join(dir, pngFile);
      
      try {
        await fs.access(pngPath);
      } catch {
        continue; // File doesn't exist
      }
      
      const webpFile = pngFile.replace('.png', '.webp');
      const webpPath = path.join(dir, webpFile);
      
      const originalSize = (await fs.stat(pngPath)).size;
      console.log(`\n📄 Converting: ${pngFile}`);
      console.log(`   Original PNG: ${(originalSize / 1024).toFixed(2)} KB`);
      
      // Convert to WebP with good quality
      await sharp(pngPath)
        .webp({ 
          quality: 90,  // High quality
          lossless: false,  // Use lossy for better compression
          effort: 6  // Max compression effort
        })
        .toFile(webpPath);
      
      const webpSize = (await fs.stat(webpPath)).size;
      const saved = originalSize - webpSize;
      totalSaved += saved;
      
      console.log(`   WebP size: ${(webpSize / 1024).toFixed(2)} KB`);
      console.log(`   ✅ Saved: ${(saved / 1024).toFixed(2)} KB (${((saved / originalSize) * 100).toFixed(1)}%)`);
      
      // Keep PNG for compatibility but could delete if brave
      // await fs.unlink(pngPath);
    }
  }
  
  console.log(`\n🎉 Image conversion complete!`);
  console.log(`   Total saved: ${(totalSaved / 1024).toFixed(2)} KB`);
  
  // Update references in HTML and code
  console.log('\n📝 Updating references...');
  
  // Update index.html
  const indexPath = path.join(__dirname, '../index.html');
  try {
    let indexContent = await fs.readFile(indexPath, 'utf-8');
    const originalIndex = indexContent;
    
    // Update favicon to WebP with PNG fallback
    indexContent = indexContent.replace(
      '<link rel="icon" type="image/png" href="./yume.png" />',
      '<link rel="icon" type="image/webp" href="./yume.webp" />\n    <link rel="icon" type="image/png" href="./yume.png" />'
    );
    
    if (indexContent !== originalIndex) {
      await fs.writeFile(indexPath, indexContent);
      console.log('   ✅ Updated index.html');
    }
  } catch (error) {
    console.log('   ⚠️  Could not update index.html:', error.message);
  }
  
  console.log('\n✨ All done! Remember to update any hardcoded image references in your React components.');
}

convertToWebP();
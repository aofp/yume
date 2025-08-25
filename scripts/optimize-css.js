#!/usr/bin/env node

import { PurgeCSS } from 'purgecss';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function optimizeCSS() {
  console.log('🎨 Optimizing CSS with PurgeCSS...');
  
  const distPath = path.join(__dirname, '../dist/renderer/assets');
  
  try {
    // Find all CSS files in dist
    const files = await fs.readdir(distPath);
    const cssFiles = files.filter(f => f.endsWith('.css'));
    
    if (cssFiles.length === 0) {
      console.log('⚠️  No CSS files found in dist. Run build first.');
      return;
    }
    
    for (const cssFile of cssFiles) {
      const cssPath = path.join(distPath, cssFile);
      const originalSize = (await fs.stat(cssPath)).size;
      
      console.log(`\n📄 Processing: ${cssFile}`);
      console.log(`   Original size: ${(originalSize / 1024).toFixed(2)} KB`);
      
      // Run PurgeCSS
      const purgeCSSResult = await new PurgeCSS().purge({
        content: [
          path.join(__dirname, '../index.html'),
          path.join(__dirname, '../src/**/*.{tsx,ts,jsx,js}'),
          path.join(__dirname, '../dist/renderer/**/*.{html,js}')
        ],
        css: [cssPath],
        defaultExtractor: content => {
          // Extract all potential class names, including dynamic ones
          const broadMatches = content.match(/[^<>"'`\s]*[^<>"'`\s:]/g) || [];
          const innerMatches = content.match(/[^<>"'`\s.()]*[^<>"'`\s.():]/g) || [];
          const dynamicMatches = content.match(/(?:text|bg|border|ring|hover|focus|active|disabled|group|peer|placeholder|first|last|odd|even|dark|sm|md|lg|xl|2xl)-[a-z0-9-]+/g) || [];
          
          return [...broadMatches, ...innerMatches, ...dynamicMatches];
        },
        safelist: {
          standard: [
            // Keep all syntax highlighting classes
            /^hljs/,
            /^language-/,
            /^token/,
            /^prism/,
            // Keep markdown classes
            /^markdown/,
            /^prose/,
            // Keep React and framework classes
            /^react-/,
            /^Toastify/,
            // Keep icon classes
            /^ti-/,
            /^tabler-/,
            // Keep animation classes
            /^animate-/,
            /^transition-/,
            // Keep theme classes
            /^dark/,
            /^light/,
            // Keep layout classes that might be dynamically added
            /^overflow-/,
            /^scroll/,
            /^resize/,
            /^cursor-/,
            /^select-/,
            /^opacity-/,
            /^visible/,
            /^invisible/,
            /^hidden/,
            /^block/,
            /^inline/,
            /^flex/,
            /^grid/,
            // Keep position classes
            /^fixed/,
            /^absolute/,
            /^relative/,
            /^sticky/,
            /^static/,
            /^top-/,
            /^bottom-/,
            /^left-/,
            /^right-/,
            /^z-/
          ],
          deep: [
            // Keep all children of certain containers
            /hljs/,
            /language-/,
            /markdown/
          ],
          greedy: [
            // Keep color variations
            /cyan/,
            /magenta/,
            /gray/,
            /grey/,
            /black/,
            /white/
          ]
        },
        fontFace: true,
        keyframes: true,
        variables: true
      });
      
      if (purgeCSSResult.length > 0 && purgeCSSResult[0].css) {
        // Write optimized CSS
        await fs.writeFile(cssPath, purgeCSSResult[0].css);
        
        const newSize = (await fs.stat(cssPath)).size;
        const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);
        
        console.log(`   Optimized size: ${(newSize / 1024).toFixed(2)} KB`);
        console.log(`   ✅ Reduced by ${reduction}%`);
      }
    }
    
    console.log('\n🎉 CSS optimization complete!');
    
  } catch (error) {
    console.error('❌ Error optimizing CSS:', error);
    process.exit(1);
  }
}

optimizeCSS();
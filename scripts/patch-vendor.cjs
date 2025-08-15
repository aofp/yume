const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'dist', 'renderer', 'assets');

if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Fix Object.assign when minified (could be any variable)
    // Look for patterns like: g=Object.assign, then later g(...) is undefined
    // Replace any single-letter variable assigned to Object (like g=Object)
    const objectVarMatch = content.match(/\b([a-z])=Object\./);
    if (objectVarMatch) {
      const varName = objectVarMatch[1];
      // Replace patterns like varName.assign with Object.assign
      const pattern = new RegExp(`\\b${varName}\\.assign`, 'g');
      content = content.replace(pattern, 'Object.assign');
      modified = true;
    }
    
    // Also fix these common patterns
    const patterns = [
      // Pattern: something.Object.assign
      [/([a-zA-Z_$][a-zA-Z0-9_$]*)\.Object\.assign/g, 'Object.assign'],
      // Pattern: (0,something).Object.assign
      [/\(0,\s*[^)]+\)\.Object\.assign/g, 'Object.assign'],
      // Pattern: require_core().Object.assign
      [/require_core\(\)\.Object\.assign/g, 'Object.assign'],
    ];
    
    patterns.forEach(([pattern, replacement]) => {
      const newContent = content.replace(pattern, replacement);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`Patched: ${file}`);
    }
  });
  
  console.log('Build patching complete');
} else {
  console.log('Build directory not found');
}
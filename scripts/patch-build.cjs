const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'dist', 'renderer', 'assets');

if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Fix various Object.assign patterns
    const patterns = [
      // Pattern 1: require_core().Object.assign
      [/require_core\(\)\.Object\.assign/g, 'Object.assign'],
      // Pattern 2: any variable.Object.assign
      [/\b(\w+)\.Object\.assign\(/g, 'Object.assign('],
      // Pattern 3: (0, something).Object.assign
      [/\(0,\s*[^)]+\)\.Object\.assign/g, 'Object.assign'],
      // Pattern 4: Minified patterns like n.Object.assign
      [/\bn\.Object\.assign/g, 'Object.assign'],
      [/\bt\.Object\.assign/g, 'Object.assign'],
      [/\be\.Object\.assign/g, 'Object.assign'],
      [/\br\.Object\.assign/g, 'Object.assign'],
      [/\bi\.Object\.assign/g, 'Object.assign'],
      [/\bo\.Object\.assign/g, 'Object.assign'],
      [/\ba\.Object\.assign/g, 'Object.assign'],
      [/\bs\.Object\.assign/g, 'Object.assign'],
      [/\bc\.Object\.assign/g, 'Object.assign'],
      [/\bu\.Object\.assign/g, 'Object.assign'],
      [/\bl\.Object\.assign/g, 'Object.assign'],
      [/\bd\.Object\.assign/g, 'Object.assign'],
      [/\bf\.Object\.assign/g, 'Object.assign'],
      [/\bp\.Object\.assign/g, 'Object.assign'],
      [/\bh\.Object\.assign/g, 'Object.assign'],
      [/\bm\.Object\.assign/g, 'Object.assign'],
      [/\bg\.Object\.assign/g, 'Object.assign'],
      [/\bv\.Object\.assign/g, 'Object.assign'],
      [/\by\.Object\.assign/g, 'Object.assign'],
      [/\bw\.Object\.assign/g, 'Object.assign'],
      [/\bx\.Object\.assign/g, 'Object.assign'],
      [/\bk\.Object\.assign/g, 'Object.assign'],
      [/\bj\.Object\.assign/g, 'Object.assign'],
      [/\bq\.Object\.assign/g, 'Object.assign'],
      [/\bz\.Object\.assign/g, 'Object.assign'],
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
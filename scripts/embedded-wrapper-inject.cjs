#!/usr/bin/env node

/**
 * Inject wrapper code into logged_server.rs embedded server
 * 
 * This modifies the embedded server string to include wrapper functionality
 */

const fs = require('fs');
const path = require('path');

const LOGGED_SERVER_FILE = path.join(__dirname, '..', 'src-tauri', 'src', 'logged_server.rs');

// Read the file
let content = fs.readFileSync(LOGGED_SERVER_FILE, 'utf8');

// Check if wrapper already injected
if (content.includes('WRAPPER_INJECTED')) {
  console.log('⚠️ Wrapper already injected');
  process.exit(0);
}

// The wrapper code to inject (minimal version for embedding)
const wrapperCode = `
// ============================================
// WRAPPER_INJECTED - Universal Claude Wrapper
// ============================================

const wrapperState = {
  sessions: new Map(),
  stats: { apiCalls: 0, totalTokens: 0, compacts: 0 }
};

function getWrapperSession(sessionId) {
  if (!wrapperState.sessions.has(sessionId)) {
    wrapperState.sessions.set(sessionId, {
      id: sessionId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      messageCount: 0,
      apiResponses: [],
      compactCount: 0,
      wasCompacted: false,
      tokensSaved: 0
    });
    console.log(\`✅ [WRAPPER] Created session: \${sessionId}\`);
  }
  return wrapperState.sessions.get(sessionId);
}

function processWrapperLine(line, sessionId) {
  if (!line || !line.trim()) return line;
  
  const session = getWrapperSession(sessionId);
  
  try {
    const data = JSON.parse(line);
    
    // Log API response
    wrapperState.stats.apiCalls++;
    console.log(\`📡 [WRAPPER] API \${data.type} #\${wrapperState.stats.apiCalls}\`);
    
    // Store API response
    session.apiResponses.push({
      timestamp: Date.now(),
      type: data.type,
      data: { ...data }
    });
    
    // Track messages
    if (data.type === 'user' || data.type === 'assistant') {
      session.messageCount++;
    }
    
    // Update tokens if usage present
    if (data.usage) {
      const input = data.usage.input_tokens || 0;
      const output = data.usage.output_tokens || 0;
      const cacheCreation = data.usage.cache_creation_input_tokens || 0;
      const cacheRead = data.usage.cache_read_input_tokens || 0;
      
      session.inputTokens += input + cacheCreation;
      session.outputTokens += output;
      
      const prevTotal = session.totalTokens;
      session.totalTokens = session.inputTokens + session.outputTokens;
      
      const delta = session.totalTokens - prevTotal;
      wrapperState.stats.totalTokens += delta;
      
      console.log(\`📊 [WRAPPER] TOKENS +\${delta} → \${session.totalTokens}/100000 (\${Math.round(session.totalTokens/1000)}%)\`);
    }
    
    // Detect compaction
    if (data.type === 'result' && data.result === '' && 
        (!data.usage || (data.usage.input_tokens === 0 && data.usage.output_tokens === 0))) {
      
      const savedTokens = session.totalTokens;
      console.log(\`🗜️ [WRAPPER] COMPACTION DETECTED! Saved \${savedTokens} tokens\`);
      
      session.compactCount++;
      session.wasCompacted = true;
      session.tokensSaved += savedTokens;
      wrapperState.stats.compacts++;
      
      // Reset tokens
      session.inputTokens = 0;
      session.outputTokens = 0;
      session.totalTokens = 0;
      
      // Generate summary
      const summary = \`✅ Conversation compacted successfully!
      
📊 Compaction Summary:
• Tokens saved: \${savedTokens}
• Messages compressed: \${session.messageCount}
• Total saved so far: \${session.tokensSaved}

✨ Context reset - you can continue normally.\`;
      
      data.result = summary;
      data.wrapper_compact = {
        savedTokens,
        totalSaved: session.tokensSaved,
        compactCount: session.compactCount
      };
      
      console.log(\`🗜️ [WRAPPER] Compaction complete\`);
    }
    
    // Add wrapper data to every message
    data.wrapper = {
      enabled: true,
      tokens: {
        total: session.totalTokens,
        input: session.inputTokens,
        output: session.outputTokens
      },
      compaction: {
        count: session.compactCount,
        wasCompacted: session.wasCompacted,
        tokensSaved: session.tokensSaved
      }
    };
    
    return JSON.stringify(data);
    
  } catch (e) {
    // Not JSON - pass through
    return line;
  }
}

console.log('════════════════════════════════════════════════════════');
console.log('🎯 WRAPPER EMBEDDED - Token tracking and compaction enabled');
console.log('════════════════════════════════════════════════════════');
`;

// Find where to inject (after the console wrapper setup, before the main server code)
const injectAfter = 'console.debug = function(...args) {';
const injectPoint = content.indexOf(injectAfter);

if (injectPoint === -1) {
  console.error('❌ Could not find injection point');
  process.exit(1);
}

// Find the end of that function
let braceCount = 0;
let i = injectPoint;
let foundStart = false;

while (i < content.length) {
  if (content[i] === '{') {
    braceCount++;
    foundStart = true;
  } else if (content[i] === '}' && foundStart) {
    braceCount--;
    if (braceCount === 0) {
      // Found the closing brace
      i = content.indexOf('};', i) + 2;
      break;
    }
  }
  i++;
}

// Insert wrapper code after the console setup
const before = content.substring(0, i);
const after = content.substring(i);
content = before + '\n' + wrapperCode + after;

// Now modify processStreamLine to use the wrapper
const processStreamLineMatch = /const processStreamLine = \(line\) => \{[\s\S]*?console\.log\(\`🔹.*?\`\);/;
const match = content.match(processStreamLineMatch);

if (match) {
  const replacement = match[0] + `
        
        // WRAPPER: Process line for API capture and token tracking
        try {
          const augmentedLine = processWrapperLine(line, sessionId);
          if (augmentedLine && augmentedLine !== line) {
            line = augmentedLine;
          }
        } catch (e) {
          console.error(\`[WRAPPER] Error processing line:\`, e.message);
        }`;
  
  content = content.replace(match[0], replacement);
  console.log('✅ Modified processStreamLine to use wrapper');
} else {
  console.error('❌ Could not find processStreamLine to modify');
}

// Write the modified file
fs.writeFileSync(LOGGED_SERVER_FILE, content);

console.log('✅ Wrapper injected into logged_server.rs');
console.log('🎯 Features enabled:');
console.log('  • API response logging');
console.log('  • Token tracking and accumulation');
console.log('  • Compaction detection with summaries');
console.log('  • Session state management');
console.log('\n⚠️ Rebuild required: cargo build');
console.log('📝 Then restart: npm run tauri:dev');
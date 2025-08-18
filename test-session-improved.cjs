#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Test improved session parsing
function testImprovedParsing() {
  const projectDir = '/mnt/c/Users/muuko/.claude/projects/C--Users-muuko-Desktop-yurucode';
  const sessionFiles = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl')).slice(0, 5);
  
  console.log('=== TESTING IMPROVED SESSION PARSING ===\n');
  
  for (const sessionFile of sessionFiles) {
    const sessionPath = path.join(projectDir, sessionFile);
    const sessionId = sessionFile.replace('.jsonl', '');
    
    console.log(`\n--- Session: ${sessionId} ---`);
    
    // Read file
    const content = fs.readFileSync(sessionPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    // Find summary
    let summary = 'untitled session';
    let firstUserMessage = null;
    let lastTimestamp = null;
    
    // First pass: Look for Claude's summary
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        
        // Check for summary field
        if (data.summary && typeof data.summary === 'string') {
          summary = data.summary;
          console.log(`  Claude Summary: "${summary}"`);
          break;
        }
      } catch {}
    }
    
    // Second pass: If no summary, extract from first user message
    if (summary === 'untitled session') {
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          
          if (data.type === 'user' && data.message) {
            let content = data.message.content;
            let extractedText = '';
            
            // Handle double-encoded JSON string
            if (typeof content === 'string') {
              // Try to parse as JSON if it looks like JSON
              if (content.startsWith('[') && content.includes('{"type"')) {
                try {
                  const parsed = JSON.parse(content);
                  if (Array.isArray(parsed) && parsed[0]?.type === 'text') {
                    extractedText = parsed[0].text;
                  }
                } catch {
                  extractedText = content;
                }
              } else {
                extractedText = content;
              }
            } else if (Array.isArray(content)) {
              const textBlock = content.find(c => c.type === 'text');
              if (textBlock) {
                extractedText = textBlock.text;
              }
            }
            
            // Clean and validate text
            if (extractedText) {
              extractedText = extractedText.trim();
              
              // Skip system messages
              const skipPatterns = [
                'Todos have been modified',
                'Invalid API key',
                'Please run /login',
                'Got Claude SDK session',
                '[0] 📌',
                'successfully',
                'Error:',
                'Warning:'
              ];
              
              let isSystemMessage = false;
              for (const pattern of skipPatterns) {
                if (extractedText.includes(pattern)) {
                  isSystemMessage = true;
                  break;
                }
              }
              
              if (!isSystemMessage && extractedText.length > 10) {
                summary = extractedText.substring(0, 60).replace(/[\n\r]+/g, ' ') + '...';
                console.log(`  User Message Summary: "${summary}"`);
                break;
              }
            }
          }
        } catch (e) {
          // Skip parse errors
        }
      }
    }
    
    // Get last timestamp
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const data = JSON.parse(lines[i]);
        if (data.timestamp) {
          lastTimestamp = new Date(data.timestamp);
          break;
        }
      } catch {}
    }
    
    if (lastTimestamp) {
      const now = new Date();
      const relativeTime = getRelativeTime(lastTimestamp, now);
      console.log(`  Last Modified: ${lastTimestamp.toISOString()}`);
      console.log(`  Relative Time: ${relativeTime}`);
    }
    
    console.log(`  Final Summary: "${summary}"`);
  }
}

function getRelativeTime(date, now) {
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days === 0) {
    if (hours === 0) {
      if (minutes === 0) {
        return 'just now';
      }
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    }
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else if (days === 1) {
    return 'yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else if (days < 14) {
    return '1 week ago';
  } else if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} weeks ago`;
  } else if (days < 60) {
    return '1 month ago';
  } else {
    const months = Math.floor(days / 30);
    return `${months} months ago`;
  }
}

// Run test
testImprovedParsing();
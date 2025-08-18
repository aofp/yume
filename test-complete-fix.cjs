#!/usr/bin/env node

// This is the COMPLETE FIXED parsing logic for Windows embedded server

const fs = require('fs');
const path = require('path');
const os = require('os');

function parseSessionSummary(sessionPath, sessionId) {
  try {
    const sessionStats = fs.statSync(sessionPath);
    
    // Read first 10KB for summary
    const fd = fs.openSync(sessionPath, 'r');
    const firstBuffer = Buffer.alloc(10240);
    const firstBytesRead = fs.readSync(fd, firstBuffer, 0, 10240, 0);
    
    // Also read last 2KB for latest timestamp
    let lastBuffer = null;
    let lastBytesRead = 0;
    if (sessionStats.size > 10240) {
      lastBuffer = Buffer.alloc(2048);
      const offset = Math.max(0, sessionStats.size - 2048);
      lastBytesRead = fs.readSync(fd, lastBuffer, 0, 2048, offset);
    }
    
    fs.closeSync(fd);
    
    // Initialize results
    let summary = 'untitled session';
    let lastTimestamp = null;
    let messageCount = 0;
    
    if (firstBytesRead > 0) {
      const partialContent = firstBuffer.toString('utf8', 0, firstBytesRead);
      const lines = partialContent.split('\n').filter(line => line.trim());
      
      // Estimate message count
      if (sessionStats.size > 10240) {
        const avgLineLength = firstBytesRead / Math.max(1, lines.length);
        messageCount = Math.round(sessionStats.size / avgLineLength);
      } else {
        messageCount = lines.length;
      }
      
      // Parse first few lines to find summary
      for (let i = 0; i < Math.min(10, lines.length); i++) {
        try {
          const data = JSON.parse(lines[i]);
          
          // Update timestamp
          if (data.timestamp) {
            const ts = new Date(data.timestamp).getTime();
            if (!lastTimestamp || ts > lastTimestamp) {
              lastTimestamp = ts;
            }
          }
          
          // PRIORITY 1: Look for Claude's summary field
          if (data.summary && typeof data.summary === 'string' && 
              !data.summary.includes('Invalid API key')) {
            summary = data.summary;
            console.log(`  Found Claude summary: "${summary.substring(0, 50)}..."`);
            break;
          }
          
          // PRIORITY 2: Extract from first user message
          if (summary === 'untitled session' && data.type === 'user' && data.message) {
            let content = data.message.content;
            let extractedText = '';
            
            // Parse the content - it may be double-encoded
            if (typeof content === 'string') {
              // Check if it's a JSON string
              if (content.startsWith('[') && content.includes('{"type"')) {
                try {
                  const parsed = JSON.parse(content);
                  if (Array.isArray(parsed)) {
                    const textBlock = parsed.find(item => item.type === 'text');
                    if (textBlock && textBlock.text) {
                      extractedText = textBlock.text;
                    } else if (typeof parsed[0] === 'string') {
                      extractedText = parsed[0];
                    }
                  }
                } catch {
                  // Not JSON, use as-is
                  extractedText = content;
                }
              } else {
                extractedText = content;
              }
            } else if (Array.isArray(content)) {
              // Already an array
              const textBlock = content.find(c => c.type === 'text');
              if (textBlock && textBlock.text) {
                extractedText = textBlock.text;
              }
            }
            
            // Clean up the extracted text
            if (extractedText && typeof extractedText === 'string') {
              // Remove [Attached text] prefix
              extractedText = extractedText.replace(/^\[Attached text\][\s:]*[\n\r]*/gi, '');
              extractedText = extractedText.replace(/\\n/g, '\n');
              extractedText = extractedText.replace(/\\r/g, '');
              extractedText = extractedText.trim();
              
              // Skip system messages
              const systemPatterns = [
                'Todos have been modified',
                'Invalid API key',
                'Please run /login',
                'Got Claude SDK session',
                '[0] 📌',
                'successfully',
                'modified',
                'updated',
                'Error:',
                'Warning:',
                'Whenever you read a file'  // Skip file reading reminders
              ];
              
              let isSystemMessage = false;
              for (const pattern of systemPatterns) {
                if (extractedText.includes(pattern)) {
                  isSystemMessage = true;
                  console.log(`  Skipping system message with: "${pattern}"`);
                  break;
                }
              }
              
              if (!isSystemMessage && extractedText.length > 10) {
                // Get first meaningful line
                const lines = extractedText.split('\n');
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed.length > 10) {
                    summary = trimmed.substring(0, 60);
                    if (trimmed.length > 60) summary += '...';
                    console.log(`  Extracted from user message: "${summary}"`);
                    break;
                  }
                }
              }
            }
          }
        } catch (e) {
          // Skip malformed lines
        }
      }
      
      // Parse last buffer for most recent timestamp
      if (lastBytesRead > 0) {
        const lastContent = lastBuffer.toString('utf8', 0, lastBytesRead);
        const lastLines = lastContent.split('\n').filter(line => line.trim());
        
        for (let i = lastLines.length - 1; i >= Math.max(0, lastLines.length - 10); i--) {
          try {
            const data = JSON.parse(lastLines[i]);
            if (data.timestamp) {
              const ts = new Date(data.timestamp).getTime();
              if (!lastTimestamp || ts > lastTimestamp) {
                lastTimestamp = ts;
                console.log(`  Found last timestamp: ${data.timestamp}`);
              }
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    }
    
    // Fallback to file modification time if no timestamp found
    if (!lastTimestamp) {
      lastTimestamp = sessionStats.mtime.getTime();
      console.log(`  No timestamp in file, using mtime`);
    }
    
    return {
      id: sessionId,
      summary,
      timestamp: lastTimestamp,
      path: sessionPath,
      messageCount
    };
    
  } catch (err) {
    console.error(`Error processing session ${sessionId}:`, err.message);
    return null;
  }
}

function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days === 0) {
    if (hours === 0) {
      if (minutes === 0) {
        return 'just now';
      } else if (minutes === 1) {
        return '1 minute ago';
      } else {
        return `${minutes} minutes ago`;
      }
    } else if (hours === 1) {
      return '1 hour ago';
    } else {
      return `${hours} hours ago`;
    }
  } else if (days === 1) {
    return 'yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else if (days < 14) {
    return '1 week ago';
  } else if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} weeks ago`;
  } else if (days < 365) {
    const months = Math.floor(days / 30);
    if (months === 1) {
      return '1 month ago';
    } else {
      return `${months} months ago`;
    }
  } else {
    const years = Math.floor(days / 365);
    if (years === 1) {
      return '1 year ago';
    } else {
      return `${years} years ago`;
    }
  }
}

// Test the complete fix
function testCompleteFix() {
  const projectDir = '/mnt/c/Users/muuko/.claude/projects/C--Users-muuko-Desktop-yurucode';
  const sessionFiles = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl')).slice(0, 10);
  
  console.log('=== TESTING COMPLETE FIX ===\n');
  console.log(`Testing ${sessionFiles.length} sessions...\n`);
  
  const results = [];
  
  for (const sessionFile of sessionFiles) {
    const sessionPath = path.join(projectDir, sessionFile);
    const sessionId = sessionFile.replace('.jsonl', '');
    
    console.log(`\nProcessing: ${sessionId}`);
    const result = parseSessionSummary(sessionPath, sessionId);
    
    if (result) {
      const relativeTime = getRelativeTime(result.timestamp);
      console.log(`  Summary: "${result.summary}"`);
      console.log(`  Time: ${relativeTime} (${new Date(result.timestamp).toISOString()})`);
      console.log(`  Messages: ${result.messageCount}`);
      results.push({...result, relativeTime});
    }
  }
  
  // Sort by timestamp (newest first)
  results.sort((a, b) => b.timestamp - a.timestamp);
  
  console.log('\n=== FINAL RESULTS (sorted by date) ===\n');
  for (const result of results) {
    console.log(`[${result.relativeTime}] ${result.summary}`);
  }
}

// Run the test
testCompleteFix();
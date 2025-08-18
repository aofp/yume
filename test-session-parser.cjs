#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Test session parsing logic
function testSessionParsing() {
  const testSessionPath = '/mnt/c/Users/muuko/.claude/projects/C--Users-muuko-Desktop-yurucode/0206fa45-06e4-4082-b66c-faeab0693cf0.jsonl';
  
  console.log('=== TESTING SESSION PARSING ===');
  console.log('Test file:', testSessionPath);
  console.log('');
  
  // Read the actual session file
  const content = fs.readFileSync(testSessionPath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  
  console.log(`File has ${lines.length} lines`);
  console.log('');
  
  // Parse first 10 lines to understand structure
  console.log('=== ANALYZING FIRST 10 LINES ===');
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    try {
      const data = JSON.parse(lines[i]);
      console.log(`Line ${i + 1}:`);
      console.log(`  Type: ${data.type}`);
      console.log(`  Timestamp: ${data.timestamp}`);
      
      if (data.type === 'user' && data.message) {
        // Extract user message content
        let content = data.message.content;
        let text = '';
        
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          // Find text content
          const textBlock = content.find(c => c.type === 'text');
          if (textBlock) {
            text = textBlock.text;
          }
        }
        
        if (text) {
          // Clean up text
          text = text.replace(/\[Attached text\][\s:]*/g, '');
          text = text.replace(/\\n/g, ' ');
          text = text.trim();
          
          console.log(`  User message: "${text.substring(0, 60)}..."`);
        }
      }
      
      if (data.summary) {
        console.log(`  SUMMARY FOUND: "${data.summary}"`);
      }
      
      console.log('');
    } catch (e) {
      console.log(`Line ${i + 1}: Parse error - ${e.message}`);
    }
  }
  
  // Look for Claude-generated summaries
  console.log('=== SEARCHING FOR SUMMARIES ===');
  let summaryFound = false;
  for (let i = 0; i < lines.length; i++) {
    try {
      const data = JSON.parse(lines[i]);
      if (data.summary) {
        console.log(`Found summary at line ${i + 1}: "${data.summary}"`);
        summaryFound = true;
        break;
      }
    } catch {}
  }
  
  if (!summaryFound) {
    console.log('No Claude summary found in file');
  }
  
  // Test timestamp calculation
  console.log('\n=== TESTING TIMESTAMP CALCULATION ===');
  
  // Get last timestamp
  let lastTimestamp = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(lines[i]);
      if (data.timestamp) {
        lastTimestamp = new Date(data.timestamp);
        console.log(`Last timestamp: ${data.timestamp}`);
        break;
      }
    } catch {}
  }
  
  if (lastTimestamp) {
    const now = new Date('2025-08-17T14:38:00Z'); // Current time from logs
    const diff = now - lastTimestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    console.log(`Time difference: ${days} days, ${hours} hours`);
    console.log(`Should show as: "${getRelativeTime(lastTimestamp, now)}"`);
  }
}

function getRelativeTime(date, now) {
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 7) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  } else if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else {
    return 'just now';
  }
}

// Run the test
testSessionParsing();
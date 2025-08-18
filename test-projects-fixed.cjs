#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('=== TESTING FIXED WSL PROJECTS LOADING ===\n');

try {
  // First, find the WSL user
  let wslUser = 'yuru'; // Default user
  try {
    wslUser = execSync('C:\\Windows\\System32\\wsl.exe whoami', {
      encoding: 'utf8',
      windowsHide: true
    }).trim();
    console.log(`WSL User: ${wslUser}`);
  } catch (e) {
    console.log('Using default WSL user: yuru');
  }
  
  const claudeProjectsDir = `/home/${wslUser}/.claude/projects`;
  console.log(`Projects directory: ${claudeProjectsDir}\n`);
  
  // List all project directories
  let projectDirs = [];
  try {
    const dirList = execSync(`C:\\Windows\\System32\\wsl.exe ls -1 ${claudeProjectsDir} 2>/dev/null`, {
      encoding: 'utf8',
      windowsHide: true
    }).trim();
    
    if (dirList) {
      projectDirs = dirList.split('\n').filter(dir => dir && !dir.startsWith('.'));
    }
    console.log(`Found ${projectDirs.length} projects:`, projectDirs);
  } catch (e) {
    console.log('No projects found in WSL');
    process.exit(0);
  }
  
  // Build projects array
  const projects = [];
  
  for (const projectName of projectDirs) {
    console.log(`\nProcessing project: ${projectName}`);
    const projectPath = `${claudeProjectsDir}/${projectName}`;
    
    // Get session files for this project
    let sessionFiles = [];
    try {
      const sessionList = execSync(`C:\\Windows\\System32\\wsl.exe find ${projectPath} -name "*.jsonl" -type f -exec basename {} .jsonl \\; 2>/dev/null`, {
        encoding: 'utf8',
        windowsHide: true
      }).trim();
      
      if (sessionList) {
        sessionFiles = sessionList.split('\n').filter(f => f);
      }
      console.log(`  Found ${sessionFiles.length} sessions`);
    } catch (e) {
      console.log('  No sessions in this project');
      continue;
    }
    
    const sessions = [];
    for (const sessionId of sessionFiles.slice(0, 3)) { // Only process first 3 sessions for testing
      const sessionPath = `${projectPath}/${sessionId}.jsonl`;
      console.log(`    Processing session: ${sessionId}`);
      
      // Get session details
      let summary = 'untitled session';
      let messageCount = 0;
      let timestamp = Date.now();
      
      try {
        // Get line count
        const lineCount = execSync(`C:\\Windows\\System32\\wsl.exe wc -l < ${sessionPath}`, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        messageCount = parseInt(lineCount) || 0;
        console.log(`      Message count: ${messageCount}`);
        
        // Get first line for summary  
        const firstLine = execSync(`C:\\Windows\\System32\\wsl.exe head -n1 ${sessionPath}`, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        if (firstLine) {
          try {
            const data = JSON.parse(firstLine);
            if (data.summary) {
              summary = data.summary;
            } else if (data.role === 'user' && data.content) {
              summary = data.content.slice(0, 50);
              if (data.content.length > 50) summary += '...';
            }
            console.log(`      Summary: ${summary.slice(0, 50)}...`);
          } catch (e) {
            console.log('      Could not parse JSON');
          }
        }
        
        // Get modification time
        const modTime = execSync(`C:\\Windows\\System32\\wsl.exe stat -c %Y ${sessionPath}`, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        timestamp = parseInt(modTime) * 1000 || Date.now();
        console.log(`      Modified: ${new Date(timestamp).toISOString()}`);
        
      } catch (e) {
        console.log(`      Error getting details: ${e.message}`);
      }
      
      sessions.push({
        id: sessionId,
        summary,
        messageCount,
        timestamp,
        createdAt: timestamp,
        path: sessionPath
      });
    }
    
    if (sessions.length > 0) {
      // Sort sessions by timestamp
      sessions.sort((a, b) => b.timestamp - a.timestamp);
      
      projects.push({
        name: projectName,
        path: projectName,
        sessions,
        lastModified: sessions[0].timestamp,
        createdAt: Math.min(...sessions.map(s => s.timestamp)),
        sessionCount: sessionFiles.length, // Use total count
        totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0)
      });
    }
  }
  
  // Sort projects by last modified
  projects.sort((a, b) => b.lastModified - a.lastModified);
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`✅ Loaded ${projects.length} projects from WSL`);
  
  for (const project of projects) {
    console.log(`\nProject: ${project.name}`);
    console.log(`  Sessions: ${project.sessionCount}`);
    console.log(`  Total messages: ${project.totalMessages}`);
    console.log(`  Last modified: ${new Date(project.lastModified).toISOString()}`);
  }
  
} catch (error) {
  console.error('❌ ERROR:', error.message);
  if (error.stdout) {
    console.error('Stdout:', error.stdout.toString());
  }
  if (error.stderr) {
    console.error('Stderr:', error.stderr.toString());
  }
}
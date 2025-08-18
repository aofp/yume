#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('=== TESTING WSL PROJECTS LOADING ===\n');

// Test the exact script that will be used
const wslScript = `
  projects_dir="/home/*/.claude/projects"
  echo '{"projects":['
  first=true
  for project_path in $projects_dir/*; do
    if [ -d "$project_path" ]; then
      project_name=$(basename "$project_path")
      if [ "$first" = false ]; then echo ','; fi
      first=false
      echo -n '{"name":"'$project_name'","sessions":['
      session_first=true
      for session_file in "$project_path"/*.jsonl; do
        if [ -f "$session_file" ]; then
          if [ "$session_first" = false ]; then echo -n ','; fi
          session_first=false
          session_id=$(basename "$session_file" .jsonl)
          # Get first line for summary
          first_line=$(head -n1 "$session_file" 2>/dev/null || echo '{}')
          summary=$(echo "$first_line" | grep -o '"summary":"[^"]*"' | cut -d'"' -f4 || echo "untitled")
          # Get line count for message count
          msg_count=$(wc -l < "$session_file" 2>/dev/null || echo 0)
          # Get modification time
          mod_time=$(stat -c %Y "$session_file" 2>/dev/null || echo 0)
          echo -n '{"id":"'$session_id'","summary":"'$summary'","messageCount":'$msg_count',"timestamp":'$mod_time'000}'
        fi
      done
      echo -n ']}'
    fi
  done
  echo ']}'
`.replace(/\n\s+/g, ' ').trim();

try {
  console.log('Running WSL command...\n');
  
  const output = execSync(`wsl.exe -e bash -c "${wslScript}"`, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10 // 10MB buffer
  });
  
  console.log('Raw output:', output);
  console.log('\n---\n');
  
  const data = JSON.parse(output);
  
  console.log('Parsed projects:', JSON.stringify(data, null, 2));
  console.log('\n---\n');
  
  // Process like the server does
  const projects = data.projects.map(project => {
    if (project.sessions && project.sessions.length > 0) {
      project.sessions.sort((a, b) => b.timestamp - a.timestamp);
      project.lastModified = project.sessions[0].timestamp;
      project.sessionCount = project.sessions.length;
      project.totalMessages = project.sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0);
    } else {
      project.lastModified = Date.now();
      project.sessionCount = 0;
      project.totalMessages = 0;
    }
    project.path = project.name;
    return project;
  });
  
  projects.sort((a, b) => b.lastModified - a.lastModified);
  
  console.log(`✅ SUCCESS! Loaded ${projects.length} projects from WSL`);
  console.log('Projects:', projects.map(p => `${p.name} (${p.sessionCount} sessions)`).join(', '));
  
} catch (error) {
  console.error('❌ ERROR:', error.message);
  if (error.output) {
    console.error('Output:', error.output.toString());
  }
}
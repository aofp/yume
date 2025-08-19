const { spawn } = require('child_process');

const wslPath = 'C:\\Windows\\System32\\wsl.exe';
const script = "cd '/mnt/c/Users/muuko/Desktop/yurucode' && printf '%s\\n' 'echo test' | /home/yuru/.claude/local/node_modules/.bin/claude --print --output-format stream-json --verbose --dangerously-skip-permissions --model claude-sonnet-4-20250514 2>&1";

console.log('Testing WSL spawn with script:', script);

const proc = spawn(wslPath, ['-e', 'bash', '-c', script], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true
});

let stdout = '';
let stderr = '';

proc.stdout.on('data', (data) => {
  stdout += data.toString();
  console.log('STDOUT:', data.toString());
});

proc.stderr.on('data', (data) => {
  stderr += data.toString();
  console.log('STDERR:', data.toString());
});

proc.on('close', (code) => {
  console.log('Process exited with code:', code);
  console.log('Total stdout length:', stdout.length);
  console.log('Total stderr length:', stderr.length);
  if (stdout.length === 0) {
    console.log('NO OUTPUT RECEIVED!');
  }
});

proc.on('error', (err) => {
  console.error('Process error:', err);
});

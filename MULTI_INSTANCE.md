# multi-instance support for yurucode

## overview
yurucode now supports running multiple independent instances simultaneously. each instance:
- runs its own claude server on a dynamic port
- maintains separate sessions and chat histories
- operates completely independently

## how it works

### 1. dynamic port allocation
- `server-claude-multi.js` uses `portfinder` to find available ports
- starts from port 3001 and increments until finding a free port
- writes port info to temp file for electron discovery

### 2. client discovery
- client checks multiple ports (3001-3005) for running servers
- connects to first available server it finds
- falls back to default port 3001 if none found

### 3. instance isolation
- each instance has its own:
  - server process
  - port allocation
  - session storage
  - claude cli processes
  - websocket connections

## running multiple instances

### method 1: batch script (recommended)
```batch
start-multi-instance.bat
```
- prompts for number of instances (1-5)
- starts each in its own console window
- automatically handles port allocation

### method 2: vbs script (silent)
```vbs
yurucode-multi-instance.vbs
```
- gui prompt for number of instances
- starts instances with visible consoles
- shows summary of ports used

### method 3: manual
open multiple terminals and run:
```bash
# terminal 1
set CLAUDE_SERVER_PORT=3001
npm run start:multi

# terminal 2  
set CLAUDE_SERVER_PORT=3002
npm run start:multi

# terminal 3
set CLAUDE_SERVER_PORT=3003
npm run start:multi
```

## port allocation

default port ranges:
- claude servers: 3001-3005
- vite dev servers: 5173-5177
- electron apps: connect to discovered ports

## benefits

1. **parallel workflows** - work on multiple projects simultaneously
2. **isolated contexts** - each instance maintains its own claude session
3. **no conflicts** - automatic port discovery prevents collisions
4. **easy scaling** - start as many instances as needed

## limitations

- each instance consumes memory (~200-300mb)
- claude api rate limits still apply globally
- recommended maximum: 5 concurrent instances

## troubleshooting

### instances not starting
- check if ports 3001-3005 are available
- ensure node.js and npm are in path
- verify claude cli is installed

### connection issues
- server logs show actual port used
- check windows firewall for localhost access
- try restarting with fresh ports

### performance
- close unused instances to free memory
- each claude process is independent
- system resources are the only limit

## technical details

### server changes
- `server-claude-multi.js` replaces `server-claude-direct.js`
- uses `portfinder` npm package for port discovery
- writes port info to `%TEMP%/yurucode-port-{pid}.json`

### client changes  
- `claudeCodeClient.ts` checks multiple ports on startup
- connects to first available server
- retries with exponential backoff

### electron changes
- can read port from temp file (not yet implemented)
- passes port to renderer via ipc (planned)

## future improvements

- [ ] electron ipc for port discovery
- [ ] instance manager ui
- [ ] shared settings across instances
- [ ] instance naming and workspace association
- [ ] automatic instance recycling
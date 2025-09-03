# System Prompt Configuration - Implementation Plan

## Overview
Add configurable system prompt option to yurucode that appends to all Claude CLI calls across macOS, Windows native, and WSL environments.

## Default System Prompt
```
--append-system-prompt 'CRITICAL: you are in yurucode ui. ALWAYS: use all lowercase (no capitals ever), be extremely concise, never use formal language, no greetings/pleasantries, straight to the point, code/variables keep proper case, one line answers preferred. !!YOU MUST PLAN FIRST use THINK and TODO as MUCH AS POSSIBLE to break down everything, including planning into multiple steps and do edits in small chunks!!'
```

## UI Design

### Settings Modal Integration
- **Location**: After "claude cli" option in settings modal
- **Style**: Match claude-selector button exactly
- **Label**: "system prompt"
- **Button Text**: Show status like "custom" or "default" 
- **Version**: Could show truncated prompt or character count

### System Prompt Modal
- **Title**: "system prompt configuration"
- **Layout**:
  - Toggle: "use custom system prompt" (default: ON)
  - Textarea: Full prompt editor with syntax highlighting
  - Presets dropdown: Quick select common prompts
  - Preview: Show how it will be passed to CLI
  - Reset to default button
  - Character count indicator

## Component Structure

### New Components
1. `SystemPromptSelector.tsx` - Button in settings modal
2. `SystemPromptModal.tsx` - Configuration modal
3. `SystemPromptSelector.css` - Styling to match claude selector

### Storage Structure
```typescript
interface SystemPromptSettings {
  enabled: boolean;
  mode: 'default' | 'custom' | 'preset';
  customPrompt: string;
  selectedPreset?: string;
}
```

## Implementation Locations

### 1. Embedded Server (logged_server.rs)
**Lines ~3400-3500** - Where Claude CLI is spawned
- Add system prompt to args array
- Make it conditional based on settings
- Handle Windows vs macOS differences

### 2. Settings Storage
- Use localStorage key: `system_prompt_settings`
- Default to yurucode prompt if not set
- Validate prompt before saving

### 3. Claude Spawning Files
- **macOS**: Direct CLI spawn in logged_server.rs
- **Windows Native**: Same location, different path handling
- **WSL**: Special handling for WSL mount paths

## Code Modifications Required

### 1. Settings Modal (`SettingsModalTabbed.tsx`)
```typescript
// After claude cli option
<SystemPromptSelector />
```

### 2. Embedded Server (`logged_server.rs`)
```javascript
// Around line 3400 where args are built
const systemPromptSettings = loadSystemPromptSettings();
if (systemPromptSettings.enabled) {
  args.push('--append-system-prompt');
  args.push(systemPromptSettings.prompt);
}
```

### 3. System Prompt Service
```typescript
// New file: systemPromptService.ts
export const systemPromptService = {
  getDefault(): string { /* default prompt */ },
  getCurrent(): SystemPromptSettings { /* from localStorage */ },
  save(settings: SystemPromptSettings): void { /* to localStorage */ },
  getPresets(): Record<string, string> { /* preset prompts */ }
};
```

## Preset Prompts

### Default (yurucode)
Minimal, concise, planning-focused

### Verbose
Detailed explanations, step-by-step reasoning

### Educational
Teaching mode with examples and explanations

### Speed Coding
Ultra-minimal, code-only responses

### Debug Mode
Verbose logging, detailed error analysis

## Platform-Specific Considerations

### macOS
- Direct CLI invocation
- Simple string passing
- No special escaping needed

### Windows Native
- PowerShell escaping requirements
- Handle spaces in paths
- Quote handling differences

### WSL
- Unix-style escaping
- Path translation not needed for args
- Same as macOS for string handling

## Testing Checklist
- [ ] Default prompt works on all platforms
- [ ] Custom prompt with special characters
- [ ] Empty prompt handling
- [ ] Very long prompts (>1000 chars)
- [ ] Prompt with quotes and escapes
- [ ] Settings persistence across restarts
- [ ] Modal UI responsiveness
- [ ] Preset switching
- [ ] Reset to default functionality

## Migration Path
1. On first load, check for existing settings
2. If none, use default yurucode prompt
3. Show indicator in UI when custom prompt active
4. Allow disable to use no system prompt

## Security Considerations
- Sanitize prompt before passing to CLI
- Prevent injection attacks
- Limit prompt length (e.g., 2000 chars)
- Validate against malicious patterns

## Future Enhancements
- Per-project system prompts
- Dynamic prompts based on file type
- Template variables ({{project_name}}, {{language}})
- Import/export prompt collections
- Share prompts with team
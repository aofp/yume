# PRD: Enhanced Settings with Tabs

## Overview
Enhance the settings modal with tabbed interface to organize features, matching Claudia's organization while maintaining yurucode's minimal aesthetic.

## Goals
- Organize settings into logical tabs
- Add hooks configuration
- Add commands management
- Add storage/database controls
- Maintain minimal black OLED UI

## Tab Structure

### 1. General Tab (Existing)
- Model selection
- Font preferences
- Theme settings
- Auto-save options
- Session defaults

### 2. Hooks Tab (New)
- Pre-prompt hooks
- Post-response hooks
- Tool execution hooks
- Error handling hooks
- Custom scripts

### 3. Commands Tab (New)
- Slash command configuration
- Custom command creation
- Keyboard shortcuts
- Command aliases
- Import/export commands

### 4. Storage Tab (New)
- Database location
- Clear conversation history
- Reset database
- Export data
- Import sessions
- Storage statistics
- Cleanup settings

### 5. Advanced Tab (New)
- Debug logging
- Performance monitoring
- API endpoints
- Proxy settings
- Experimental features

## UI Design

### Tab Navigation
```css
/* Minimal tab design */
.settings-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #222;
  margin-bottom: 16px;
}

.settings-tab {
  padding: 8px 16px;
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
}

.settings-tab.active {
  color: var(--accent-color);
  border-bottom-color: var(--accent-color);
}
```

### Storage Tab Features

#### Clear History
- Confirmation dialog
- Options: All/Current Session/Date Range
- Progress indicator
- Success notification

#### Reset Database
- Warning dialog (destructive action)
- Backup option before reset
- Complete wipe and reinitialize
- Restart required notification

#### Storage Stats
- Database size
- Number of sessions
- Number of messages
- Number of checkpoints
- Oldest/newest session dates

### Hooks Configuration

#### Hook Types
```typescript
interface Hook {
  id: string;
  name: string;
  type: 'pre-prompt' | 'post-response' | 'tool-execution' | 'error';
  enabled: boolean;
  script: string;
  config: Record<string, any>;
}
```

#### Built-in Hooks
- Auto-save on response
- Token limit warning
- Cost notification
- Error retry
- Session backup

### Commands Configuration

#### Command Structure
```typescript
interface Command {
  id: string;
  trigger: string; // e.g., "/clear"
  description: string;
  action: 'built-in' | 'custom-script';
  script?: string;
  shortcut?: string;
}
```

## Implementation Plan

### Phase 1: Tab Infrastructure
1. Create tab component
2. Update SettingsModal structure
3. Add tab navigation logic
4. Maintain existing General tab

### Phase 2: Storage Tab
1. Implement clear history
2. Add reset database
3. Show storage statistics
4. Add import/export

### Phase 3: Hooks Tab
1. Create hook editor
2. Add hook templates
3. Implement hook execution
4. Add validation

### Phase 4: Commands Tab
1. List existing commands
2. Add command editor
3. Implement custom commands
4. Add import/export

## Success Metrics
- Settings load time <100ms
- All actions complete <2s
- Zero data loss on reset
- 95% success rate for operations

## Testing Requirements
- Tab navigation works smoothly
- All destructive actions have confirmations
- Cross-platform compatibility
- Settings persist across restarts
- No performance impact on main app
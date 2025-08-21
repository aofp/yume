# yurucode diff display improvement prd

## problem statement
current edit tool responses lack sufficient context - no line numbers, no surrounding code lines, making it difficult to understand what changed and where. need a minimal diff view that shows:
- line numbers
- surrounding context lines  
- clear visual indication of changes
- total diff view similar to git diff

## design principles
- ultra-minimal aesthetic matching yurucode's black oled theme
- pastel cyan/magenta/grey accents only
- no unnecessary decorations or borders
- focus on readability and clarity
- lightweight implementation without heavy dependencies

## proposed solution

### diff display format
```
file: src/renderer/components/Chat/MessageRenderer.tsx
───────────────────────────────────────────────────────
  142 │   const handleStreamingMessage = () => {
  143 │     console.log('handling stream');
- 144 │     const oldImplementation = true;
+ 144 │     const newImplementation = false;
  145 │     return processStream();
  146 │   };
───────────────────────────────────────────────────────
```

### key features
1. **line numbers**: left-aligned, subtle grey color (#666)
2. **context lines**: 2-3 lines before/after changes (configurable)
3. **change indicators**: 
   - `-` for removed lines (subtle red/magenta tint)
   - `+` for added lines (subtle green/cyan tint)
   - ` ` for context lines (default grey)
4. **file header**: shows relative file path
5. **separator lines**: minimal dividers using box-drawing chars

### implementation approach

#### 1. diff data structure
```typescript
interface DiffDisplay {
  file: string;
  hunks: DiffHunk[];
}

interface DiffHunk {
  startLine: number;
  endLine: number;
  lines: DiffLine[];
}

interface DiffLine {
  lineNumber: number;
  type: 'add' | 'remove' | 'context';
  content: string;
}
```

#### 2. diff generation
- capture original content before edit
- apply edit operation
- generate unified diff with context
- parse into structured format for display

#### 3. display component
```typescript
// new component: DiffViewer.tsx
const DiffViewer: React.FC<{ diff: DiffDisplay }> = ({ diff }) => {
  return (
    <div className="diff-container">
      <div className="diff-header">{diff.file}</div>
      <div className="diff-separator">───</div>
      {diff.hunks.map(hunk => (
        <div className="diff-hunk">
          {hunk.lines.map(line => (
            <div className={`diff-line diff-${line.type}`}>
              <span className="line-number">{line.lineNumber}</span>
              <span className="line-marker">{getMarker(line.type)}</span>
              <span className="line-content">{line.content}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="diff-separator">───</div>
    </div>
  );
};
```

#### 4. styling
```css
.diff-container {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  background: #000;
  padding: 8px;
  margin: 8px 0;
}

.diff-header {
  color: #666;
  font-size: 11px;
  margin-bottom: 4px;
}

.diff-separator {
  color: #333;
  overflow: hidden;
  white-space: nowrap;
}

.diff-line {
  display: flex;
  line-height: 1.4;
}

.line-number {
  color: #444;
  min-width: 40px;
  text-align: right;
  padding-right: 8px;
  user-select: none;
}

.line-marker {
  color: #666;
  width: 12px;
  text-align: center;
}

.diff-add .line-marker { color: #0ff; }
.diff-remove .line-marker { color: #f0f; }

.line-content {
  flex: 1;
  white-space: pre;
  overflow-x: auto;
}

.diff-add .line-content { color: #0ff; opacity: 0.8; }
.diff-remove .line-content { color: #f0f; opacity: 0.8; }
.diff-context .line-content { color: #888; }
```

### integration points

1. **MessageRenderer.tsx**: 
   - detect edit operations in assistant messages
   - extract diff data from response
   - render DiffViewer component

2. **server (logged_server.rs embedded)**:
   - enhance edit response format
   - include original content for diff generation
   - add line number context

3. **claudeCodeStore.ts**:
   - store edit history for session
   - track file modifications

### minimal dependencies
- no external diff libraries initially
- use simple string comparison
- leverage existing syntax highlighting
- reuse existing monospace font

### phased implementation

**phase 1: basic diff display**
- line numbers
- add/remove indicators
- simple formatting

**phase 2: enhanced context**
- configurable context lines
- collapsible large diffs
- syntax highlighting integration

**phase 3: advanced features**
- side-by-side view option
- word-level diff highlighting
- multi-file diff support

## success metrics
- edit operations clearly show what changed
- users can quickly identify modification locations
- minimal performance impact
- maintains yurucode's aesthetic

## technical considerations
- diff generation should be fast (<50ms)
- support large files (>1000 lines)
- handle edge cases (empty files, binary files)
- preserve exact whitespace/indentation

## example scenarios

### single line change
```
file: src/stores/userStore.ts
───────────────────────────────────────
  23 │   const [user, setUser] = useState(null);
- 24 │   const [loading, setLoading] = useState(false);
+ 24 │   const [loading, setLoading] = useState(true);
  25 │   
───────────────────────────────────────
```

### multi-line addition
```
file: src/components/Header.tsx
───────────────────────────────────────
  10 │   return (
  11 │     <header className="header">
+ 12 │       <div className="logo">
+ 13 │         <img src="/logo.svg" alt="yurucode" />
+ 14 │       </div>
  15 │       <nav className="nav">
───────────────────────────────────────
```

### function replacement
```
file: src/utils/helpers.ts
───────────────────────────────────────
  45 │   
- 46 │   function processData(input: string): string {
- 47 │     return input.toUpperCase();
- 48 │   }
+ 46 │   function processData(input: string): string {
+ 47 │     const trimmed = input.trim();
+ 48 │     return trimmed.toLowerCase();
+ 49 │   }
  50 │   
───────────────────────────────────────
```

## implementation notes
- start with MessageRenderer.tsx modifications
- create standalone DiffViewer component
- test with real edit operations
- ensure compatibility with existing message flow
- maintain streaming performance

## references
- git diff unified format
- vscode diff editor
- github pull request diff view
- terminal-based diff tools (delta, diff-so-fancy)
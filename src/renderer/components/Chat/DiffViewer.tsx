import React from 'react';
import './DiffViewer.css';

export interface DiffLine {
  lineNumber?: number;
  type: 'add' | 'remove' | 'context';
  content: string;
}

export interface DiffHunk {
  startLine: number;
  endLine: number;
  lines: DiffLine[];
}

export interface DiffDisplay {
  file: string;
  hunks: DiffHunk[];
  oldContent?: string;
  newContent?: string;
}

interface DiffViewerProps {
  diff: DiffDisplay;
}

const getMarker = (type: 'add' | 'remove' | 'context'): string => {
  switch (type) {
    case 'add': return '+';
    case 'remove': return '-';
    case 'context': return ' ';
  }
};

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff }) => {
  const hunks = diff?.hunks ?? [];

  if (hunks.length === 0) {
    return null;
  }

  return (
    <>
    {diff.file && (
      <div className="diff-header">{diff.file}</div>
    )}
    <div className="diff-container">
      {hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex} className="diff-hunk">
          {hunk.lines.map((line, lineIndex) => (
            <div key={lineIndex} className={`diff-line diff-${line.type}`}>
              {line.lineNumber !== undefined && (
                <span className="line-number">
                  {String(line.lineNumber).padStart(4, ' ')}
                </span>
              )}
              <span className="line-marker">{getMarker(line.type)}</span>
              <span className="line-content">{line.content}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
    </>
  );
};

// Compute longest common subsequence for diff
const computeLCS = (oldLines: string[], newLines: string[]): number[][] => {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
};

// Backtrack LCS to generate diff operations
const backtrackDiff = (
  dp: number[][],
  oldLines: string[],
  newLines: string[],
  startLine: number
): DiffLine[] => {
  let i = oldLines.length;
  let j = newLines.length;

  // Collect operations in reverse order
  const ops: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      // Same line - context (use old line number for consistency)
      ops.push({
        type: 'context',
        content: oldLines[i - 1],
        lineNumber: startLine + i - 1
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Line added (no line number - it's new)
      ops.push({
        type: 'add',
        content: newLines[j - 1]
      });
      j--;
    } else if (i > 0) {
      // Line removed
      ops.push({
        type: 'remove',
        content: oldLines[i - 1],
        lineNumber: startLine + i - 1
      });
      i--;
    }
  }

  // Reverse to get correct order
  return ops.reverse();
};

export const generateDiff = (
  file: string,
  oldContent: string,
  newContent: string,
  startLine: number = 1 // 1-based line number where the content starts in the file
): DiffDisplay => {
  // Split content into lines
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Compute LCS-based diff
  const dp = computeLCS(oldLines, newLines);
  const diffLines = backtrackDiff(dp, oldLines, newLines, startLine);

  // Filter out pure context lines if content is identical
  const hasChanges = diffLines.some(l => l.type !== 'context');
  if (!hasChanges) {
    return { file, hunks: [], oldContent, newContent };
  }

  // Create hunk with all changes
  const hunk: DiffHunk = {
    startLine,
    endLine: startLine + Math.max(oldLines.length, newLines.length) - 1,
    lines: diffLines
  };

  return {
    file,
    hunks: [hunk],
    oldContent,
    newContent
  };
};
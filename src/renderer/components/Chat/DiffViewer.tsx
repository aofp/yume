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
  return (
    <div className="diff-container">
      {diff.hunks.map((hunk, hunkIndex) => (
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
  );
};

export const generateDiff = (
  file: string,
  oldContent: string,
  newContent: string,
  contextLines: number = 5
): DiffDisplay => {
  // Split content into lines
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  
  // Create a single hunk with all the changes
  const hunk: DiffHunk = {
    startLine: 1,
    endLine: Math.max(oldLines.length, newLines.length),
    lines: []
  };
  
  // Add all old lines as removals (no line numbers since we don't know them)
  oldLines.forEach((line) => {
    hunk.lines.push({
      type: 'remove',
      content: line
    });
  });
  
  // Add all new lines as additions (no line numbers since we don't know them)
  newLines.forEach((line) => {
    hunk.lines.push({
      type: 'add',
      content: line
    });
  });
  
  return {
    file,
    hunks: [hunk],
    oldContent,
    newContent
  };
};
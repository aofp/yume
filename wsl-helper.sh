#!/bin/bash
# WSL Helper Script for yurucode
# This script runs inside WSL to handle Claude operations

CLAUDE_DIR="$HOME/.claude/projects"

case "$1" in
  list-projects)
    # List all project directories
    if [ -d "$CLAUDE_DIR" ]; then
      cd "$CLAUDE_DIR" 2>/dev/null
      for dir in */; do
        [ -d "$dir" ] && echo "${dir%/}"
      done
    fi
    ;;
    
  get-sessions)
    # Get sessions for a specific project
    PROJECT="$2"
    if [ -z "$PROJECT" ]; then
      exit 1
    fi
    
    cd "$CLAUDE_DIR/$PROJECT" 2>/dev/null || exit 1
    
    # Get the 10 most recent sessions
    for file in $(ls -t *.jsonl 2>/dev/null | head -10); do
      if [ -f "$file" ]; then
        # Output format: filename|linecount|timestamp|firstline
        printf "%s|" "${file%.jsonl}"
        wc -l < "$file" | tr -d '\n'
        printf "|"
        stat -c %Y "$file" | tr -d '\n'
        printf "|"
        head -n1 "$file"
      fi
    done
    ;;
    
  get-all-projects)
    # Get all projects with their sessions in one go
    if [ -d "$CLAUDE_DIR" ]; then
      cd "$CLAUDE_DIR" 2>/dev/null
      
      for dir in */; do
        if [ -d "$dir" ]; then
          PROJECT="${dir%/}"
          # Skip invalid project names
          [ "$PROJECT" = "-" ] && continue
          [ -z "$PROJECT" ] && continue
          
          cd "$CLAUDE_DIR/$PROJECT" 2>/dev/null || continue
          
          # Check if there are any jsonl files
          count=$(ls *.jsonl 2>/dev/null | wc -l)
          [ "$count" -eq 0 ] && continue
          
          echo "PROJECT:$PROJECT"
          
          # Get up to 10 most recent sessions
          for file in $(ls -t *.jsonl 2>/dev/null | head -10); do
            if [ -f "$file" ]; then
              printf "SESSION:"
              printf "%s|" "${file%.jsonl}"
              wc -l < "$file" | tr -d '\n'
              printf "|"
              stat -c %Y "$file" | tr -d '\n'
              printf "|"
              head -n1 "$file"
            fi
          done
        fi
      done
    fi
    ;;
    
  *)
    echo "Usage: $0 {list-projects|get-sessions <project>|get-all-projects}"
    exit 1
    ;;
esac
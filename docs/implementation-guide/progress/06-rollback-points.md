# Rollback Points - Git Safety Checkpoints

## 🔄 Current Branch
**Branch**: main
**Starting Commit**: c860af3 (macos+)

## 📍 Checkpoint History

### Checkpoint 0 - Starting Point
**Date**: 2025-08-23
**Commit**: c860af3
**Description**: Initial state before migration
**Status**: Clean working directory except docs
**Modified Files** (not committed):
- M src-tauri/src/logged_server.rs
- M src/renderer/stores/claudeCodeStore.ts
- Untracked: docs/, claudia/, various .md files

**To Rollback**:
```bash
git stash  # Save current work
git checkout c860af3
```

---

## Checkpoint Template

```markdown
### Checkpoint [N] - [Description]
**Date**: [Date/Time]
**Commit**: [Git commit hash]
**Description**: [What was accomplished]
**Tests Passed**: [List of passing tests]

#### Files Changed
- [file1]: [brief description]
- [file2]: [brief description]

#### Rollback Commands
```bash
git stash  # If you have uncommitted changes
git checkout [commit-hash]
```

#### Verification After Rollback
- [ ] App compiles
- [ ] App starts
- [ ] Basic functionality works
```

---

## 🚨 Before Major Changes

Always create a checkpoint before:
1. Modifying `logged_server.rs` (embedded server)
2. Changing Tauri configuration
3. Removing Socket.IO
4. Adding new Rust modules
5. Modifying state management

---

## Git Commands Reference

### Create Checkpoint
```bash
git add -A
git commit -m "Checkpoint: [Description]"
git log --oneline -1  # Note the commit hash
```

### View History
```bash
git log --oneline -10  # Last 10 commits
git diff HEAD~1  # Changes in last commit
git status  # Current state
```

### Safe Rollback
```bash
git stash save "WIP: [Description]"  # Save current work
git checkout [commit-hash]  # Go to checkpoint
git stash list  # View saved work
git stash pop  # Restore saved work (if needed)
```

### Create Branch for Experiments
```bash
git checkout -b migration-experiment
# Do experimental work
git checkout main  # Return to main if experiment fails
git branch -D migration-experiment  # Delete failed experiment
```

---

## ⚠️ Critical Warning

**NEVER** use these commands:
- `git reset --hard` (loses uncommitted work)
- `git clean -fd` (deletes untracked files)
- `git push --force` (can break remote)

**ALWAYS**:
- Commit or stash before switching branches
- Test after creating checkpoint
- Document what each checkpoint contains

---

**Note**: Create checkpoints frequently. It's better to have too many than too few.
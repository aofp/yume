# Changelog

All notable changes to Yume will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-01-21

### Added
- Structured logging system with debug/info/warn/error levels for better debugging
- LocalStorageService abstraction for type-safe storage operations with built-in caching
- Error boundaries for all lazy-loaded components to prevent silent crashes
- Enhanced message hash validation for accurate deduplication during streaming

### Fixed
- Streaming state machine race conditions that caused UI inconsistencies
- Message deduplication logic for handling streaming chunks correctly
- localStorage write storms with improved debouncing strategy
- Memory leak prevention in MutationObserver and ResizeObserver cleanup

### Improved
- Type safety: Replaced 12+ `any` types in service and store files with proper TypeScript types
- Performance: Added memoization (useMemo/useCallback) to high-frequency render paths
- Code quality: Migrated 324+ console.log/warn/error calls to structured logger with context
  - Services directory: 25 files, ~270 console calls replaced
  - Components: 3 files, 54 console calls replaced (SettingsModalTabbed, CommandPalette, ClaudeChat)
  - Stores: licenseManager, conversationStore, modalService type improvements
- Debugging: Better error context and stack traces in production logs with structured logging
- Storage: Centralized localStorage access for easier maintenance and migration

### Technical
- Enhanced streaming state guards with mutex-like locks to prevent race conditions
- Optimized localStorage writes with 100ms debounce to reduce I/O overhead
- Added render performance profiling support via performance monitor
- Improved message hash algorithm with content validation and edge case handling

---

## [0.2.8] - 2026-01-XX

Previous releases (see git history for details).

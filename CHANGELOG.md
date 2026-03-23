# Changelog

All notable changes to `tabby-bianbu-mcp` will be documented in this file.

## [0.8.5] - 2026-03-23

### Fixed
- **Installer upload E2BIG**: switched `pushInstallerAndUpgrade` from `writeTextFile` (single 88KB JSON-RPC payload) to chunked upload (32KB chunks), fixing `spawn E2BIG` on repair/upgrade

## [0.8.4] - 2026-03-23

### Changed (Remote MCP Server v1.5.0)
- **PTY echo piggyback**: `write_pty_input` now waits up to 5ms for echo data and returns it in the response, saving a full RTT/2 for keystroke echo display
- script version bumped to 1.5.0, server version bumped to 1.5.0

### Fixed
- **PTY input batching reduced**: 16ms → 4ms, lowering first-keystroke latency
- **PTY write retry exemption**: `write_pty_input` no longer retries on transient 429/5xx, preventing 1-3s stalls during server load spikes

## [0.8.3] - 2026-03-23

### Fixed
- **PTY input latency**: all PTY calls (`write_pty_input`, `resize_pty`, `close_pty_session`) now bypass the interactive RequestLane — previously input keystrokes could queue behind file operations for hundreds of ms
- **resize debounce**: rapid resize events (dragging window edge) are debounced at 100ms and skip no-op same-size resizes

## [0.8.2] - 2026-03-23

### Fixed
- **PTY helper SIGCHLD race condition**: replaced `SIGCHLD` signal handler with non-blocking `waitpid(WNOHANG)` poll — `.bashrc` subprocesses (e.g. `dircolors`, `lesspipe`) were triggering SIGCHLD, setting `running=False`, and killing the PTY before bash was ready
- **PTY helper stdin EOF exit**: stdin EOF no longer terminates the helper; instead it stops watching stdin and lets master_fd drain until bash actually exits
- **PTY stderr visibility**: Python helper stderr is now forwarded to the terminal output as red diagnostic text instead of being silently discarded
- **select() timeout tuned**: changed from 50ms to 500ms to reduce CPU usage during idle PTY sessions

## [0.8.1] - 2026-03-23

### Fixed
- **PTY shell tab closing immediately**: removed `closed.next()` from poll loop on process exit — prevents Tabby from auto-closing the tab when the PTY process ends
- **PTY startup fallback**: if `open_pty_session` fails (e.g. python3 unavailable), automatically falls back to `BianbuShellSession` instead of leaving a dead tab
- **Server-side early crash detection**: `open_pty_session` now waits 200ms and checks if the PTY child is still alive before returning, giving a clear error instead of a silently dead session

## [0.8.0] - 2026-03-23

### Added (Remote MCP Server v1.4.0)
- **real PTY terminal sessions**: 5 new MCP tools (`open_pty_session`, `write_pty_input`, `read_pty_output`, `resize_pty`, `close_pty_session`) backed by a Python PTY helper using the standard library `pty` module — enables full interactive terminals (vim, htop, claude CLI, etc.)
- **long-polling output**: `read_pty_output` holds the request up to 5s (configurable `timeout_ms`) until data arrives, achieving near-instant output delivery with minimal request overhead (~0.2 req/s idle vs 20 req/s with short polling)
- **PTY session concurrency cap**: `MAX_PTY_SESSIONS` (default 4) limits simultaneous PTY sessions
- **`pty_session` capability flag** in health `supports` for client feature detection

### Changed (Remote MCP Server v1.4.0)
- script version bumped to 1.4.0, server version bumped to 1.4.0
- `gracefulShutdown` now cleans up PTY sessions
- idle session sweeper now covers PTY sessions

### Added (Plugin)
- **`BianbuPtySession`**: new session class extending Tabby's `BaseSession` with 16ms input batching, long-poll output loop, and automatic resize forwarding
- **PTY auto-detection**: shell tab checks remote `supports.ptySession` and automatically uses real PTY mode when available, falling back to the existing command-based `BianbuShellSession`
- **PTY lane bypass**: `readPtyOutputDirect()` calls `executeRequest` directly instead of going through the interactive RequestLane, preventing 5s long-polls from blocking other operations
- PTY capability indicator (`pty=✓/✗`) in the settings diagnostics panel

### Changed (Plugin)
- bundled remote installer updated to script v1.4.0 / server v1.4.0

## [0.7.0] - 2026-03-23

### Added (Remote MCP Server v1.3.0)
- **server-side rate limiting**: returns HTTP 429 with `Retry-After` header when concurrent requests exceed `MAX_CONCURRENT_REQUESTS` (default 32), enabling client-side adaptive throttling
- **session concurrency caps**: configurable limits for shell (`MAX_SHELL_SESSIONS=8`), upload (`MAX_UPLOAD_SESSIONS=16`), and download (`MAX_DOWNLOAD_SESSIONS=16`) sessions — prevents resource exhaustion under parallel transfers
- **ISO 8601 timestamps**: `list_directory`, `fileStat`, and all file operations now return ISO date strings (e.g. `2026-03-23T12:34:56.789Z`) instead of Unix epoch seconds — directly consumable by the client's `formatDate()`
- **enhanced health endpoint**: now reports `active_sessions` counts, `concurrency` stats (active/total/throttled requests), `uptime_seconds`, `memory` usage (RSS/heap), `node_version`, and `platform` info
- **graceful shutdown**: SIGINT/SIGTERM now drain active requests, clean up upload temp directories, and close the HTTP server cleanly before exit
- **`rate_limiting` and `iso_timestamps` capability flags** in health `supports` object for client feature detection

### Changed (Remote MCP Server v1.3.0)
- `logical_session_limits` in health response now reports actual configured caps instead of `null`
- `exec_shell_session` response now includes `session_cwd` for the client to track the working directory
- removed dead `registerStatefulSession()` function (was never called)
- script version bumped to 1.3.0, server version bumped to 1.3.0

### Changed (Plugin)
- bundled remote installer updated to script v1.3.0 / server v1.3.0

## [0.6.1] - 2026-03-23

### Fixed
- Angular JIT compilation error: moved arrow-function-based transfer status expression from pug template into `activeTransferLabel` getter to avoid `Bindings cannot contain assignments` parser error

## [0.6.0] - 2026-03-23

### Added
- **adaptive request throttling**: `RequestLane` now starts at zero cadence and auto-backs-off only when the server returns 429 / rate-limit errors, then gradually recovers to zero delay on success
- **concurrent file transfers**: up to 3 files now upload/download in parallel (configurable via `maxConcurrentFiles`)
- **enhanced shell line editor**: cursor movement (←→), command history (↑↓), Home/End, Delete key, Ctrl+A/E/U/K/W/L shortcuts
- **colorized shell output**: stderr renders in red, non-zero exit codes in yellow, prompt in bold blue
- **running indicator**: shell shows `⏳ Running...` during command execution
- **file manager sort**: click column headers (Name, Size, Modified, Type) to sort; folders always appear first
- **file manager multi-select**: Ctrl+Click to toggle, Shift+Click for range selection
- **file type icons**: emoji icons for 50+ file extensions (📁📜🐍📋📦🖼️🎵🎬 etc.)
- **formatted file sizes**: human-readable display (B, KB, MB, GB)
- **date column**: shows file modification timestamps
- **status bar**: shows item count, selection summary, and total size
- **detail pane toggle**: hide/show the preview panel to maximize file list space
- **URL domain input**: settings page now shows `https://` [domain] `/mcp` — user only needs to paste the domain

### Changed
- **upload chunk default**: 32 KiB → 64 KiB (halves HTTP round-trips)
- **download chunk default**: 128 KiB → 256 KiB
- **worker cadence default**: 100ms → 0ms (adaptive throttling handles rate-limiting)
- **download pipeline**: independent flusher coroutine eliminates head-of-line blocking where all workers stalled waiting for ordered disk writes
- **file manager UI**: complete redesign with Windows 11 Fluent-inspired dark theme (Mica-style backdrop, rounded corners, segmented toolbar, immersive layout)
- **settings page**: simplified from 6 cards to 3 focused sections; advanced settings in collapsible areas; MCP snippet now masks the API key
- **config field**: `url` replaced by `domain` — existing `url` values are auto-migrated on first load

### Removed
- `settings.enabled` config (removed in 0.5.4, cleanup completed)
- `minIntervalMs` config (replaced by adaptive cadence)

## [0.5.4] - 2026-03-23

### Fixed
- `private baseName()` made public so Angular AOT compilation can access it from templates
- `Ctrl+Shift+N` shortcut was unreachable because `Ctrl+N` handler fired first; reordered to check shift-modified combo first
- `RequestLane` workers now stop cleanly when the scheduler is reconfigured, preventing leaked infinite loops
- `cancelTransfer` now handles `queued` transfers in addition to `running` ones
- `super.onFrontendReady()` is now properly awaited in `BianbuCloudShellTabComponent`

### Removed
- dead `readFileAsBase64` method (was never called)
- dead `shellTab.component.pug` template (component uses `BaseTerminalTabComponent.template`)
- unused `minIntervalMs` config default (was never read)
- non-functional `settings.enabled` toggle (no code gated on it)

### Changed
- parallel chunked upload/download workers now use `offsets.shift()` instead of a shared mutable counter for clearer single-threaded safety

### Known security considerations
- API key (`X-API-KEY`) is transmitted in an HTTP header; when using plaintext `http://` URLs the key is sent unencrypted — users should prefer HTTPS endpoints
- `as_root=true` on any MCP tool bypasses `FILE_ROOT` path restrictions and executes commands via `sudo -n`
- the "Copyable MCP snippet" in settings exposes the real API key — avoid sharing it in bug reports
- `pug@2.x` has known prototype pollution advisories; it is used only at build time and does not affect runtime

## [0.5.3] - 2026-03-20

### Added
- downloadable local maintenance session logs with timestamps and stable session names
- downloadable remote maintenance logs that bundle the status file and remote installer log into one timestamped file

### Changed
- detached maintenance sessions now pass an explicit session name into `bianbu_agent_proxy.sh`
- remote installer logs now include UTC timestamps and the maintenance session name on every line

## [0.5.2] - 2026-03-20

### Fixed
- remote push-upgrade now launches through a completion status file and waits for the installer to actually finish instead of trusting the first recovered health response
- bundled `bianbu_agent_proxy.sh` now stages the next release before cutover and auto-rolls back to the previous install if activation fails, preventing half-upgraded broken remotes

## [0.5.1] - 2026-03-19

### Fixed
- remote installer bootstrap/upgrade now defines `MAX_REQUEST_BODY_MB` in the shell layer, fixing the `未绑定的变量` failure during `write_env`

## [0.5.0] - 2026-03-19

### Added
- 32-slot MCP request scheduler with 2 interactive lanes and up to 30 transfer lanes
- single-active-file queue so multiple file transfers run one file at a time
- explicit worker cadence setting for 100 ms dispatch cycles
- parallel offset-based chunk transfer support between the Tabby client and remote Bianbu MCP server

### Changed
- upload chunk default changed to 32 KiB
- download chunk default changed to 128 KiB
- downloads now stream into Tabby's native download sink instead of browser Blob URLs
- remote installer now raises the Express JSON body limit explicitly and reports parallel chunk capability in health

## [0.4.0] - 2026-03-19

### Added
- release asset sync pipeline for the remote installer script
- remote diagnostics and push-upgrade workflow from the settings page
- persistent MCP shell session support with fallback for older servers
- packaged remote installer metadata for version comparison and release verification
- node-based release tests and verification scripts
- remote backup restore command via `restore-latest`

### Changed
- file rename now prefers remote atomic rename support when available
- build pipeline now emits declaration files into `dist/`
- README expanded with release and remote maintenance guidance
- remote installer upgraded with richer health/version metadata, hash verification, safer backup behavior, and a secure default for passwordless sudo

# Tabby Bianbu MCP Commercial Release Hardening Plan

> For Hermes: execute this plan directly. Prioritize production-facing reliability, remote upgrade automation, release packaging, and verification.

Goal: ship a Tabby plugin and matching Bianbu Cloud remote installer workflow that can diagnose connectivity, push the latest remote script, execute upgrades automatically, and expose versioned health/status metadata suitable for commercial distribution.

Architecture: keep the existing Tabby plugin structure, but add a release asset pipeline for the remote installer, service-layer helpers for health/maintenance flows, and UI controls in settings for diagnostics and remote push-upgrade. On the remote side, add explicit version metadata, better tool coverage, and safer upgrade/backup behavior.

Tech Stack: TypeScript, Angular/Tabby plugin APIs, Node fs/path/crypto, webpack, bash, systemd, Node MCP server.

---

### Task 1: Add release asset pipeline for the remote installer

Objective: keep the Tabby package and the external installer script synchronized so the plugin can push the exact release installer to remote hosts.

Files:
- Create: `tabby-bianbu-mcp/scripts/sync-remote-assets.mjs`
- Create: `tabby-bianbu-mcp/assets/.gitkeep`
- Modify: `tabby-bianbu-mcp/package.json`
- Modify: `tabby-bianbu-mcp/README.md`

Implementation notes:
- Copy `../bianbu_agent_proxy.sh` into `assets/bianbu_agent_proxy.sh`.
- Compute SHA-256, size, and filename metadata into `assets/bianbu_agent_proxy.meta.json`.
- Expose npm scripts such as `sync:remote-assets`, `build`, `test`, and `verify`.
- Include `assets`, `README.md`, and `LICENSE` in the package files list.

Verification:
- `node scripts/sync-remote-assets.mjs`
- confirm both asset files exist and metadata reflects the current script hash.

### Task 2: Harden MCP service and add remote maintenance helpers

Objective: centralize health checks, remote version parsing, installer asset loading, and auto-upgrade orchestration.

Files:
- Create: `tabby-bianbu-mcp/src/remoteRelease.ts`
- Modify: `tabby-bianbu-mcp/src/mcp.service.ts`
- Modify: `tabby-bianbu-mcp/src/mcp.service.d.ts`

Implementation notes:
- Add `getHealth`, `openShellSession`, `execShellSession`, `closeShellSession`, `renamePath`, and remote-maintenance methods.
- Add installer asset loading from the packaged `assets` directory.
- Implement `pushInstallerAndUpgrade` that uploads the script, makes it executable, starts `up`/`repair`/`bootstrap` in background, and polls health until the endpoint returns.
- Normalize returned health/version fields so UI code stays simple.

Verification:
- add unit tests for asset metadata loading and response parsing.

### Task 3: Upgrade the shell experience to use persistent MCP shell sessions

Objective: remove fragile cwd guessing and use the server’s logical shell session tools.

Files:
- Modify: `tabby-bianbu-mcp/src/shellSession.ts`
- Modify: `tabby-bianbu-mcp/src/shellSession.d.ts`

Implementation notes:
- Open a shell session on connect.
- Use `exec_shell_session` for commands.
- Close the shell session on kill/dispose.
- Keep prompt/cwd state from structured server responses.

Verification:
- build the plugin and confirm types still compile.

### Task 4: Add commercial-grade diagnostics and remote upgrade UI

Objective: expose connection validation, remote version info, and push-upgrade controls from the settings page.

Files:
- Modify: `tabby-bianbu-mcp/src/configProvider.ts`
- Modify: `tabby-bianbu-mcp/src/settingsTab.component.ts`
- Modify: `tabby-bianbu-mcp/src/settingsTab.component.pug`
- Modify: `tabby-bianbu-mcp/src/README.md` if needed via root `README.md`

Implementation notes:
- Add config defaults for installer remote path, upgrade timeout, reconnect polling interval, and whether to run maintenance as root.
- Add buttons for test connection, fetch health, push upgrade, and repair.
- Surface current remote version, bundled installer version, last diagnostic time, and error messages.
- Prevent maintenance actions when required settings are missing.

Verification:
- build succeeds and UI template compiles.

### Task 5: Improve remote script for versioned health and safer upgrades

Objective: make the server self-describing and safer to upgrade in place.

Files:
- Modify: `bianbu_agent_proxy.sh`

Implementation notes:
- Add explicit script/server version constants.
- Add `rename_path` MCP tool registration.
- Return richer version/capability info from `health` and `/health`.
- Use Bianbu Cloud 云主机 wording in help text.
- Use `BACKUP_ROOT` to create timestamped backups before reinstall/overwrite.
- Add `version` command output for diagnostics.

Verification:
- local shell syntax check and Node runtime verification path remain green.

### Task 6: Add automated verification and release docs

Objective: make the repo publishable with repeatable checks.

Files:
- Create: `tabby-bianbu-mcp/tests/*.mjs`
- Create: `tabby-bianbu-mcp/LICENSE`
- Create: `tabby-bianbu-mcp/CHANGELOG.md`
- Modify: `tabby-bianbu-mcp/package.json`
- Modify: `tabby-bianbu-mcp/README.md`

Implementation notes:
- Add Node-based tests using `node --test`.
- Document the remote upgrade flow and release verification steps.
- Ensure all edited text files end with LF.

Verification:
- `npm test`
- `npm run build`
- `npm pack --dry-run`
- line-ending normalization check

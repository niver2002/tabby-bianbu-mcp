import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

export interface RemoteInstallerMetadata {
  bytes: number
  fileName: string
  generatedAt: string
  scriptVersion: string
  serverVersion: string
  sha256: string
  sourceFile: string
}

export interface RemoteInstallerAsset {
  metadata: RemoteInstallerMetadata
  script: string
}

export interface RemoteInstallerStatus {
  action: string | null
  exitCode: number | null
  finishedAt: string | null
  logPath: string | null
  ok: boolean
  raw: any
  sessionName: string | null
}

export interface RemoteHealthInfo {
  fileRoot: string | null
  hasSudo: boolean | null
  ok: boolean
  raw: any
  scriptVersion: string | null
  serverVersion: string | null
  supports: {
    chunkedTransfers: boolean
    parallelChunkOffsets: boolean
    renamePath: boolean
    shellSession: boolean
    rateLimiting: boolean
    isoTimestamps: boolean
    ptySession: boolean
  }
  tools: string[]
  transportMode: string | null
}

export function normalizeMcpUrl (value: string): string {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function validateConnectionSettings (settings: any): string[] {
  const errors: string[] = []
  if (!settings.domain) {
    errors.push('MCP domain is required')
  } else if (/^https?:\/\//i.test(settings.domain)) {
    errors.push('Domain should not include https:// prefix')
  }
  if (!String(settings?.apiKey || '').trim()) {
    errors.push('X-API-KEY is required')
  }
  return errors
}

export function shellQuote (value: string): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`
}

export function remoteDirName (remotePath: string): string {
  const normalized = String(remotePath || '.').replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  if (index < 0) {
    return '.'
  }
  return normalized.slice(0, index) || '/'
}

export function appendRemoteSuffix (remotePath: string, suffix: string): string {
  return `${String(remotePath || '.').replace(/\\/g, '/')}${suffix}`
}

export function remoteInstallerLogPath (remotePath: string): string {
  return appendRemoteSuffix(remotePath, '.log')
}

export function remoteInstallerStatusPath (remotePath: string): string {
  return appendRemoteSuffix(remotePath, '.status.json')
}

export function buildDetachedInstallerCommand (
  remotePath: string,
  action: 'bootstrap' | 'repair' | 'up',
  logPath = remoteInstallerLogPath(remotePath),
  statusPath = remoteInstallerStatusPath(remotePath),
  sessionName = `maintenance-${action}`,
): string {
  const targetDir = remoteDirName(remotePath)
  const detachedCommand = [
    `rm -f ${shellQuote(logPath)} ${shellQuote(statusPath)}`,
    `export SESSION_NAME=${shellQuote(sessionName)}`,
    `bash ${shellQuote(remotePath)} ${action} > ${shellQuote(logPath)} 2>&1`,
    '__bianbu_rc=$?',
    '__bianbu_ok=false',
    '[ "$__bianbu_rc" -eq 0 ] && __bianbu_ok=true',
    '__bianbu_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"',
    `printf '{"ok":%s,"exit_code":%s,"finished_at":"%s","action":"%s","log_path":"%s","session_name":"%s"}\\n' "$__bianbu_ok" "$__bianbu_rc" "$__bianbu_ts" ${shellQuote(action)} ${shellQuote(logPath)} ${shellQuote(sessionName)} > ${shellQuote(statusPath)}`,
  ].join('; ')
  // Use systemd-run to launch the installer in an independent scope.
  // nohup & inherits the parent cgroup, so when the installer runs
  // "systemctl stop bianbu-mcp-server", systemd kills everything in
  // the service cgroup — including the installer itself.
  // systemd-run --scope creates a separate transient unit.
  return [
    `mkdir -p ${shellQuote(targetDir)}`,
    `chmod 700 ${shellQuote(remotePath)}`,
    `systemd-run --scope --quiet bash -lc ${shellQuote(detachedCommand)} > /dev/null 2>&1 < /dev/null & printf '__BIANBU_UPGRADE_STARTED__%s\\n' "$!"`,
  ].join(' && ')
}

export function parseRemoteInstallerStatus (raw: any): RemoteInstallerStatus {
  const payload = typeof raw === 'string'
    ? JSON.parse(String(raw || '').trim() || '{}')
    : raw || {}
  const exitCodeValue = payload.exit_code ?? payload.exitCode
  const exitCode = exitCodeValue === undefined || exitCodeValue === null
    ? null
    : Number(exitCodeValue)
  const ok = typeof payload.ok === 'boolean'
    ? payload.ok
    : exitCode === 0

  return {
    ok,
    exitCode: Number.isFinite(exitCode as number) ? exitCode : null,
    finishedAt: payload.finished_at || payload.finishedAt || null,
    action: payload.action || null,
    logPath: payload.log_path || payload.logPath || null,
    sessionName: payload.session_name || payload.sessionName || null,
    raw: payload,
  }
}

function assetCandidates (moduleDir: string): string[] {
  return [
    path.resolve(moduleDir, '../assets'),
    path.resolve(moduleDir, '../../assets'),
    path.resolve(process.cwd(), 'assets'),
  ]
}

function sha256 (text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function loadBundledInstaller (moduleDir = __dirname): RemoteInstallerAsset {
  let lastError: Error | null = null
  for (const assetDir of assetCandidates(moduleDir)) {
    const scriptPath = path.join(assetDir, 'bianbu_agent_proxy.sh')
    const metadataPath = path.join(assetDir, 'bianbu_agent_proxy.meta.json')
    const hasScript = fs.existsSync(scriptPath)
    const hasMetadata = fs.existsSync(metadataPath)
    if (!hasScript && !hasMetadata) {
      continue
    }
    try {
      const script = fs.readFileSync(scriptPath, 'utf8')
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as RemoteInstallerMetadata
      if (!metadata?.sha256 || !metadata?.scriptVersion || !metadata?.serverVersion) {
        throw new Error(`Bundled installer metadata is incomplete at ${metadataPath}`)
      }
      const actualHash = sha256(script)
      if (actualHash !== metadata.sha256) {
        throw new Error(`Bundled installer SHA-256 mismatch for ${scriptPath}`)
      }
      return { script, metadata }
    } catch (error: any) {
      lastError = error
      break
    }
  }
  throw new Error(`Unable to load bundled remote installer assets: ${String(lastError?.message || lastError)}`)
}

export function parseRemoteHealth (raw: any): RemoteHealthInfo {
  const payload = raw?.structuredContent ?? raw?.result?.structuredContent ?? raw ?? {}
  const tools = Array.isArray(payload.tools)
    ? payload.tools.map((tool: any) => String(tool))
    : []
  const supports = {
    renamePath: Boolean(payload?.supports?.rename_path) || tools.includes('rename_path'),
    shellSession: Boolean(payload?.supports?.shell_session) || tools.includes('open_shell_session'),
    chunkedTransfers: Boolean(payload?.supports?.chunked_transfers) || (tools.includes('upload_chunked_begin') && tools.includes('download_chunked_begin')),
    parallelChunkOffsets: Boolean(payload?.supports?.parallel_chunk_offsets),
    rateLimiting: Boolean(payload?.supports?.rate_limiting),
    isoTimestamps: Boolean(payload?.supports?.iso_timestamps),
    ptySession: Boolean(payload?.supports?.pty_session) || tools.includes('open_pty_session'),
  }

  return {
    ok: payload.ok !== false,
    serverVersion: payload.server_version || payload.version || null,
    scriptVersion: payload.script_version || null,
    transportMode: payload.transport_mode || null,
    fileRoot: payload.file_root || null,
    hasSudo: typeof payload.has_sudo === 'boolean' ? payload.has_sudo : null,
    tools,
    supports,
    raw: payload,
  }
}

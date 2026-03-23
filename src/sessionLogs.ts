export type SessionLogLevel = 'info' | 'warn' | 'error'
export type SessionLogStatus = 'running' | 'done' | 'error'

export interface SessionLogEntry {
  details?: string | null
  level: SessionLogLevel
  message: string
  timestamp: string
}

export interface SessionLog {
  action: string
  asRoot?: boolean
  entries: SessionLogEntry[]
  error?: string | null
  finishedAt?: string | null
  kind: string
  remoteLogPath?: string | null
  remotePath?: string | null
  remoteStatusPath?: string | null
  sessionName: string
  startedAt: string
  status: SessionLogStatus
}

export interface SessionLogInit {
  action: string
  asRoot?: boolean
  kind: string
  remoteLogPath?: string | null
  remotePath?: string | null
  remoteStatusPath?: string | null
  sessionName: string
  startedAt?: string
}

export interface LogDownloadPayload {
  content: string
  fileName: string
}

export interface RemoteLogDownloadOptions {
  downloadedAt?: Date | string
  remoteLogText?: string | null
  remoteStatusText?: string | null
  session: SessionLog
}

function pad2 (value: number): string {
  return String(value).padStart(2, '0')
}

export function toIsoUtc (value: Date | string | undefined = new Date()): string {
  return new Date(value || Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function toCompactUtcStamp (value: Date | string | undefined = new Date()): string {
  const date = new Date(value || Date.now())
  return [
    String(date.getUTCFullYear()),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    'T',
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
    'Z',
  ].join('')
}

export function createSessionName (kind: string, action: string, value: Date | string | undefined = new Date()): string {
  return `${String(kind || 'session').trim()}-${String(action || 'run').trim()}-${toCompactUtcStamp(value)}`
}

export function createSessionLog (init: SessionLogInit): SessionLog {
  return {
    action: init.action,
    asRoot: init.asRoot,
    entries: [],
    kind: init.kind,
    remoteLogPath: init.remoteLogPath || null,
    remotePath: init.remotePath || null,
    remoteStatusPath: init.remoteStatusPath || null,
    sessionName: init.sessionName,
    startedAt: init.startedAt || toIsoUtc(),
    status: 'running',
  }
}

export function appendSessionLogEntry (session: SessionLog, entry: Omit<SessionLogEntry, 'timestamp'> & { timestamp?: string }): SessionLogEntry {
  const normalized: SessionLogEntry = {
    timestamp: entry.timestamp || toIsoUtc(),
    level: entry.level,
    message: entry.message,
    details: entry.details || null,
  }
  session.entries.push(normalized)
  return normalized
}

export function finishSessionLog (session: SessionLog, status: SessionLogStatus, value: Date | string | undefined = new Date(), error?: string | null): SessionLog {
  session.status = status
  session.finishedAt = toIsoUtc(value)
  session.error = error || null
  return session
}

function sanitizeFileNamePart (value: string): string {
  return String(value || 'session').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'session'
}

function formatEntry (sessionName: string, entry: SessionLogEntry): string {
  const lines = [`[${entry.timestamp}] [${sessionName}] [${entry.level.toUpperCase()}] ${entry.message}`]
  const details = String(entry.details || '').trim()
  if (details) {
    for (const line of details.split(/\r?\n/)) {
      lines.push(`  ${line}`)
    }
  }
  return lines.join('\n')
}

export function renderLocalSessionLog (session: SessionLog): string {
  const header = [
    '# bianbu local session log',
    `session_name=${session.sessionName}`,
    `kind=${session.kind}`,
    `action=${session.action}`,
    `status=${session.status}`,
    `started_at=${session.startedAt}`,
    `finished_at=${session.finishedAt || ''}`,
    `remote_path=${session.remotePath || ''}`,
    `remote_log_path=${session.remoteLogPath || ''}`,
    `remote_status_path=${session.remoteStatusPath || ''}`,
    `as_root=${session.asRoot === undefined ? '' : String(session.asRoot)}`,
    '',
    '--- local_log ---',
  ]
  const entries = session.entries.length
    ? session.entries.map(entry => formatEntry(session.sessionName, entry))
    : ['[no log entries recorded]']
  return `${header.join('\n')}\n${entries.join('\n')}\n`
}

export function buildLocalLogDownloadPayload (session: SessionLog, downloadedAt: Date | string | undefined = new Date()): LogDownloadPayload {
  return {
    fileName: `${sanitizeFileNamePart(session.sessionName)}-local-${toCompactUtcStamp(downloadedAt)}.log`,
    content: renderLocalSessionLog(session),
  }
}

export function buildRemoteLogDownloadPayload (options: RemoteLogDownloadOptions): LogDownloadPayload {
  const downloadedAt = toIsoUtc(options.downloadedAt)
  const statusText = String(options.remoteStatusText || '').trim() || '[remote status unavailable]'
  const remoteLogText = String(options.remoteLogText || '').trim() || '[remote log unavailable]'
  const session = options.session
  const content = [
    '# bianbu remote session log',
    `downloaded_at=${downloadedAt}`,
    `session_name=${session.sessionName}`,
    `kind=${session.kind}`,
    `action=${session.action}`,
    `status=${session.status}`,
    `started_at=${session.startedAt}`,
    `finished_at=${session.finishedAt || ''}`,
    `remote_path=${session.remotePath || ''}`,
    `remote_log_path=${session.remoteLogPath || ''}`,
    `remote_status_path=${session.remoteStatusPath || ''}`,
    '',
    '--- remote_status ---',
    statusText,
    '',
    '--- remote_log ---',
    remoteLogText,
    '',
  ].join('\n')

  return {
    fileName: `${sanitizeFileNamePart(session.sessionName)}-remote-${toCompactUtcStamp(options.downloadedAt)}.log`,
    content,
  }
}

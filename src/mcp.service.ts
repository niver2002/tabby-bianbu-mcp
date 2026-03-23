import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'
import {
  buildDetachedInstallerCommand,
  loadBundledInstaller,
  parseRemoteHealth,
  parseRemoteInstallerStatus,
  RemoteHealthInfo,
  RemoteInstallerAsset,
  RemoteInstallerStatus,
  remoteInstallerLogPath,
  remoteInstallerStatusPath,
  validateConnectionSettings,
} from './remoteRelease'
import {
  appendSessionLogEntry,
  buildLocalLogDownloadPayload,
  buildRemoteLogDownloadPayload,
  createSessionLog,
  createSessionName,
  finishSessionLog,
  LogDownloadPayload,
  SessionLog,
  SessionLogLevel,
} from './sessionLogs'

interface JsonRpcResponse {
  result?: any
  error?: { code?: number, message?: string }
}

interface WaitForHealthOptions {
  intervalMs: number
  timeoutMs: number
}

interface WaitForInstallerCompletionOptions {
  action: 'bootstrap' | 'repair' | 'up'
  asRoot: boolean
  expectedSessionName: string
  expectedScriptVersion: string
  expectedServerVersion: string
  intervalMs: number
  logPath: string
  onPoll?: (elapsed: number, timeout: number) => void
  session: SessionLog
  signal?: AbortSignal
  statusPath: string
  timeoutMs: number
}

export interface MaintenanceProgress {
  step: 'upload' | 'launch' | 'wait' | 'verify'
  stepIndex: number
  totalSteps: number
  label: string
  percent: number
  detail?: string
  error?: boolean
}

interface PushInstallerAndUpgradeOptions {
  action?: 'bootstrap' | 'repair' | 'up'
  asRoot?: boolean
  healthTimeoutMs?: number
  onProgress?: (p: MaintenanceProgress) => void
  reconnectPollMs?: number
  remotePath?: string
  signal?: AbortSignal
}

type LaneKind = 'interactive' | 'transfer'

interface LaneItem<T> {
  cleanup: () => void
  reject: (error: any) => void
  resolve: (value: T | PromiseLike<T>) => void
  run: () => Promise<T>
  signal?: AbortSignal
}

function makeAbortError (): Error {
  const error = new Error('Request aborted')
  ;(error as any).name = 'AbortError'
  return error
}

class RequestLane {
  private queue: LaneItem<any>[] = []
  private waiters: Array<(item: LaneItem<any>) => void> = []
  private started = false
  private stopped = false
  private currentCadenceMs: number

  constructor (
    private concurrency: number,
    private baseCadenceMs: number,
  ) {
    this.currentCadenceMs = baseCadenceMs
  }

  stop (): void {
    this.stopped = true
    const poison = { run: () => Promise.resolve(), resolve: () => undefined, reject: () => undefined, cleanup: () => undefined } as LaneItem<any>
    for (const waiter of this.waiters) {
      waiter(poison)
    }
    this.waiters.length = 0
  }

  enqueue<T> (run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(makeAbortError())
    }

    return new Promise<T>((resolve, reject) => {
      const item: LaneItem<T> = {
        run,
        resolve,
        reject,
        signal,
        cleanup: () => undefined,
      }

      if (signal) {
        const onAbort = (): void => {
          const index = this.queue.indexOf(item)
          if (index >= 0) {
            this.queue.splice(index, 1)
            item.cleanup()
            reject(makeAbortError())
          }
        }
        signal.addEventListener('abort', onAbort, { once: true })
        item.cleanup = () => signal.removeEventListener('abort', onAbort)
      }

      this.queue.push(item)
      this.dispatch()
      this.startWorkers()
    })
  }

  private startWorkers (): void {
    if (this.started) {
      return
    }
    this.started = true
    for (let i = 0; i < this.concurrency; i++) {
      void this.workerLoop()
    }
  }

  private dispatch (): void {
    while (this.queue.length && this.waiters.length) {
      const waiter = this.waiters.shift()
      const item = this.queue.shift()
      if (waiter && item) {
        waiter(item)
      }
    }
  }

  private async take (): Promise<LaneItem<any>> {
    if (this.queue.length) {
      return this.queue.shift() as LaneItem<any>
    }
    return new Promise(resolve => this.waiters.push(resolve))
  }

  notifyThrottled (): void {
    this.currentCadenceMs = Math.min(this.baseCadenceMs * 4 || 2000, Math.max(200, this.currentCadenceMs * 2))
  }

  notifySuccess (): void {
    this.currentCadenceMs = Math.max(0, this.currentCadenceMs - 10)
  }

  private async workerLoop (): Promise<void> {
    while (!this.stopped) {
      const item = await this.take()
      if (this.stopped) {
        return
      }
      if (item.signal?.aborted) {
        item.cleanup()
        item.reject(makeAbortError())
      } else {
        try {
          const result = await item.run()
          item.resolve(result)
          this.currentCadenceMs = Math.max(0, this.currentCadenceMs - 10)
        } catch (error: any) {
          item.reject(error)
          if (/429|too many/i.test(String(error?.message || ''))) {
            this.currentCadenceMs = Math.min(this.baseCadenceMs * 4 || 2000, Math.max(200, this.currentCadenceMs * 2))
          }
        } finally {
          item.cleanup()
        }
      }

      if (this.currentCadenceMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.currentCadenceMs))
      }
    }
  }
}

@Injectable()
export class BianbuMcpService {
  private bundledInstallerCache: RemoteInstallerAsset | null = null
  private interactiveLane = new RequestLane(2, 0)
  private latestMaintenanceSessionValue: SessionLog | null = null
  private transferLane = new RequestLane(30, 0)
  private schedulerKey = ''

  constructor (
    private config: ConfigService,
  ) { }

  get settings (): any {
    return this.config.store.bianbuMcp
  }

  get validationErrors (): string[] {
    return validateConnectionSettings(this.settings)
  }

  get bundledInstaller (): RemoteInstallerAsset {
    if (!this.bundledInstallerCache) {
      this.bundledInstallerCache = loadBundledInstaller(__dirname)
    }
    return this.bundledInstallerCache
  }

  get normalizedUrl (): string {
    const s = this.settings
    if (!s.domain) return ''
    const domain = String(s.domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/mcp\/?$/i, '').replace(/\/+$/, '')
    if (!domain) return ''
    return `https://${domain}/mcp`
  }

  get latestMaintenanceSession (): SessionLog | null {
    return this.latestMaintenanceSessionValue
  }

  private ensureScheduler (): void {
    const interactiveConcurrency = Math.max(1, Number(this.settings.interactiveConcurrency ?? 2))
    const transferConcurrency = Math.max(1, Number(this.settings.transferConcurrency ?? 30))
    const workerCadenceMs = Math.max(0, Number(this.settings.workerCadenceMs ?? 0))
    const nextKey = `${interactiveConcurrency}:${transferConcurrency}:${workerCadenceMs}`
    if (nextKey === this.schedulerKey) {
      return
    }
    this.schedulerKey = nextKey
    this.interactiveLane.stop()
    this.transferLane.stop()
    this.interactiveLane = new RequestLane(interactiveConcurrency, workerCadenceMs)
    this.transferLane = new RequestLane(transferConcurrency, workerCadenceMs)
  }

  private sleep (ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private isMissingPathError (error: any): boolean {
    return /(file|path) not found:/i.test(String(error?.message || error || ''))
  }

  private async readRemoteTextIfExists (path: string, maxBytes: number, asRoot: boolean): Promise<string | null> {
    try {
      const result = await this.readTextFile(path, maxBytes, asRoot)
      return String(result?.content || '')
    } catch (error: any) {
      if (this.isMissingPathError(error)) {
        return null
      }
      throw error
    }
  }

  private async readRemoteLogSnippet (path: string, asRoot: boolean): Promise<string> {
    return String(await this.readRemoteTextIfExists(path, 256 * 1024, asRoot) || '').trim()
  }

  private createMaintenanceSession (action: 'bootstrap' | 'repair' | 'up', remotePath: string, asRoot: boolean): SessionLog {
    const startedAt = new Date().toISOString()
    const session = createSessionLog({
      action,
      asRoot,
      kind: 'maintenance',
      remotePath,
      sessionName: createSessionName('maintenance', action, startedAt),
      startedAt,
    })
    this.latestMaintenanceSessionValue = session
    return session
  }

  private logSession (session: SessionLog, level: SessionLogLevel, message: string, details?: string): void {
    appendSessionLogEntry(session, {
      level,
      message,
      details,
      timestamp: new Date().toISOString(),
    })
  }

  getLatestMaintenanceLocalLogDownloadPayload (): LogDownloadPayload {
    if (!this.latestMaintenanceSessionValue) {
      throw new Error('No maintenance session log is available yet')
    }
    return buildLocalLogDownloadPayload(this.latestMaintenanceSessionValue)
  }

  async getLatestMaintenanceRemoteLogDownloadPayload (): Promise<LogDownloadPayload> {
    const session = this.latestMaintenanceSessionValue
    if (!session) {
      throw new Error('No maintenance session log is available yet')
    }
    if (!session.remoteLogPath) {
      throw new Error('No remote log path is recorded for the latest maintenance session')
    }

    const remoteLogText = await this.readRemoteTextIfExists(session.remoteLogPath, 1024 * 1024, Boolean(session.asRoot))
    const remoteStatusText = session.remoteStatusPath
      ? await this.readRemoteTextIfExists(session.remoteStatusPath, 128 * 1024, Boolean(session.asRoot))
      : null

    return buildRemoteLogDownloadPayload({
      session,
      remoteLogText,
      remoteStatusText,
    })
  }

  private shouldRetryStatus (status: number): boolean {
    return [429, 502, 503, 504].includes(status)
  }

  private parseBody (text: string): JsonRpcResponse {
    try {
      return JSON.parse(text)
    } catch {
      const dataLines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .filter(Boolean)

      for (let i = dataLines.length - 1; i >= 0; i--) {
        try {
          return JSON.parse(dataLines[i])
        } catch {
          // keep scanning older SSE payloads
        }
      }
    }
    return { error: { message: text || 'Invalid MCP response' } }
  }

  private laneForTool (name: string): LaneKind {
    if (name.startsWith('upload_chunked_') || name.startsWith('download_chunked_')) {
      return 'transfer'
    }
    return 'interactive'
  }

  private async executeRequest (payload: any, signal?: AbortSignal, noRetry = false): Promise<any> {
    const settings = this.settings
    const url = this.normalizedUrl
    if (!url) {
      throw new Error('MCP URL is required')
    }

    const maxRetries = noRetry ? 0 : Math.max(0, Number(settings.maxRetries ?? 2))
    const retryBaseMs = Math.max(100, Number(settings.retryBaseMs ?? 1000))
    let lastBody = ''
    let lastStatus = 0
    let lastError: any = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2025-11-25',
            'X-API-KEY': settings.apiKey,
          },
          body: JSON.stringify(payload),
          signal,
        })
        const text = await response.text()
        lastBody = text
        lastStatus = response.status

        if (response.ok && !this.shouldRetryStatus(response.status)) {
          const parsed = this.parseBody(text)
          if (parsed.error) {
            throw new Error(parsed.error.message || 'MCP error')
          }
          if (parsed.result?.isError && parsed.result?.content?.[0]?.text) {
            throw new Error(parsed.result.content[0].text)
          }
          if (parsed.result?.structuredContent !== undefined) {
            return parsed.result.structuredContent
          }
          return parsed.result
        }

        if (!this.shouldRetryStatus(response.status)) {
          const parsed = this.parseBody(text)
          if (parsed.error?.message) {
            throw new Error(parsed.error.message)
          }
          throw new Error(`MCP request failed with status ${response.status}: ${text}`)
        }
      } catch (error: any) {
        lastError = error
        if (signal?.aborted || error?.name === 'AbortError') {
          throw error
        }
        if (attempt === maxRetries) {
          break
        }
      }

      if (attempt < maxRetries) {
        await this.sleep(retryBaseMs * (attempt + 1))
      }
    }

    throw lastError || new Error(`MCP request failed with status ${lastStatus}: ${lastBody}`)
  }

  private async request (payload: any, signal?: AbortSignal, laneKind: LaneKind = 'interactive'): Promise<any> {
    this.ensureScheduler()
    const lane = laneKind === 'transfer' ? this.transferLane : this.interactiveLane
    return lane.enqueue(() => this.executeRequest(payload, signal), signal)
  }

  async callTool (name: string, args: any, signal?: AbortSignal, laneKind?: LaneKind): Promise<any> {
    return this.request({
      jsonrpc: '2.0',
      id: `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    }, signal, laneKind || this.laneForTool(name))
  }

  async healthRaw (signal?: AbortSignal): Promise<any> {
    return this.callTool('health', {}, signal, 'interactive')
  }

  async getHealth (signal?: AbortSignal): Promise<RemoteHealthInfo> {
    const raw = await this.healthRaw(signal)
    return parseRemoteHealth(raw)
  }

  async health (): Promise<any> {
    return this.healthRaw()
  }

  async runCommand (command: string, cwd: string, timeoutSeconds: number, asRoot: boolean): Promise<any> {
    return this.callTool('run_command', {
      command,
      cwd,
      timeout_seconds: timeoutSeconds,
      as_root: asRoot,
    }, undefined, 'interactive')
  }

  async openShellSession (cwd: string, asRoot: boolean): Promise<any> {
    return this.callTool('open_shell_session', {
      cwd,
      as_root: asRoot,
    }, undefined, 'interactive')
  }

  async execShellSession (sessionId: string, command: string, timeoutSeconds: number): Promise<any> {
    return this.callTool('exec_shell_session', {
      session_id: sessionId,
      command,
      timeout_seconds: timeoutSeconds,
    }, undefined, 'interactive')
  }

  async closeShellSession (sessionId: string): Promise<any> {
    return this.callTool('close_shell_session', {
      session_id: sessionId,
    }, undefined, 'interactive')
  }

  // ── PTY session methods ────────────────────────────────────

  async openPtySession (cwd: string, asRoot: boolean, cols: number, rows: number): Promise<any> {
    return this.callTool('open_pty_session', {
      cwd,
      as_root: asRoot,
      cols,
      rows,
    }, undefined, 'interactive')
  }

  async writePtyInput (sessionId: string, dataBase64: string): Promise<any> {
    return this.executePtyRequest('write_pty_input', {
      session_id: sessionId,
      data_base64: dataBase64,
    }, undefined, true)
  }

  /**
   * Read PTY output via long-poll. Bypasses the RequestLane to avoid
   * blocking the interactive lane for up to 5 seconds per poll cycle.
   */
  async readPtyOutputDirect (sessionId: string, signal?: AbortSignal): Promise<any> {
    return this.executePtyRequest('read_pty_output', {
      session_id: sessionId,
      timeout_ms: 5000,
    }, signal)
  }

  async resizePty (sessionId: string, cols: number, rows: number): Promise<any> {
    return this.executePtyRequest('resize_pty', {
      session_id: sessionId,
      cols,
      rows,
    })
  }

  async closePtySession (sessionId: string): Promise<any> {
    return this.executePtyRequest('close_pty_session', {
      session_id: sessionId,
    })
  }

  /**
   * All PTY calls bypass the RequestLane to avoid queuing behind other
   * operations. This is critical for input latency (write_pty_input)
   * and for long-poll reads that would otherwise block the lane.
   */
  private async executePtyRequest (toolName: string, args: any, signal?: AbortSignal, noRetry = false): Promise<any> {
    return this.executeRequest({
      jsonrpc: '2.0',
      id: `pty-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }, signal, noRetry)
  }

  async listDirectory (path: string, asRoot: boolean): Promise<any> {
    return this.callTool('list_directory', { path, as_root: asRoot }, undefined, 'interactive')
  }

  async readTextFile (path: string, maxBytes: number, asRoot: boolean): Promise<any> {
    return this.callTool('read_text_file', {
      path,
      max_bytes: maxBytes,
      encoding: 'utf-8',
      as_root: asRoot,
    }, undefined, 'interactive')
  }

  async writeTextFile (path: string, content: string, asRoot: boolean): Promise<any> {
    return this.callTool('write_text_file', {
      path,
      content,
      overwrite: true,
      encoding: 'utf-8',
      as_root: asRoot,
    }, undefined, 'interactive')
  }

  async makeDirectory (path: string, asRoot: boolean): Promise<any> {
    return this.callTool('make_directory', {
      path,
      parents: true,
      as_root: asRoot,
    }, undefined, 'interactive')
  }

  async deletePath (path: string, recursive: boolean, asRoot: boolean): Promise<any> {
    return this.callTool('delete_path', {
      path,
      recursive,
      as_root: asRoot,
    }, undefined, 'interactive')
  }

  async renamePath (sourcePath: string, destPath: string, asRoot: boolean): Promise<any> {
    return this.callTool('rename_path', {
      path: sourcePath,
      dest: destPath,
      as_root: asRoot,
    }, undefined, 'interactive')
  }

  async uploadBinaryFile (path: string, base64: string, asRoot: boolean, signal?: AbortSignal): Promise<any> {
    return this.callTool('upload_binary_file', {
      path,
      content_base64: base64,
      overwrite: true,
      as_root: asRoot,
    }, signal, 'interactive')
  }

  async uploadChunkedBegin (path: string, asRoot: boolean, totalSize?: number, chunkBytes?: number): Promise<any> {
    return this.callTool('upload_chunked_begin', {
      path,
      overwrite: true,
      as_root: asRoot,
      total_size: totalSize,
      chunk_bytes: chunkBytes,
    }, undefined, 'transfer')
  }

  async uploadChunkedPart (uploadId: string, contentBase64: string, offset?: number, signal?: AbortSignal): Promise<any> {
    return this.callTool('upload_chunked_part', {
      upload_id: uploadId,
      content_base64: contentBase64,
      offset,
    }, signal, 'transfer')
  }

  async uploadChunkedFinish (uploadId: string): Promise<any> {
    return this.callTool('upload_chunked_finish', { upload_id: uploadId }, undefined, 'transfer')
  }

  async uploadChunkedAbort (uploadId: string): Promise<any> {
    return this.callTool('upload_chunked_abort', { upload_id: uploadId }, undefined, 'transfer')
  }

  async uploadTextViaChunked (path: string, text: string, asRoot: boolean, onChunkProgress?: (bytesSent: number, bytesTotal: number) => void): Promise<void> {
    const buf = Buffer.from(text, 'utf-8')
    const chunkSize = 32 * 1024
    const begin = await this.uploadChunkedBegin(path, asRoot, buf.length, chunkSize)
    const uploadId = begin?.upload_id
    if (!uploadId) {
      throw new Error('upload_chunked_begin did not return an upload_id')
    }
    try {
      for (let offset = 0; offset < buf.length; offset += chunkSize) {
        const chunk = buf.subarray(offset, offset + chunkSize)
        await this.uploadChunkedPart(uploadId, chunk.toString('base64'), offset)
        onChunkProgress?.(Math.min(offset + chunkSize, buf.length), buf.length)
      }
      await this.uploadChunkedFinish(uploadId)
    } catch (err) {
      await this.uploadChunkedAbort(uploadId).catch(() => {})
      throw err
    }
  }

  async downloadBinaryFile (path: string, asRoot: boolean, signal?: AbortSignal): Promise<any> {
    return this.callTool('download_binary_file', {
      path,
      max_bytes: 64 * 1024 * 1024,
      as_root: asRoot,
    }, signal, 'interactive')
  }

  async downloadChunkedBegin (path: string, asRoot: boolean, chunkBytes = 131072): Promise<any> {
    return this.callTool('download_chunked_begin', {
      path,
      as_root: asRoot,
      chunk_bytes: chunkBytes,
    }, undefined, 'transfer')
  }

  async downloadChunkedPart (downloadId: string, offset?: number, chunkBytes?: number, signal?: AbortSignal): Promise<any> {
    return this.callTool('download_chunked_part', {
      download_id: downloadId,
      offset,
      chunk_bytes: chunkBytes,
    }, signal, 'transfer')
  }

  async downloadChunkedClose (downloadId: string): Promise<any> {
    return this.callTool('download_chunked_close', { download_id: downloadId }, undefined, 'transfer')
  }

  private async waitForHealth (options: WaitForHealthOptions): Promise<RemoteHealthInfo> {
    const timeoutMs = Math.max(5000, Number(options.timeoutMs || 120000))
    const intervalMs = Math.max(500, Number(options.intervalMs || 2000))
    const deadline = Date.now() + timeoutMs
    let lastError: any = null

    while (Date.now() < deadline) {
      try {
        return await this.getHealth()
      } catch (error: any) {
        lastError = error
      }
      await this.sleep(intervalMs)
    }

    throw new Error(`Remote health check did not recover within ${timeoutMs} ms: ${String(lastError?.message || lastError || 'unknown error')}`)
  }

  private async waitForInstallerCompletion (options: WaitForInstallerCompletionOptions): Promise<{ health: RemoteHealthInfo, status: RemoteInstallerStatus }> {
    const timeoutMs = Math.max(5000, Number(options.timeoutMs || 120000))
    const intervalMs = Math.max(500, Number(options.intervalMs || 2000))
    const startedAt = Date.now()
    const deadline = startedAt + timeoutMs
    let lastError: any = null
    let lastHealth: RemoteHealthInfo | null = null
    let lastStatus: RemoteInstallerStatus | null = null
    let consecutiveErrors = 0

    while (Date.now() < deadline) {
      if (options.signal?.aborted) {
        throw new DOMException('Operation cancelled', 'AbortError')
      }
      options.onPoll?.(Date.now() - startedAt, timeoutMs)

      try {
        lastHealth = await this.getHealth()
        consecutiveErrors = 0
        this.logSession(
          options.session,
          'info',
          'Remote health poll succeeded',
          `script=${lastHealth.scriptVersion || 'unknown'} server=${lastHealth.serverVersion || 'unknown'} transport=${lastHealth.transportMode || 'unknown'}`,
        )
      } catch (error: any) {
        lastError = error
        const msg = String(error?.message || error)
        const isGatewayError = /\bstatus\s+(502|503|504)\b/.test(msg)
        if (!isGatewayError) {
          consecutiveErrors++
        }
        this.logSession(options.session, 'warn', `Remote health poll failed${isGatewayError ? ' (gateway, expected during restart)' : ''}`, msg)
        if (consecutiveErrors >= 10) {
          throw new Error(`Remote health check failed ${consecutiveErrors} consecutive times (excluding gateway errors). Last error: ${msg}`)
        }
        await this.sleep(intervalMs)
        continue
      }

      try {
        const statusText = await this.readRemoteTextIfExists(options.statusPath, 64 * 1024, options.asRoot)
        if (statusText) {
          lastStatus = parseRemoteInstallerStatus(statusText)
          this.logSession(
            options.session,
            'info',
            'Remote installer status file detected',
            `ok=${lastStatus.ok} exit=${lastStatus.exitCode ?? 'unknown'} session=${lastStatus.sessionName || 'unknown'}`,
          )
          if (lastStatus.sessionName && lastStatus.sessionName !== options.expectedSessionName) {
            throw new Error(`Remote status session_name=${lastStatus.sessionName} does not match expected ${options.expectedSessionName}`)
          }
          if (!lastStatus.ok) {
            const logSnippet = await this.readRemoteLogSnippet(options.logPath, options.asRoot)
            const suffix = logSnippet ? ` Remote log:\n${logSnippet}` : ` Remote log path: ${options.logPath}`
            throw new Error(`Remote ${options.action} exited with code ${lastStatus.exitCode ?? 'unknown'}.${suffix}`)
          }
          if (lastHealth.scriptVersion === options.expectedScriptVersion && lastHealth.serverVersion === options.expectedServerVersion) {
            this.logSession(options.session, 'info', 'Remote installer finished with expected versions')
            return { health: lastHealth, status: lastStatus }
          }
          lastError = new Error(`Remote installer completed, but health reports script=${lastHealth.scriptVersion || 'unknown'} server=${lastHealth.serverVersion || 'unknown'} instead of expected script=${options.expectedScriptVersion} server=${options.expectedServerVersion}`)
          this.logSession(options.session, 'warn', 'Remote installer completed before expected versions were observed', String(lastError.message || lastError))
        } else {
          this.logSession(options.session, 'info', 'Remote installer status file not ready yet', options.statusPath)
        }
      } catch (error: any) {
        lastError = error
        this.logSession(options.session, 'error', 'Remote installer completion check failed', String(error?.message || error))
      }

      await this.sleep(intervalMs)
    }

    const logSnippet = lastHealth ? await this.readRemoteLogSnippet(options.logPath, options.asRoot).catch(() => '') : ''
    const statusSummary = lastStatus
      ? ` Last status: ok=${lastStatus.ok} exit=${lastStatus.exitCode ?? 'unknown'} finished_at=${lastStatus.finishedAt || 'unknown'} session_name=${lastStatus.sessionName || 'unknown'}.`
      : ` Status file path: ${options.statusPath}.`
    const suffix = logSnippet ? ` Remote log:\n${logSnippet}` : ` Remote log path: ${options.logPath}`
    throw new Error(`Remote ${options.action} did not complete within ${timeoutMs} ms.${statusSummary} Last error: ${String(lastError?.message || lastError || 'unknown error')}.${suffix}`)
  }

  async pushInstallerAndUpgrade (options: PushInstallerAndUpgradeOptions = {}): Promise<any> {
    const installer = this.bundledInstaller
    const remotePath = String(options.remotePath || this.settings.installerRemotePath || '/tmp/bianbu_agent_proxy.sh').trim()
    const asRoot = options.asRoot ?? Boolean(this.settings.maintenanceAsRoot)
    const action = options.action || 'up'
    const reconnectPollMs = Number(options.reconnectPollMs ?? this.settings.reconnectPollMs ?? 2000)
    const healthTimeoutMs = Number(options.healthTimeoutMs ?? this.settings.upgradeHealthTimeoutMs ?? 120000)
    const signal = options.signal
    const onProgress = options.onProgress
    const totalSteps = 4
    const totalBytes = Buffer.byteLength(installer.script, 'utf-8')
    const formatKB = (b: number) => `${Math.round(b / 1024)}KB`

    if (!remotePath) {
      throw new Error('Remote installer path is required')
    }

    const session = this.createMaintenanceSession(action, remotePath, asRoot)
    const logPath = remoteInstallerLogPath(remotePath)
    const statusPath = remoteInstallerStatusPath(remotePath)
    session.remoteLogPath = logPath
    session.remoteStatusPath = statusPath
    this.logSession(session, 'info', 'Starting remote maintenance session', `remote_path=${remotePath} action=${action}`)

    const checkCancel = () => {
      if (signal?.aborted) {
        throw new DOMException('Operation cancelled', 'AbortError')
      }
    }

    try {
      // Step 1: Upload
      onProgress?.({ step: 'upload', stepIndex: 0, totalSteps, label: 'Uploading script...', percent: 0 })
      checkCancel()
      this.logSession(session, 'info', 'Uploading bundled installer to remote host', remotePath)
      await this.uploadTextViaChunked(remotePath, installer.script, asRoot, (sent, total) => {
        onProgress?.({ step: 'upload', stepIndex: 0, totalSteps, label: `Uploading script (${formatKB(sent)} / ${formatKB(total)})`, percent: Math.round((sent / total) * 30) })
      })

      // Step 2: Launch
      checkCancel()
      onProgress?.({ step: 'launch', stepIndex: 1, totalSteps, label: 'Launching installer...', percent: 30 })
      const start = await this.runCommand(buildDetachedInstallerCommand(remotePath, action, logPath, statusPath, session.sessionName), '.', 30, asRoot)
      this.logSession(session, 'info', 'Detached installer command launched', JSON.stringify(start, null, 2))

      // Step 3: Wait for completion
      onProgress?.({ step: 'wait', stepIndex: 2, totalSteps, label: 'Waiting for installer...', percent: 40 })
      const { health, status } = await this.waitForInstallerCompletion({
        action,
        asRoot,
        expectedSessionName: session.sessionName,
        expectedScriptVersion: installer.metadata.scriptVersion,
        expectedServerVersion: installer.metadata.serverVersion,
        intervalMs: reconnectPollMs,
        logPath,
        onPoll: (elapsed, timeout) => {
          const waitPercent = 40 + Math.round((elapsed / timeout) * 50)
          const elapsedSec = Math.round(elapsed / 1000)
          onProgress?.({ step: 'wait', stepIndex: 2, totalSteps, label: `Waiting for installer... (${elapsedSec}s)`, percent: Math.min(waitPercent, 89) })
        },
        session,
        signal,
        statusPath,
        timeoutMs: healthTimeoutMs,
      })

      // Step 4: Verify
      onProgress?.({ step: 'verify', stepIndex: 3, totalSteps, label: 'Verified!', percent: 100 })
      finishSessionLog(session, 'done')
      this.logSession(session, 'info', 'Remote maintenance session finished successfully')

      return {
        action,
        asRoot,
        health,
        installer: installer.metadata,
        logPath,
        remotePath,
        session,
        start,
        status,
        statusPath,
      }
    } catch (error: any) {
      const message = String(error?.message || error)
      this.logSession(session, 'error', 'Remote maintenance session failed', message)
      finishSessionLog(session, 'error', undefined, message)
      throw error
    }
  }
}

import { BaseSession } from 'tabby-terminal'
import { Logger } from 'tabby-core'
import { BianbuMcpService } from './mcp.service'

export class BianbuPtySession extends BaseSession {
  private sessionId: string | null = null
  private alive = false
  private pollAbort: AbortController | null = null
  private inputQueue: Buffer[] = []
  private inputFlushTimer: any = null

  constructor (
    logger: Logger,
    private mcp: BianbuMcpService,
  ) {
    super(logger)
  }

  async start (options: { cwd?: string, asRoot?: boolean, cols?: number, rows?: number } = {}): Promise<void> {
    this.open = true
    const result = await this.mcp.openPtySession(
      options.cwd || '.',
      options.asRoot || false,
      options.cols || 80,
      options.rows || 24,
    )
    this.sessionId = result.session_id
    this.alive = true
    this.startPollLoop()
  }

  write (data: Buffer): void {
    if (!this.alive || !this.sessionId) {
      return
    }
    this.inputQueue.push(data)
    if (!this.inputFlushTimer) {
      this.inputFlushTimer = setTimeout(() => this.flushInput(), 16)
    }
  }

  resize (columns: number, rows: number): void {
    if (this.sessionId && this.alive) {
      this.mcp.resizePty(this.sessionId, columns, rows).catch(() => {})
    }
  }

  kill (): void {
    this.cleanup()
  }

  async gracefullyKillProcess (): Promise<void> {
    await this.cleanup()
  }

  supportsWorkingDirectory (): boolean {
    return false
  }

  async getWorkingDirectory (): Promise<string | null> {
    return null
  }

  async destroy (): Promise<void> {
    await this.cleanup()
    await super.destroy()
  }

  private async flushInput (): Promise<void> {
    this.inputFlushTimer = null
    if (!this.inputQueue.length || !this.sessionId || !this.alive) {
      return
    }
    const combined = Buffer.concat(this.inputQueue)
    this.inputQueue = []
    try {
      await this.mcp.writePtyInput(this.sessionId, combined.toString('base64'))
    } catch (err: any) {
      this.logger.error('PTY write error', err)
    }
  }

  private startPollLoop (): void {
    this.pollAbort = new AbortController()
    void this.pollLoop()
  }

  private async pollLoop (): Promise<void> {
    while (this.alive && this.open) {
      try {
        const result = await this.mcp.readPtyOutputDirect(
          this.sessionId!,
          this.pollAbort!.signal,
        )
        if (result?.data_base64) {
          this.emitOutput(Buffer.from(result.data_base64, 'base64'))
        }
        if (!result?.alive) {
          this.alive = false
          this.emitOutput(Buffer.from('\r\n\x1b[90m[Process exited]\x1b[0m\r\n'))
          this.closed.next()
          break
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          break
        }
        this.logger.warn('PTY poll error, retrying in 1s', err)
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }

  private async cleanup (): Promise<void> {
    this.alive = false
    this.open = false
    this.pollAbort?.abort()
    this.pollAbort = null
    if (this.inputFlushTimer) {
      clearTimeout(this.inputFlushTimer)
      this.inputFlushTimer = null
    }
    if (this.sessionId) {
      const id = this.sessionId
      this.sessionId = null
      await this.mcp.closePtySession(id).catch(() => {})
    }
  }
}

import { BaseSession } from 'tabby-terminal'
import { Logger } from 'tabby-core'
import { BianbuMcpService } from './mcp.service'

export class BianbuShellSession extends BaseSession {
  private cwd = '.'
  private currentLine = ''
  private running = false
  private asRoot = false
  private sessionId: string | null = null

  constructor (
    logger: Logger,
    private mcp: BianbuMcpService,
  ) {
    super(logger)
  }

  async start (options: any): Promise<void> {
    this.open = true
    this.cwd = options?.cwd || '.'
    this.asRoot = !!options?.asRoot
    this.emitText('Connected to Bianbu Cloud MCP shell\r\n')

    try {
      const session = await this.mcp.openShellSession(this.cwd, this.asRoot)
      this.sessionId = session.session_id || null
      this.cwd = session.cwd || this.cwd
    } catch (error: any) {
      this.sessionId = null
      this.logger.warn('Falling back to stateless MCP shell mode', error)
      this.emitText(`Shell session fallback: ${String(error?.message || error)}\r\n`)
    }

    this.emitPrompt()
  }

  resize (_columns: number, _rows: number): void {
    // no-op for MCP shell emulation
  }

  write (data: Buffer): void {
    const text = data.toString('utf-8')
    for (const ch of text) {
      void this.handleChar(ch)
    }
  }

  kill (): void {
    this.running = false
    void this.closeRemoteSession()
  }

  async gracefullyKillProcess (): Promise<void> {
    this.running = false
    await this.closeRemoteSession()
  }

  async destroy (): Promise<void> {
    await this.closeRemoteSession()
    await super.destroy()
  }

  supportsWorkingDirectory (): boolean {
    return true
  }

  async getWorkingDirectory (): Promise<string | null> {
    return this.cwd
  }

  private async handleChar (ch: string): Promise<void> {
    if (this.running) {
      if (ch === '\u0003') {
        this.emitText('^C\r\n')
      }
      return
    }

    if (ch === '\r' || ch === '\n') {
      const command = this.currentLine
      this.currentLine = ''
      this.emitText('\r\n')
      if (command.trim()) {
        await this.execute(command)
      }
      this.emitPrompt()
      return
    }

    if (ch === '\u007f' || ch === '\b') {
      if (this.currentLine.length) {
        this.currentLine = this.currentLine.slice(0, -1)
        this.emitText('\b \b')
      }
      return
    }

    if (ch === '\u0003') {
      this.currentLine = ''
      this.emitText('^C\r\n')
      this.emitPrompt()
      return
    }

    if (ch >= ' ') {
      this.currentLine += ch
      this.emitText(ch)
    }
  }

  private async execute (command: string): Promise<void> {
    this.running = true
    try {
      const result = this.sessionId
        ? await this.mcp.execShellSession(this.sessionId, command, 120)
        : await this.mcp.runCommand(command, this.cwd, 120, this.asRoot)

      if (result.stdout) {
        this.emitText(this.normalize(result.stdout))
      }
      if (result.stderr) {
        this.emitText(this.normalize(result.stderr))
      }
      if (result.exit_code !== 0 && !result.stderr) {
        this.emitText(`command exited with code ${result.exit_code}\r\n`)
      }
      if (result.cwd) {
        this.cwd = result.cwd
      }
    } catch (error: any) {
      this.emitText(this.normalize(String(error?.message || error)))
    } finally {
      this.running = false
    }
  }

  private async closeRemoteSession (): Promise<void> {
    if (!this.sessionId) {
      return
    }
    const sessionId = this.sessionId
    this.sessionId = null
    try {
      await this.mcp.closeShellSession(sessionId)
    } catch (error: any) {
      this.logger.warn('Failed to close MCP shell session', error)
    }
  }

  private emitPrompt (): void {
    const marker = this.asRoot ? '#' : '$'
    this.emitText(`[bianbu ${this.cwd}]${marker} `)
  }

  private emitText (text: string): void {
    this.emitOutput(Buffer.from(text, 'utf-8'))
  }

  private normalize (text: string): string {
    return text.replace(/\r?\n/g, '\r\n') + (text.endsWith('\n') ? '' : '\r\n')
  }
}

import { BaseSession } from 'tabby-terminal'
import { Logger } from 'tabby-core'
import { BianbuMcpService } from './mcp.service'

export class BianbuShellSession extends BaseSession {
  private cwd = '.'
  private currentLine = ''
  private cursorPos = 0
  private running = false
  private asRoot = false
  private sessionId: string | null = null

  private history: string[] = []
  private historyIndex = -1
  private savedLine = ''

  private escBuffer = ''
  private escTimer: any = null

  constructor (
    logger: Logger,
    private mcp: BianbuMcpService,
  ) {
    super(logger)
  }

  async start (options: { cwd?: string, asRoot?: boolean } = {}): Promise<void> {
    this.open = true
    this.cwd = options.cwd || '.'
    this.asRoot = options.asRoot || false
    this.emitText('Connected to Bianbu Cloud MCP shell\r\n')
    try {
      const session = await this.mcp.openShellSession(this.cwd, this.asRoot)
      this.sessionId = session.session_id || null
      if (this.sessionId) {
        this.emitText('\x1b[90mUsing persistent shell session\x1b[0m\r\n')
      }
    } catch {
      this.sessionId = null
      this.emitText('\x1b[90mUsing stateless command mode\x1b[0m\r\n')
    }
    this.emitPrompt()
  }

  resize (_columns: number, _rows: number): void { }

  write (data: Buffer): void {
    const text = data.toString('utf-8')
    for (const ch of text) {
      this.handleChar(ch)
    }
  }

  kill (): void {
    this.running = false
    this.closeRemoteSession()
  }

  async gracefullyKillProcess (): Promise<void> {
    this.running = false
    await this.closeRemoteSession()
  }

  async destroy (): Promise<void> {
    this.running = false
    await this.closeRemoteSession()
    await super.destroy()
  }

  supportsWorkingDirectory (): boolean {
    return true
  }

  async getWorkingDirectory (): Promise<string | null> {
    return this.cwd
  }

  private handleChar (ch: string): void {
    // ESC sequence buffering
    if (this.escBuffer.length > 0 || ch === '\x1b') {
      this.escBuffer += ch
      if (this.escTimer) clearTimeout(this.escTimer)

      // Check for complete CSI sequence: ESC [ <params> <final byte>
      if (this.escBuffer.length >= 3 && this.escBuffer[1] === '[') {
        const final = this.escBuffer[this.escBuffer.length - 1]
        if (final >= '@' && final <= '~') {
          const seq = this.escBuffer
          this.escBuffer = ''
          this.handleEscSequence(seq)
          return
        }
        if (this.escBuffer.length > 8) {
          this.escBuffer = ''
          return
        }
      } else if (this.escBuffer.length === 1) {
        // Just got ESC, wait briefly for more chars
        this.escTimer = setTimeout(() => {
          this.escBuffer = ''
        }, 50)
      } else if (this.escBuffer.length > 2 && this.escBuffer[1] !== '[') {
        // Not a CSI sequence
        this.escBuffer = ''
      }
      return
    }

    if (this.running) {
      if (ch === '\x03') {
        this.emitText('^C\r\n')
      }
      return
    }

    switch (ch) {
      case '\r':
      case '\n':
        this.emitText('\r\n')
        if (this.currentLine.trim()) {
          this.addToHistory(this.currentLine)
          void this.execute(this.currentLine)
        } else {
          this.emitPrompt()
        }
        this.currentLine = ''
        this.cursorPos = 0
        this.historyIndex = -1
        this.savedLine = ''
        break

      case '\x7f': // DEL
      case '\b':   // BS
        if (this.cursorPos > 0) {
          this.currentLine = this.currentLine.slice(0, this.cursorPos - 1) + this.currentLine.slice(this.cursorPos)
          this.cursorPos--
          this.redrawLine()
        }
        break

      case '\x03': // Ctrl+C
        this.currentLine = ''
        this.cursorPos = 0
        this.historyIndex = -1
        this.savedLine = ''
        this.emitText('^C\r\n')
        this.emitPrompt()
        break

      case '\x01': // Ctrl+A — beginning of line
        if (this.cursorPos > 0) {
          this.cursorPos = 0
          this.redrawLine()
        }
        break

      case '\x05': // Ctrl+E — end of line
        if (this.cursorPos < this.currentLine.length) {
          this.cursorPos = this.currentLine.length
          this.redrawLine()
        }
        break

      case '\x15': // Ctrl+U — clear line before cursor
        if (this.cursorPos > 0) {
          this.currentLine = this.currentLine.slice(this.cursorPos)
          this.cursorPos = 0
          this.redrawLine()
        }
        break

      case '\x0b': // Ctrl+K — kill to end of line
        if (this.cursorPos < this.currentLine.length) {
          this.currentLine = this.currentLine.slice(0, this.cursorPos)
          this.redrawLine()
        }
        break

      case '\x17': // Ctrl+W — delete word before cursor
        if (this.cursorPos > 0) {
          const before = this.currentLine.slice(0, this.cursorPos)
          const trimmed = before.replace(/\S+\s*$/, '')
          const after = this.currentLine.slice(this.cursorPos)
          this.currentLine = trimmed + after
          this.cursorPos = trimmed.length
          this.redrawLine()
        }
        break

      case '\x0c': // Ctrl+L — clear screen
        this.emitText('\x1b[2J\x1b[H')
        this.emitPrompt()
        this.emitText(this.currentLine)
        if (this.cursorPos < this.currentLine.length) {
          this.emitText(`\x1b[${this.currentLine.length - this.cursorPos}D`)
        }
        break

      case '\t': // Tab — no-op for now
        break

      default:
        if (ch >= ' ') {
          this.currentLine = this.currentLine.slice(0, this.cursorPos) + ch + this.currentLine.slice(this.cursorPos)
          this.cursorPos++
          this.redrawLine()
        }
        break
    }
  }

  private handleEscSequence (seq: string): void {
    if (this.running) return

    switch (seq) {
      case '\x1b[A': // Up arrow — history previous
        this.navigateHistory(1)
        break
      case '\x1b[B': // Down arrow — history next
        this.navigateHistory(-1)
        break
      case '\x1b[C': // Right arrow
        if (this.cursorPos < this.currentLine.length) {
          this.cursorPos++
          this.emitText('\x1b[C')
        }
        break
      case '\x1b[D': // Left arrow
        if (this.cursorPos > 0) {
          this.cursorPos--
          this.emitText('\x1b[D')
        }
        break
      case '\x1b[H': // Home
        this.cursorPos = 0
        this.redrawLine()
        break
      case '\x1b[F': // End
        this.cursorPos = this.currentLine.length
        this.redrawLine()
        break
      case '\x1b[3~': // Delete key
        if (this.cursorPos < this.currentLine.length) {
          this.currentLine = this.currentLine.slice(0, this.cursorPos) + this.currentLine.slice(this.cursorPos + 1)
          this.redrawLine()
        }
        break
      default:
        // Unknown sequence — ignore
        break
    }
  }

  private navigateHistory (direction: number): void {
    if (!this.history.length) return

    if (this.historyIndex === -1 && direction > 0) {
      this.savedLine = this.currentLine
      this.historyIndex = 0
    } else if (direction > 0 && this.historyIndex < this.history.length - 1) {
      this.historyIndex++
    } else if (direction < 0 && this.historyIndex > 0) {
      this.historyIndex--
    } else if (direction < 0 && this.historyIndex === 0) {
      this.historyIndex = -1
      this.currentLine = this.savedLine
      this.cursorPos = this.currentLine.length
      this.redrawLine()
      return
    } else {
      return
    }

    if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
      this.currentLine = this.history[this.historyIndex]
      this.cursorPos = this.currentLine.length
      this.redrawLine()
    }
  }

  private addToHistory (command: string): void {
    const trimmed = command.trim()
    if (!trimmed) return
    // Don't add duplicates at the top
    if (this.history.length > 0 && this.history[0] === trimmed) return
    this.history.unshift(trimmed)
    if (this.history.length > 200) {
      this.history.length = 200
    }
  }

  private redrawLine (): void {
    const prompt = this.getPrompt()
    this.emitText(`\r${prompt}${this.currentLine}\x1b[K`)
    const moveBack = this.currentLine.length - this.cursorPos
    if (moveBack > 0) {
      this.emitText(`\x1b[${moveBack}D`)
    }
  }

  private async execute (command: string): Promise<void> {
    this.running = true
    this.emitText('\x1b[90m⏳ Running...\x1b[0m\r\n')
    try {
      let result: any
      if (this.sessionId) {
        result = await this.mcp.execShellSession(this.sessionId, command, 120)
      } else {
        result = await this.mcp.runCommand(command, this.cwd, 120, this.asRoot)
      }

      const stdout = result?.stdout || result?.content?.[0]?.text || ''
      const stderr = result?.stderr || ''

      if (stdout) {
        this.emitText(this.normalize(stdout))
      }
      if (stderr) {
        this.emitText(`\x1b[31m${this.normalize(stderr)}\x1b[0m`)
      }
      if (result?.exit_code != null && result.exit_code !== 0 && !stderr) {
        this.emitText(`\x1b[33mcommand exited with code ${result.exit_code}\x1b[0m\r\n`)
      }

      if (result?.cwd) {
        this.cwd = result.cwd
      }
    } catch (error: any) {
      this.emitText(`\x1b[31m${this.normalize(String(error?.message || error))}\x1b[0m`)
    } finally {
      this.running = false
      this.emitPrompt()
    }
  }

  private async closeRemoteSession (): Promise<void> {
    if (this.sessionId) {
      try {
        await this.mcp.closeShellSession(this.sessionId)
      } catch {
        // ignore
      }
      this.sessionId = null
    }
  }

  private getPrompt (): string {
    return `\x1b[1;34m[bianbu ${this.cwd}]${this.asRoot ? '#' : '$'}\x1b[0m `
  }

  private emitPrompt (): void {
    this.emitText(this.getPrompt())
  }

  private emitText (text: string): void {
    this.emitOutput(Buffer.from(text, 'utf-8'))
  }

  private normalize (text: string): string {
    let normalized = text.replace(/\r?\n/g, '\r\n')
    if (!normalized.endsWith('\r\n')) {
      normalized += '\r\n'
    }
    return normalized
  }
}

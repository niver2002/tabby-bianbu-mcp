import { Component, Injector, Input } from '@angular/core'
import { BaseTabComponent, NotificationsService } from 'tabby-core'
import { BianbuMcpService } from './mcp.service'

interface ShellEntry {
  command: string
  cwd: string
  asRoot: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  ok: boolean
  time: string
}

/** @hidden */
@Component({
  template: require('./shellTab.component.pug'),
})
export class BianbuCloudShellTabComponent extends BaseTabComponent {
  @Input() presetCommand = ''

  command = ''
  cwd = '.'
  timeoutSeconds = 120
  asRoot = false
  busy = false
  entries: ShellEntry[] = []

  constructor (
    injector: Injector,
    private mcp: BianbuMcpService,
    private notifications: NotificationsService,
  ) {
    super(injector)
    this.setTitle('Bianbu Cloud Shell')
    this.icon = 'terminal'
  }

  ngOnInit (): void {
    if (this.presetCommand) {
      this.command = this.presetCommand
    }
  }

  async run (): Promise<void> {
    if (!this.command.trim()) {
      return
    }
    this.busy = true
    this.setProgress(0.3)
    try {
      const result = await this.mcp.runCommand(this.command, this.cwd || '.', this.timeoutSeconds, this.asRoot)
      this.entries.unshift({
        command: this.command,
        cwd: this.cwd || '.',
        asRoot: this.asRoot,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exit_code ?? null,
        ok: !!result.ok,
        time: new Date().toLocaleString(),
      })
      this.displayActivity()
      this.notifications.notice('Bianbu Cloud command finished')
    } catch (error: any) {
      this.entries.unshift({
        command: this.command,
        cwd: this.cwd || '.',
        asRoot: this.asRoot,
        stdout: '',
        stderr: String(error?.message || error),
        exitCode: null,
        ok: false,
        time: new Date().toLocaleString(),
      })
      this.notifications.error('Bianbu Cloud command failed', String(error?.message || error))
    } finally {
      this.busy = false
      this.setProgress(null)
    }
  }

  clear (): void {
    this.entries = []
    this.clearActivity()
  }
}

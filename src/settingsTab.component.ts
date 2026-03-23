import { Component } from '@angular/core'
import { AppService, ConfigService, NotificationsService, PlatformService } from 'tabby-core'
import { BianbuCloudFilesTabComponent } from './filesTab.component'
import { BianbuCloudShellTabComponent } from './shellTab.component'
import { BianbuMcpService } from './mcp.service'
import { MaintenanceProgress } from './mcp.service'
import { RemoteHealthInfo } from './remoteRelease'

/** @hidden */
@Component({
  template: require('./settingsTab.component.pug'),
})
export class BianbuMcpSettingsComponent {
  diagnosticsBusy = false
  maintenanceBusy = false
  maintenanceProgress: MaintenanceProgress | null = null
  maintenanceElapsed = 0
  remoteHealth: RemoteHealthInfo | null = null
  lastDiagnosticAt = ''
  lastMaintenanceAt = ''
  lastMaintenanceSummary = ''
  lastError = ''
  advancedVisible = false
  private maintenanceAbort: AbortController | null = null
  private elapsedTimer: any = null

  constructor (
    public config: ConfigService,
    private app: AppService,
    private mcp: BianbuMcpService,
    private notifications: NotificationsService,
    private platform: PlatformService,
  ) { }

  get settings (): any {
    return this.config.store.bianbuMcp
  }

  get bundledInstaller (): any | null {
    try {
      return this.mcp.bundledInstaller.metadata
    } catch {
      return null
    }
  }

  get validationErrors (): string[] {
    return this.mcp.validationErrors
  }

  get latestMaintenanceSession (): any | null {
    return this.mcp.latestMaintenanceSession
  }

  get sampleJson (): string {
    const s = this.settings
    const domain = String(s.domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    return JSON.stringify({
      mcpServers: {
        [s.name || 'bianbu']: {
          type: 'http',
          url: domain ? `https://${domain}/mcp` : 'https://your-domain.example.com/mcp',
          headers: {
            'X-API-KEY': s.apiKey ? '••••••••' : 'your-x-api-key',
          },
        },
      },
    }, null, 2)
  }

  save (): void {
    this.config.save()
  }

  openShell (): void {
    this.app.openNewTab({ type: BianbuCloudShellTabComponent })
  }

  openFiles (): void {
    this.app.openNewTab({ type: BianbuCloudFilesTabComponent })
  }

  async testConnection (): Promise<void> {
    await this.refreshHealth('Connection verified')
  }

  async refreshHealth (notice = 'Remote health refreshed'): Promise<void> {
    this.lastError = ''
    this.diagnosticsBusy = true
    try {
      this.remoteHealth = await this.mcp.getHealth()
      this.lastDiagnosticAt = new Date().toLocaleString()
      this.notifications.notice(notice)
    } catch (error: any) {
      this.lastError = String(error?.message || error)
      this.notifications.error('Bianbu MCP health check failed', this.lastError)
    } finally {
      this.diagnosticsBusy = false
    }
  }

  async pushUpgrade (action: 'up' | 'repair' = 'up'): Promise<void> {
    this.lastError = ''
    this.maintenanceBusy = true
    this.maintenanceElapsed = 0
    this.maintenanceProgress = { step: 'upload', stepIndex: 0, totalSteps: 4, label: 'Preparing...', percent: 0 }
    const abort = new AbortController()
    this.maintenanceAbort = abort
    this.elapsedTimer = setInterval(() => { this.maintenanceElapsed++ }, 1000)
    try {
      const result = await this.mcp.pushInstallerAndUpgrade({
        action,
        asRoot: !!this.settings.maintenanceAsRoot,
        healthTimeoutMs: this.settings.upgradeHealthTimeoutMs,
        onProgress: (p) => { this.maintenanceProgress = p },
        reconnectPollMs: this.settings.reconnectPollMs,
        remotePath: this.settings.installerRemotePath,
        signal: abort.signal,
      })
      this.remoteHealth = result.health
      this.lastMaintenanceAt = new Date().toLocaleString()
      this.lastMaintenanceSummary = `session=${result.session?.sessionName || 'unknown'} action=${result.action} remotePath=${result.remotePath} logPath=${result.logPath} statusPath=${result.statusPath} script=${result.health.scriptVersion || 'unknown'} server=${result.health.serverVersion || 'unknown'}`
      this.notifications.notice(action === 'repair' ? 'Remote repair finished' : 'Remote upgrade finished')
    } catch (error: any) {
      this.lastMaintenanceAt = new Date().toLocaleString()
      this.lastMaintenanceSummary = `session=${this.latestMaintenanceSession?.sessionName || 'unknown'} action=${action} remotePath=${this.settings.installerRemotePath || 'unknown'} logPath=${this.latestMaintenanceSession?.remoteLogPath || 'unknown'} statusPath=${this.latestMaintenanceSession?.remoteStatusPath || 'unknown'}`
      if (error?.name === 'AbortError') {
        this.lastError = 'Operation cancelled by user'
        this.notifications.info('Maintenance cancelled')
      } else {
        const stepLabel = this.maintenanceProgress?.step || 'unknown'
        this.lastError = `[${stepLabel}] ${String(error?.message || error)}`
        if (this.maintenanceProgress) {
          this.maintenanceProgress = { ...this.maintenanceProgress, error: true, label: `Failed at: ${stepLabel}` }
        }
        this.notifications.error(action === 'repair' ? 'Remote repair failed' : 'Remote upgrade failed', this.lastError)
      }
    } finally {
      clearInterval(this.elapsedTimer)
      this.elapsedTimer = null
      this.maintenanceAbort = null
      this.maintenanceBusy = false
      setTimeout(() => { if (!this.maintenanceBusy) { this.maintenanceProgress = null } }, 5000)
    }
  }

  cancelMaintenance (): void {
    this.maintenanceAbort?.abort()
  }

  async downloadLocalMaintenanceLog (): Promise<void> {
    try {
      const payload = this.mcp.getLatestMaintenanceLocalLogDownloadPayload()
      await this.downloadTextFile(payload.fileName, payload.content)
      this.notifications.notice('Local maintenance log downloaded')
    } catch (error: any) {
      this.lastError = String(error?.message || error)
      this.notifications.error('Failed to download local maintenance log', this.lastError)
    }
  }

  async downloadRemoteMaintenanceLog (): Promise<void> {
    try {
      const payload = await this.mcp.getLatestMaintenanceRemoteLogDownloadPayload()
      await this.downloadTextFile(payload.fileName, payload.content)
      this.notifications.notice('Remote maintenance log downloaded')
    } catch (error: any) {
      this.lastError = String(error?.message || error)
      this.notifications.error('Failed to download remote maintenance log', this.lastError)
    }
  }

  private async downloadTextFile (fileName: string, content: string): Promise<void> {
    const bytes = new TextEncoder().encode(content)
    const sink = await this.platform.startDownload(fileName, 0o644, bytes.length)
    if (!sink) {
      throw new Error('Download cancelled')
    }
    try {
      await sink.write(bytes)
      sink.close()
    } catch (error) {
      sink.close()
      throw error
    }
  }
}

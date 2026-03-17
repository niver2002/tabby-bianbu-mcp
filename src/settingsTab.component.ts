import { Component } from '@angular/core'
import { AppService, ConfigService } from 'tabby-core'
import { BianbuCloudFilesTabComponent } from './filesTab.component'
import { BianbuCloudShellTabComponent } from './shellTab.component'

/** @hidden */
@Component({
  template: require('./settingsTab.component.pug'),
})
export class BianbuMcpSettingsComponent {
  constructor (
    public config: ConfigService,
    private app: AppService,
  ) { }

  get sampleJson (): string {
    const s = this.config.store.bianbuMcp
    return JSON.stringify({
      mcpServers: {
        [s.name || 'bianbu']: {
          type: 'http',
          url: s.url || 'https://your-domain.example.com/mcp',
          headers: {
            'X-API-KEY': s.apiKey || 'your-x-api-key',
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
}

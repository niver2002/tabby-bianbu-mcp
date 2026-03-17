import { Component } from '@angular/core'
import { ConfigService } from 'tabby-core'

/** @hidden */
@Component({
  template: require('./settingsTab.component.pug'),
})
export class BianbuMcpSettingsComponent {
  constructor (
    public config: ConfigService,
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
}

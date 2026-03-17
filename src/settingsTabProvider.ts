import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { BianbuMcpSettingsComponent } from './settingsTab.component'

/** @hidden */
@Injectable()
export class BianbuMcpSettingsTabProvider extends SettingsTabProvider {
  id = 'bianbu-mcp'
  icon = 'plug'
  title = 'Bianbu MCP'

  getComponentType (): any {
    return BianbuMcpSettingsComponent
  }
}

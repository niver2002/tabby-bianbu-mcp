import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import TabbyCoreModule, { CommandProvider, ConfigProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'

import { BianbuMcpConfigProvider } from './configProvider'
import { BianbuMcpSettingsTabProvider } from './settingsTabProvider'
import { BianbuMcpSettingsComponent } from './settingsTab.component'
import { BianbuCloudCommandProvider } from './commands'
import { BianbuMcpService } from './mcp.service'
import { BianbuCloudShellTabComponent } from './shellTab.component'
import { BianbuCloudFilesTabComponent } from './filesTab.component'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    TabbyCoreModule,
  ],
  providers: [
    BianbuMcpService,
    { provide: ConfigProvider, useClass: BianbuMcpConfigProvider, multi: true },
    { provide: SettingsTabProvider, useClass: BianbuMcpSettingsTabProvider, multi: true },
    { provide: CommandProvider, useClass: BianbuCloudCommandProvider, multi: true },
  ],
  declarations: [
    BianbuMcpSettingsComponent,
    BianbuCloudShellTabComponent,
    BianbuCloudFilesTabComponent,
  ],
  entryComponents: [
    BianbuMcpSettingsComponent,
    BianbuCloudShellTabComponent,
    BianbuCloudFilesTabComponent,
  ],
})
export default class BianbuMcpModule { }

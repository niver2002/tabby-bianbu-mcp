import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import TabbyCoreModule, { ConfigProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'

import { BianbuMcpConfigProvider } from './configProvider'
import { BianbuMcpSettingsTabProvider } from './settingsTabProvider'
import { BianbuMcpSettingsComponent } from './settingsTab.component'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    TabbyCoreModule,
  ],
  providers: [
    { provide: ConfigProvider, useClass: BianbuMcpConfigProvider, multi: true },
    { provide: SettingsTabProvider, useClass: BianbuMcpSettingsTabProvider, multi: true },
  ],
  declarations: [
    BianbuMcpSettingsComponent,
  ],
  entryComponents: [
    BianbuMcpSettingsComponent,
  ],
})
export default class BianbuMcpModule { }

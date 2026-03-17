import { Component, Injector, Input } from '@angular/core'
import { BaseSession, BaseTerminalTabComponent } from 'tabby-terminal'
import { NotificationsService } from 'tabby-core'
import { BianbuMcpService } from './mcp.service'
import { BianbuShellSession } from './shellSession'
import { BianbuCloudProfile } from './profileProvider'

/** @hidden */
@Component({
  template: BaseTerminalTabComponent.template,
  styles: BaseTerminalTabComponent.styles,
  animations: BaseTerminalTabComponent.animations,
})
export class BianbuCloudShellTabComponent extends BaseTerminalTabComponent<any> {
  @Input() profile: BianbuCloudProfile
  @Input() asRoot = false
  @Input() cwd = '.'

  constructor (
    injector: Injector,
    private mcp: BianbuMcpService,
    protected localNotifications: NotificationsService,
  ) {
    super(injector)
    this.setTitle('Bianbu Cloud Shell')
    this.icon = 'terminal'
    this.enableToolbar = true
    this.profile = this.profile || {
      id: 'bianbu-cloud-shell',
      type: 'bianbu-cloud',
      name: 'Bianbu Cloud Shell',
      group: 'Bianbu Cloud',
      options: { kind: 'shell' },
      icon: 'terminal',
      color: '#2b6cb0',
      disableDynamicTitle: false,
      behaviorOnSessionEnd: 'keep',
      weight: 0,
      isBuiltin: true,
      isTemplate: false,
    }
  }

  protected async onFrontendReady (): Promise<void> {
    const session = new BianbuShellSession(this.logger, this.mcp)
    this.setSession(session as BaseSession, true)
    await session.start({ cwd: this.cwd, asRoot: this.asRoot })
    session.releaseInitialDataBuffer()
    this.localNotifications.notice('Bianbu Cloud shell ready')
    super.onFrontendReady()
  }
}

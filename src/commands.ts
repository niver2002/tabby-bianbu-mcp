import { Injectable } from '@angular/core'
import { AppService, Command, CommandLocation, CommandProvider } from 'tabby-core'
import { BianbuCloudShellTabComponent } from './shellTab.component'
import { BianbuCloudFilesTabComponent } from './filesTab.component'

/** @hidden */
@Injectable()
export class BianbuCloudCommandProvider extends CommandProvider {
  constructor (
    private app: AppService,
  ) {
    super()
  }

  async provide (): Promise<Command[]> {
    return [
      {
        id: 'bianbu-cloud-shell',
        label: 'Open Bianbu Cloud Shell',
        sublabel: 'Remote shell over MCP run_command',
        locations: [CommandLocation.StartPage],
        run: async () => {
          this.app.openNewTab({ type: BianbuCloudShellTabComponent })
        },
      },
      {
        id: 'bianbu-cloud-files',
        label: 'Open Bianbu Cloud Files',
        sublabel: 'File manager over MCP file tools',
        locations: [CommandLocation.StartPage],
        run: async () => {
          this.app.openNewTab({ type: BianbuCloudFilesTabComponent })
        },
      },
    ]
  }
}

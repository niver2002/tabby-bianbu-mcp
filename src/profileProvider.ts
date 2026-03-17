import { ProfileProvider, Profile, NewTabParameters, BaseTabComponent } from 'tabby-core'
import { BianbuCloudShellTabComponent } from './shellTab.component'
import { BianbuCloudFilesTabComponent } from './filesTab.component'

export interface BianbuCloudProfile extends Profile {
  options: {
    kind: 'shell' | 'files'
  }
}

/** @hidden */
export class BianbuCloudProfileProvider extends ProfileProvider<BianbuCloudProfile> {
  id = 'bianbu-cloud'
  name = 'Bianbu Cloud'
  configDefaults = {}

  async getBuiltinProfiles (): Promise<any[]> {
    return [
      {
        id: 'bianbu-cloud-shell',
        type: 'bianbu-cloud',
        name: 'Bianbu Cloud Shell',
        icon: 'terminal',
        color: '#2b6cb0',
        group: 'Bianbu Cloud',
        disableDynamicTitle: false,
        behaviorOnSessionEnd: 'keep',
        weight: 0,
        isBuiltin: true,
        isTemplate: false,
        options: {
          kind: 'shell',
        },
      },
      {
        id: 'bianbu-cloud-files',
        type: 'bianbu-cloud',
        name: 'Bianbu Cloud Files',
        icon: 'folder-open',
        color: '#0f766e',
        group: 'Bianbu Cloud',
        disableDynamicTitle: true,
        behaviorOnSessionEnd: 'keep',
        weight: 1,
        isBuiltin: true,
        isTemplate: false,
        options: {
          kind: 'files',
        },
      },
    ]
  }

  async getNewTabParameters (profile: BianbuCloudProfile): Promise<NewTabParameters<BaseTabComponent>> {
    if (profile.options.kind === 'files') {
      return {
        type: BianbuCloudFilesTabComponent,
        inputs: { profile },
      }
    }
    return {
      type: BianbuCloudShellTabComponent,
      inputs: { profile },
    }
  }

  getSuggestedName (): string | null {
    return null
  }

  getDescription (profile: any): string {
    if (profile.options?.kind === 'files') {
      return 'Explorer-like file access backed by MCP file tools'
    }
    return 'Terminal-like shell session backed by MCP run_command'
  }
}

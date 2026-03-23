import { ConfigProvider } from 'tabby-core'

/** @hidden */
export class BianbuMcpConfigProvider extends ConfigProvider {
  defaults = {
    bianbuMcp: {
      name: 'bianbu',
      url: '',
      apiKey: '',
      maxRetries: 2,
      retryBaseMs: 1000,
      interactiveConcurrency: 2,
      transferConcurrency: 30,
      workerCadenceMs: 100,
      uploadChunkBytes: 32768,
      downloadChunkBytes: 131072,
      notes: '',
      installerRemotePath: '/tmp/bianbu_agent_proxy.sh',
      maintenanceAsRoot: true,
      reconnectPollMs: 2000,
      upgradeHealthTimeoutMs: 120000,
    },
  }
}

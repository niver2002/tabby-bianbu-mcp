import { ConfigProvider } from 'tabby-core'

/** @hidden */
export class BianbuMcpConfigProvider extends ConfigProvider {
  defaults = {
    bianbuMcp: {
      name: 'bianbu',
      domain: '',
      apiKey: '',
      maxRetries: 2,
      retryBaseMs: 1000,
      interactiveConcurrency: 2,
      transferConcurrency: 30,
      workerCadenceMs: 0,
      uploadChunkBytes: 65536,
      downloadChunkBytes: 262144,
      maxConcurrentFiles: 3,
      notes: '',
      installerRemotePath: '/tmp/bianbu_agent_proxy.sh',
      maintenanceAsRoot: true,
      reconnectPollMs: 2000,
      upgradeHealthTimeoutMs: 120000,
    },
  }
}

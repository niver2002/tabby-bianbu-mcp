import { ConfigProvider } from 'tabby-core'

/** @hidden */
export class BianbuMcpConfigProvider extends ConfigProvider {
  defaults = {
    bianbuMcp: {
      enabled: true,
      name: 'bianbu',
      url: '',
      apiKey: '',
      minIntervalMs: 1000,
      maxRetries: 2,
      retryBaseMs: 1000,
      notes: '',
    },
  }
}

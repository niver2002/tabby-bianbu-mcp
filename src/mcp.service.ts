import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'

interface JsonRpcResponse {
  result?: any
  error?: { code?: number, message?: string }
}

@Injectable()
export class BianbuMcpService {
  private nextAllowedAt = 0

  constructor (
    private config: ConfigService,
  ) { }

  get settings (): any {
    return this.config.store.bianbuMcp
  }

  private sleep (ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private shouldRetryStatus (status: number): boolean {
    return [429, 502, 503, 504].includes(status)
  }

  private async pacedFetch (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const waitMs = Math.max(0, this.nextAllowedAt - Date.now())
    if (waitMs > 0) {
      await this.sleep(waitMs)
    }
    this.nextAllowedAt = Date.now() + (this.settings.minIntervalMs ?? 1000)
    return fetch(input, init)
  }

  private async request (payload: any): Promise<any> {
    const settings = this.settings
    const maxRetries = Number(settings.maxRetries ?? 2)
    const retryBaseMs = Number(settings.retryBaseMs ?? 1000)
    let lastBody = ''
    let lastStatus = 0
    let lastError: any = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.pacedFetch(settings.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2025-11-25',
            'X-API-KEY': settings.apiKey,
          },
          body: JSON.stringify(payload),
        })
        const text = await response.text()
        lastBody = text
        lastStatus = response.status

        if (!this.shouldRetryStatus(response.status)) {
          const parsed = this.parseBody(text)
          if (parsed.error) {
            throw new Error(parsed.error.message || 'MCP error')
          }
          if (parsed.result?.isError && parsed.result?.content?.[0]?.text) {
            throw new Error(parsed.result.content[0].text)
          }
          if (parsed.result?.structuredContent !== undefined) {
            return parsed.result.structuredContent
          }
          return parsed.result
        }
      } catch (error) {
        lastError = error
        if (attempt === maxRetries) {
          break
        }
      }

      if (attempt < maxRetries) {
        await this.sleep(retryBaseMs * (attempt + 1))
      }
    }

    throw lastError || new Error(`MCP request failed with status ${lastStatus}: ${lastBody}`)
  }

  private parseBody (text: string): JsonRpcResponse {
    try {
      return JSON.parse(text)
    } catch {
      const sseMatch = text.match(/data:\s*(\{[\s\S]*\})/)
      if (sseMatch) {
        try {
          return JSON.parse(sseMatch[1])
        } catch {
          // ignore
        }
      }
    }
    return { error: { message: text || 'Invalid MCP response' } }
  }

  async callTool (name: string, args: any): Promise<any> {
    return this.request({
      jsonrpc: '2.0',
      id: `${name}-${Date.now()}`,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    })
  }

  async health (): Promise<any> {
    return this.callTool('health', {})
  }

  async runCommand (command: string, cwd: string, timeoutSeconds: number, asRoot: boolean): Promise<any> {
    return this.callTool('run_command', {
      command,
      cwd,
      timeout_seconds: timeoutSeconds,
      as_root: asRoot,
    })
  }

  async listDirectory (path: string, asRoot: boolean): Promise<any> {
    return this.callTool('list_directory', { path, as_root: asRoot })
  }

  async readTextFile (path: string, maxBytes: number, asRoot: boolean): Promise<any> {
    return this.callTool('read_text_file', {
      path,
      max_bytes: maxBytes,
      encoding: 'utf-8',
      as_root: asRoot,
    })
  }

  async writeTextFile (path: string, content: string, asRoot: boolean): Promise<any> {
    return this.callTool('write_text_file', {
      path,
      content,
      overwrite: true,
      encoding: 'utf-8',
      as_root: asRoot,
    })
  }

  async makeDirectory (path: string, asRoot: boolean): Promise<any> {
    return this.callTool('make_directory', {
      path,
      parents: true,
      as_root: asRoot,
    })
  }

  async deletePath (path: string, recursive: boolean, asRoot: boolean): Promise<any> {
    return this.callTool('delete_path', {
      path,
      recursive,
      as_root: asRoot,
    })
  }

  async uploadBinaryFile (path: string, base64: string, asRoot: boolean): Promise<any> {
    return this.callTool('upload_binary_file', {
      path,
      content_base64: base64,
      overwrite: true,
      as_root: asRoot,
    })
  }

  async downloadBinaryFile (path: string, asRoot: boolean): Promise<any> {
    return this.callTool('download_binary_file', {
      path,
      max_bytes: 64 * 1024 * 1024,
      as_root: asRoot,
    })
  }
}

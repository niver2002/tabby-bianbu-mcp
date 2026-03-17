import { Component, Injector } from '@angular/core'
import { BaseTabComponent, NotificationsService } from 'tabby-core'
import { BianbuMcpService } from './mcp.service'

/** @hidden */
@Component({
  template: require('./filesTab.component.pug'),
})
export class BianbuCloudFilesTabComponent extends BaseTabComponent {
  currentPath = '.'
  asRoot = false
  busy = false
  items: any[] = []
  selectedPath = ''
  selectedContent = ''
  newDirectoryName = ''
  newFileName = ''
  status = 'Ready'

  constructor (
    injector: Injector,
    private mcp: BianbuMcpService,
    private notifications: NotificationsService,
  ) {
    super(injector)
    this.setTitle('Bianbu Cloud Files')
    this.icon = 'folder-open'
  }

  ngOnInit (): void {
    this.refresh().catch(() => null)
  }

  async refresh (): Promise<void> {
    this.busy = true
    this.status = 'Loading directory…'
    this.setProgress(0.3)
    try {
      const result = await this.mcp.listDirectory(this.currentPath || '.', this.asRoot)
      this.items = result.items || []
      this.status = `Loaded ${this.items.length} item(s)`
    } catch (error: any) {
      this.notifications.error('Failed to list directory', String(error?.message || error))
      this.status = String(error?.message || error)
    } finally {
      this.busy = false
      this.setProgress(null)
    }
  }

  async openItem (item: any): Promise<void> {
    if (item.is_dir) {
      this.currentPath = item.path
      this.selectedPath = ''
      this.selectedContent = ''
      await this.refresh()
      return
    }

    this.busy = true
    this.status = `Reading ${item.path}`
    try {
      const result = await this.mcp.readTextFile(item.path, 512 * 1024, this.asRoot)
      this.selectedPath = item.path
      this.selectedContent = result.content || ''
      this.status = `Opened ${item.path}`
    } catch (error: any) {
      this.notifications.error('Failed to open file', String(error?.message || error))
      this.status = String(error?.message || error)
    } finally {
      this.busy = false
    }
  }

  async saveSelected (): Promise<void> {
    if (!this.selectedPath) {
      return
    }
    this.busy = true
    this.status = `Saving ${this.selectedPath}`
    try {
      await this.mcp.writeTextFile(this.selectedPath, this.selectedContent, this.asRoot)
      this.notifications.notice('File saved')
      this.status = `Saved ${this.selectedPath}`
      await this.refresh()
    } catch (error: any) {
      this.notifications.error('Failed to save file', String(error?.message || error))
      this.status = String(error?.message || error)
    } finally {
      this.busy = false
    }
  }

  async createDirectory (): Promise<void> {
    if (!this.newDirectoryName.trim()) {
      return
    }
    const path = this.joinPath(this.currentPath, this.newDirectoryName.trim())
    this.busy = true
    try {
      await this.mcp.makeDirectory(path, this.asRoot)
      this.newDirectoryName = ''
      await this.refresh()
      this.notifications.notice('Directory created')
    } catch (error: any) {
      this.notifications.error('Failed to create directory', String(error?.message || error))
      this.status = String(error?.message || error)
    } finally {
      this.busy = false
    }
  }

  async createFile (): Promise<void> {
    if (!this.newFileName.trim()) {
      return
    }
    const path = this.joinPath(this.currentPath, this.newFileName.trim())
    this.busy = true
    try {
      await this.mcp.writeTextFile(path, '', this.asRoot)
      this.newFileName = ''
      await this.refresh()
      this.notifications.notice('File created')
    } catch (error: any) {
      this.notifications.error('Failed to create file', String(error?.message || error))
      this.status = String(error?.message || error)
    } finally {
      this.busy = false
    }
  }

  async deleteItem (item: any): Promise<void> {
    this.busy = true
    try {
      await this.mcp.deletePath(item.path, !!item.is_dir, this.asRoot)
      if (this.selectedPath === item.path) {
        this.selectedPath = ''
        this.selectedContent = ''
      }
      await this.refresh()
      this.notifications.notice('Path deleted')
    } catch (error: any) {
      this.notifications.error('Failed to delete path', String(error?.message || error))
      this.status = String(error?.message || error)
    } finally {
      this.busy = false
    }
  }

  async uploadFile (event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) {
      return
    }
    this.busy = true
    try {
      const base64 = await this.readFileAsBase64(file)
      const path = this.joinPath(this.currentPath, file.name)
      await this.mcp.uploadBinaryFile(path, base64, this.asRoot)
      this.notifications.notice('File uploaded')
      await this.refresh()
    } catch (error: any) {
      this.notifications.error('Upload failed', String(error?.message || error))
      this.status = String(error?.message || error)
    } finally {
      this.busy = false
      input.value = ''
    }
  }

  async downloadSelected (): Promise<void> {
    if (!this.selectedPath) {
      return
    }
    try {
      const result = await this.mcp.downloadBinaryFile(this.selectedPath, this.asRoot)
      const a = document.createElement('a')
      a.href = `data:application/octet-stream;base64,${result.content_base64}`
      a.download = this.selectedPath.split('/').pop() || 'download.bin'
      a.click()
      this.notifications.notice('Download started')
    } catch (error: any) {
      this.notifications.error('Download failed', String(error?.message || error))
      this.status = String(error?.message || error)
    }
  }

  private joinPath (base: string, child: string): string {
    if (!base || base === '.') {
      return child
    }
    if (base.endsWith('/')) {
      return `${base}${child}`
    }
    return `${base}/${child}`
  }

  private readFileAsBase64 (file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result || '')
        resolve(text.split(',')[1] || '')
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }
}

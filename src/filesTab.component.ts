import { Component, Injector, HostListener } from '@angular/core'
import { BaseTabComponent, NotificationsService } from 'tabby-core'
import { BianbuMcpService } from './mcp.service'

/** @hidden */
@Component({
  template: require('./filesTab.component.pug'),
})
export class BianbuCloudFilesTabComponent extends BaseTabComponent {
  currentPath = '.'
  pathInput = '.'
  asRoot = false
  busy = false
  items: any[] = []
  filteredItems: any[] = []
  selectedPath = ''
  selectedContent = ''
  newDirectoryName = ''
  newFileName = ''
  status = 'Ready'
  dragActive = false
  searchText = ''
  history: string[] = ['.']
  historyIndex = 0
  selectedIndex = -1
  renameTarget = ''
  renameValue = ''

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

  get breadcrumbs (): string[] {
    if (!this.currentPath || this.currentPath === '.') {
      return ['.']
    }
    const normalized = this.currentPath.replace(/\\/g, '/')
    if (normalized === '/') {
      return ['/']
    }
    const parts = normalized.split('/').filter(Boolean)
    return normalized.startsWith('/') ? ['/'].concat(parts) : parts
  }

  get selectedItem (): any | null {
    return this.filteredItems[this.selectedIndex] ?? null
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown (event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    const tag = target?.tagName?.toLowerCase()
    const editing = ['input', 'textarea'].includes(tag || '')

    if (event.key === 'F5') {
      event.preventDefault()
      void this.refresh()
      return
    }
    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault()
      this.goUp()
      return
    }
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault()
      this.goBack()
      return
    }
    if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault()
      this.goForward()
      return
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'l') {
      event.preventDefault()
      const el = document.getElementById('bianbu-path-input') as HTMLInputElement | null
      el?.focus()
      el?.select()
      return
    }
    if (editing) {
      return
    }
    if (event.key === 'Backspace') {
      event.preventDefault()
      this.goUp()
      return
    }
    if (event.key === 'Delete' && this.selectedItem) {
      event.preventDefault()
      void this.deleteItem(this.selectedItem)
      return
    }
    if (event.key === 'F2' && this.selectedItem) {
      event.preventDefault()
      this.startRename(this.selectedItem)
      return
    }
    if (event.key === 'Enter' && this.selectedItem) {
      event.preventDefault()
      void this.openItem(this.selectedItem)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.moveSelection(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.moveSelection(-1)
      return
    }
  }

  async refresh (): Promise<void> {
    this.busy = true
    this.status = 'Loading directory…'
    this.pathInput = this.currentPath
    this.setProgress(0.3)
    try {
      const result = await this.mcp.listDirectory(this.currentPath || '.', this.asRoot)
      this.items = result.items || []
      this.applyFilter()
      this.status = `Loaded ${this.items.length} item(s)`
      if (this.filteredItems.length && this.selectedIndex < 0) {
        this.selectedIndex = 0
      }
    } catch (error: any) {
      this.notifications.error('Failed to list directory', String(error?.message || error))
      this.status = String(error?.message || error)
    } finally {
      this.busy = false
      this.setProgress(null)
    }
  }

  applyFilter (): void {
    const q = this.searchText.trim().toLowerCase()
    this.filteredItems = this.items.filter(item => !q || item.path.toLowerCase().includes(q))
    if (this.selectedIndex >= this.filteredItems.length) {
      this.selectedIndex = this.filteredItems.length - 1
    }
  }

  async navigateToInput (): Promise<void> {
    this.navigate(this.pathInput || '.')
  }

  navigate (path: string, pushHistory = true): void {
    this.currentPath = path || '.'
    this.pathInput = this.currentPath
    if (pushHistory) {
      this.history = this.history.slice(0, this.historyIndex + 1)
      this.history.push(this.currentPath)
      this.historyIndex = this.history.length - 1
    }
    this.selectedPath = ''
    this.selectedContent = ''
    this.selectedIndex = -1
    void this.refresh()
  }

  navigateBreadcrumb (index: number): void {
    if (this.currentPath === '.' && index === 0) {
      this.navigate('.', true)
      return
    }
    const crumbs = this.breadcrumbs
    if (crumbs[0] === '/') {
      if (index === 0) {
        this.navigate('/', true)
        return
      }
      this.navigate('/' + crumbs.slice(1, index + 1).join('/'), true)
      return
    }
    this.navigate(crumbs.slice(0, index + 1).join('/'), true)
  }

  goBack (): void {
    if (this.historyIndex <= 0) {
      return
    }
    this.historyIndex -= 1
    this.navigate(this.history[this.historyIndex], false)
  }

  goForward (): void {
    if (this.historyIndex >= this.history.length - 1) {
      return
    }
    this.historyIndex += 1
    this.navigate(this.history[this.historyIndex], false)
  }

  goUp (): void {
    if (this.currentPath === '.' || this.currentPath === '/') {
      return
    }
    const normalized = this.currentPath.replace(/\\/g, '/')
    const parent = normalized.split('/').slice(0, -1).join('/') || (normalized.startsWith('/') ? '/' : '.')
    this.navigate(parent, true)
  }

  moveSelection (delta: number): void {
    if (!this.filteredItems.length) {
      this.selectedIndex = -1
      return
    }
    if (this.selectedIndex < 0) {
      this.selectedIndex = 0
      return
    }
    this.selectedIndex = Math.max(0, Math.min(this.filteredItems.length - 1, this.selectedIndex + delta))
  }

  selectItem (item: any): void {
    this.selectedIndex = this.filteredItems.indexOf(item)
  }

  async openItem (item: any): Promise<void> {
    this.selectItem(item)
    if (item.is_dir) {
      this.navigate(item.path, true)
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

  startRename (item: any): void {
    this.renameTarget = item.path
    this.renameValue = item.path.split('/').pop() || item.path
  }

  cancelRename (): void {
    this.renameTarget = ''
    this.renameValue = ''
  }

  async commitRename (item: any): Promise<void> {
    if (!this.renameTarget || !this.renameValue.trim()) {
      this.cancelRename()
      return
    }
    const parent = item.path.split('/').slice(0, -1).join('/') || '.'
    const newPath = this.joinPath(parent, this.renameValue.trim())
    try {
      if (item.is_dir) {
        await this.mcp.makeDirectory(newPath, this.asRoot)
      } else {
        const content = await this.mcp.readTextFile(item.path, 512 * 1024, this.asRoot)
        await this.mcp.writeTextFile(newPath, content.content || '', this.asRoot)
      }
      await this.mcp.deletePath(item.path, !!item.is_dir, this.asRoot)
      this.notifications.notice('Path renamed')
      this.cancelRename()
      await this.refresh()
    } catch (error: any) {
      this.notifications.error('Rename failed', String(error?.message || error))
      this.status = String(error?.message || error)
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
    await this.uploadDroppedFile(file)
    input.value = ''
  }

  async uploadDroppedFile (file: File): Promise<void> {
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
    }
  }

  onDragOver (event: DragEvent): void {
    event.preventDefault()
    this.dragActive = true
  }

  onDragLeave (): void {
    this.dragActive = false
  }

  async onDrop (event: DragEvent): Promise<void> {
    event.preventDefault()
    this.dragActive = false
    const file = event.dataTransfer?.files?.[0]
    if (!file) {
      return
    }
    await this.uploadDroppedFile(file)
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

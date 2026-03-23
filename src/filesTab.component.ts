import { Component, Injector, HostListener } from '@angular/core'
import { BaseTabComponent, NotificationsService, PlatformService } from 'tabby-core'
import { BianbuMcpService } from './mcp.service'

interface TransferItem {
  id: number
  name: string
  direction: 'upload' | 'download'
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  bytesDone: number
  bytesTotal: number | null
  startedAt: number
  finishedAt?: number
  error?: string
  controller?: AbortController
}

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
  selectedIsText = false
  status = 'Ready'
  dragActive = false
  searchText = ''
  history: string[] = ['.']
  historyIndex = 0
  selectedIndex = -1

  contextMenuVisible = false
  contextMenuX = 0
  contextMenuY = 0
  contextItem: any = null

  promptVisible = false
  promptTitle = ''
  promptPlaceholder = ''
  promptValue = ''
  promptAction: null | 'mkdir' | 'newfile' | 'rename' = null
  promptTarget: any = null

  transfersVisible = true
  transfers: TransferItem[] = []
  private transferSeq = 1
  private transferQueue: Array<() => Promise<void>> = []
  private transferQueueRunning = false

  sortKey: 'name' | 'size' | 'date' | 'type' = 'name'
  sortAsc = true
  selectedIndices = new Set<number>()
  lastClickIndex = -1
  detailPaneVisible = true
  advancedTransfersExpanded = false

  constructor (
    injector: Injector,
    private mcp: BianbuMcpService,
    private notifications: NotificationsService,
    private platform: PlatformService,
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

  @HostListener('document:click')
  onDocumentClick (): void {
    this.hideContextMenu()
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown (event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    const tag = target?.tagName?.toLowerCase()
    const editing = ['input', 'textarea'].includes(tag || '') || this.promptVisible

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
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'n') {
      event.preventDefault()
      this.openCreateDirectoryPrompt()
      return
    }
    if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'n') {
      event.preventDefault()
      this.openCreateFilePrompt()
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
      this.openRenamePrompt(this.selectedItem)
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
    this.setProgress(0.25)
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
    this.filteredItems = this.items.filter(item => {
      const name = this.baseName(item.path).toLowerCase()
      return !q || name.includes(q) || item.path.toLowerCase().includes(q)
    })
    this.sortItems()
    if (this.selectedIndex >= this.filteredItems.length) {
      this.selectedIndex = this.filteredItems.length - 1
    }
  }

  sortItems (): void {
    this.filteredItems.sort((a: any, b: any) => {
      if (a.is_dir && !b.is_dir) return -1
      if (!a.is_dir && b.is_dir) return 1
      let cmp = 0
      switch (this.sortKey) {
        case 'name': cmp = this.baseName(a.path).localeCompare(this.baseName(b.path)); break
        case 'size': cmp = (a.size || 0) - (b.size || 0); break
        case 'date': cmp = (a.modified || '').localeCompare(b.modified || ''); break
        case 'type': {
          const ea = a.is_dir ? '' : (a.path.split('.').pop() || '')
          const eb = b.is_dir ? '' : (b.path.split('.').pop() || '')
          cmp = ea.localeCompare(eb)
          break
        }
      }
      return this.sortAsc ? cmp : -cmp
    })
  }

  navigateToInput (): void {
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
    this.clearPreview()
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

  selectItem (item: any, event?: MouseEvent): void {
    const idx = this.filteredItems.indexOf(item)
    if (event?.ctrlKey || event?.metaKey) {
      if (this.selectedIndices.has(idx)) { this.selectedIndices.delete(idx) }
      else { this.selectedIndices.add(idx) }
    } else if (event?.shiftKey && this.lastClickIndex >= 0) {
      const lo = Math.min(this.lastClickIndex, idx)
      const hi = Math.max(this.lastClickIndex, idx)
      for (let i = lo; i <= hi; i++) { this.selectedIndices.add(i) }
    } else {
      this.selectedIndices.clear()
      this.selectedIndices.add(idx)
    }
    this.lastClickIndex = idx
    this.selectedIndex = idx
  }

  async openItem (item: any): Promise<void> {
    this.selectItem(item)
    if (item.is_dir) {
      this.navigate(item.path, true)
      return
    }

    this.busy = true
    this.status = `Opening ${item.path}`
    this.selectedPath = item.path
    this.selectedIsText = this.isTextLike(item.path)
    try {
      if (this.selectedIsText) {
        const result = await this.mcp.readTextFile(item.path, 512 * 1024, this.asRoot)
        this.selectedContent = result.content || ''
        this.status = `Opened ${item.path}`
      } else {
        this.selectedContent = ''
        this.status = `Binary / non-text file selected: ${item.path}`
      }
    } catch (error: any) {
      this.notifications.error('Failed to open file', String(error?.message || error))
      this.status = String(error?.message || error)
      this.selectedContent = ''
    } finally {
      this.busy = false
    }
  }

  async saveSelected (): Promise<void> {
    if (!this.selectedPath || !this.selectedIsText) {
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

  openCreateDirectoryPrompt (): void {
    this.promptVisible = true
    this.promptTitle = 'Create new folder'
    this.promptPlaceholder = 'Folder name'
    this.promptValue = ''
    this.promptAction = 'mkdir'
    this.promptTarget = null
  }

  openCreateFilePrompt (): void {
    this.promptVisible = true
    this.promptTitle = 'Create new file'
    this.promptPlaceholder = 'File name'
    this.promptValue = ''
    this.promptAction = 'newfile'
    this.promptTarget = null
  }

  openRenamePrompt (item: any): void {
    this.promptVisible = true
    this.promptTitle = 'Rename'
    this.promptPlaceholder = 'New name'
    this.promptValue = this.baseName(item.path)
    this.promptAction = 'rename'
    this.promptTarget = item
  }

  closePrompt (): void {
    this.promptVisible = false
    this.promptAction = null
    this.promptTarget = null
    this.promptValue = ''
  }

  async confirmPrompt (): Promise<void> {
    const value = this.promptValue.trim()
    if (!value || !this.promptAction) {
      this.closePrompt()
      return
    }

    if (this.promptAction === 'mkdir') {
      await this.createDirectory(value)
      this.closePrompt()
      return
    }
    if (this.promptAction === 'newfile') {
      await this.createFile(value)
      this.closePrompt()
      return
    }
    if (this.promptAction === 'rename' && this.promptTarget) {
      await this.renameItem(this.promptTarget, value)
      this.closePrompt()
    }
  }

  async createDirectory (name: string): Promise<void> {
    const path = this.joinPath(this.currentPath, name)
    this.busy = true
    try {
      await this.mcp.makeDirectory(path, this.asRoot)
      await this.refresh()
      this.notifications.notice('Directory created')
    } catch (error: any) {
      this.notifications.error('Failed to create directory', String(error?.message || error))
      this.status = String(error?.message || error)
    } finally {
      this.busy = false
    }
  }

  async createFile (name: string): Promise<void> {
    const path = this.joinPath(this.currentPath, name)
    this.busy = true
    try {
      await this.mcp.writeTextFile(path, '', this.asRoot)
      await this.refresh()
      this.notifications.notice('File created')
    } catch (error: any) {
      this.notifications.error('Failed to create file', String(error?.message || error))
      this.status = String(error?.message || error)
    } finally {
      this.busy = false
    }
  }

  async renameItem (item: any, name: string): Promise<void> {
    const parent = item.path.split('/').slice(0, -1).join('/') || '.'
    const newPath = this.joinPath(parent, name)
    try {
      await this.mcp.renamePath(item.path, newPath, this.asRoot)
      this.notifications.notice('Path renamed')
      if (this.selectedPath === item.path) {
        this.selectedPath = newPath
      }
      await this.refresh()
    } catch (error: any) {
      const message = String(error?.message || error)
      this.notifications.error('Rename failed', message)
      this.status = message
    }
  }

  async deleteItem (item: any): Promise<void> {
    this.busy = true
    try {
      await this.mcp.deletePath(item.path, !!item.is_dir, this.asRoot)
      if (this.selectedPath === item.path) {
        this.clearPreview()
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

  showContextMenu (event: MouseEvent, item: any): void {
    event.preventDefault()
    event.stopPropagation()
    this.selectItem(item)
    this.contextItem = item
    this.contextMenuVisible = true
    this.contextMenuX = event.clientX
    this.contextMenuY = event.clientY
  }

  hideContextMenu (): void {
    this.contextMenuVisible = false
    this.contextItem = null
  }

  async uploadFile (event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files || [])
    if (!files.length) {
      return
    }
    for (const file of files) {
      this.enqueueUpload(file)
    }
    input.value = ''
  }

  private createTransfer (name: string, direction: 'upload' | 'download', total: number | null, controller: AbortController, status: TransferItem['status'] = 'queued'): TransferItem {
    const transfer: TransferItem = {
      id: this.transferSeq++,
      name,
      direction,
      status,
      bytesDone: 0,
      bytesTotal: total,
      startedAt: Date.now(),
      controller,
    }
    return transfer
  }

  cancelTransfer (transfer: TransferItem): void {
    if (transfer.status !== 'running' && transfer.status !== 'queued') {
      return
    }
    transfer.controller?.abort()
    transfer.status = 'cancelled'
    transfer.finishedAt = Date.now()
  }

  transferPercent (transfer: TransferItem): number | null {
    if (!transfer.bytesTotal) {
      return null
    }
    return Math.max(0, Math.min(100, Math.round((transfer.bytesDone / transfer.bytesTotal) * 100)))
  }

  transferRate (transfer: TransferItem): string {
    const end = transfer.finishedAt || Date.now()
    const seconds = Math.max(1, (end - transfer.startedAt) / 1000)
    const bytes = transfer.bytesDone || 0
    return `${Math.round(bytes / seconds / 1024)} KB/s`
  }

  async uploadDroppedFile (file: File): Promise<void> {
    this.enqueueUpload(file)
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
    const files = Array.from(event.dataTransfer?.files || [])
    if (!files.length) {
      return
    }
    for (const file of files) {
      this.enqueueUpload(file)
    }
  }

  async downloadSelected (): Promise<void> {
    if (!this.selectedPath) {
      return
    }
    this.enqueueDownload(this.selectedPath)
  }

  private enqueueUpload (file: File): void {
    const controller = new AbortController()
    const transfer = this.createTransfer(file.name, 'upload', file.size, controller, 'queued')
    this.queueTransferJob(transfer, () => this.runUploadTransfer(file, transfer))
  }

  private enqueueDownload (remotePath: string): void {
    const controller = new AbortController()
    const transfer = this.createTransfer(this.baseName(remotePath), 'download', null, controller, 'queued')
    this.queueTransferJob(transfer, () => this.runDownloadTransfer(remotePath, transfer))
  }

  private queueTransferJob (transfer: TransferItem, run: () => Promise<void>): void {
    this.transfers.unshift(transfer)
    this.transferQueue.push(async () => {
      if (transfer.status === 'cancelled') {
        return
      }
      transfer.status = 'running'
      transfer.startedAt = Date.now()
      await run()
    })
    void this.pumpTransferQueue()
  }

  private async pumpTransferQueue (): Promise<void> {
    if (this.transferQueueRunning) {
      return
    }
    this.transferQueueRunning = true
    try {
      const maxConcurrent = Math.max(1, Number(this.mcp.settings.maxConcurrentFiles ?? 3))
      const active: Promise<void>[] = []
      const drain = async (): Promise<void> => {
        while (this.transferQueue.length || active.length) {
          while (active.length < maxConcurrent && this.transferQueue.length) {
            const job = this.transferQueue.shift()
            if (!job) continue
            const p = job().finally(() => {
              const idx = active.indexOf(p)
              if (idx >= 0) active.splice(idx, 1)
            })
            active.push(p)
          }
          if (active.length) await Promise.race(active)
        }
      }
      await drain()
    } finally {
      this.transferQueueRunning = false
    }
  }

  private async runUploadTransfer (file: File, transfer: TransferItem): Promise<void> {
    let session: any = null
    try {
      const remotePath = this.joinPath(this.currentPath, file.name)
      const chunkBytes = Math.max(16 * 1024, Number(this.mcp.settings.uploadChunkBytes ?? 32 * 1024))
      const workerCount = Math.max(1, Math.min(Number(this.mcp.settings.transferConcurrency ?? 30), Math.ceil(file.size / chunkBytes) || 1))
      session = await this.mcp.uploadChunkedBegin(remotePath, this.asRoot, file.size, chunkBytes)
      const offsets: number[] = []
      for (let offset = 0; offset < file.size; offset += chunkBytes) {
        offsets.push(offset)
      }

      let firstError: any = null
      const workers = Array.from({ length: workerCount }, async () => {
        while (!transfer.controller?.signal.aborted) {
          const offset = offsets.shift()
          if (offset === undefined) {
            return
          }
          if (firstError) {
            return
          }
          try {
            const slice = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + chunkBytes)).arrayBuffer())
            await this.mcp.uploadChunkedPart(session.upload_id, this.uint8ToBase64(slice), offset, transfer.controller?.signal)
            transfer.bytesDone += slice.length
          } catch (error: any) {
            firstError = firstError || error
            return
          }
        }
      })

      await Promise.all(workers)
      if (transfer.controller?.signal.aborted) {
        await this.mcp.uploadChunkedAbort(session.upload_id).catch(() => null)
        transfer.status = 'cancelled'
        transfer.finishedAt = Date.now()
        return
      }
      if (firstError) {
        throw firstError
      }
      await this.mcp.uploadChunkedFinish(session.upload_id)
      transfer.bytesDone = file.size
      transfer.status = 'done'
      transfer.finishedAt = Date.now()
      this.notifications.notice(`Uploaded ${file.name}`)
      await this.refresh()
    } catch (error: any) {
      if (session?.upload_id) {
        await this.mcp.uploadChunkedAbort(session.upload_id).catch(() => null)
      }
      if (transfer.status !== 'cancelled') {
        transfer.status = 'error'
        transfer.error = String(error?.message || error)
        transfer.finishedAt = Date.now()
        this.notifications.error('Upload failed', transfer.error)
        this.status = transfer.error
      }
    }
  }

  private async runDownloadTransfer (remotePath: string, transfer: TransferItem): Promise<void> {
    let session: any = null
    let sink: any = null
    try {
      const chunkBytes = Math.max(16 * 1024, Number(this.mcp.settings.downloadChunkBytes ?? 128 * 1024))
      session = await this.mcp.downloadChunkedBegin(remotePath, this.asRoot, chunkBytes)
      transfer.bytesTotal = session.total_size
      sink = await this.platform.startDownload(this.baseName(remotePath) || 'download.bin', 0o644, session.total_size || 0)
      if (!sink) {
        transfer.status = 'cancelled'
        transfer.finishedAt = Date.now()
        await this.mcp.downloadChunkedClose(session.download_id).catch(() => null)
        return
      }

      const offsets: number[] = []
      for (let offset = 0; offset < Number(session.total_size || 0); offset += chunkBytes) {
        offsets.push(offset)
      }
      const workerCount = Math.max(1, Math.min(Number(this.mcp.settings.transferConcurrency ?? 30), offsets.length || 1))
      const pending = new Map<number, Uint8Array>()
      let nextWriteOffset = 0
      let firstError: any = null
      let workersFinished = false

      const flushPending = async (): Promise<void> => {
        while (pending.has(nextWriteOffset)) {
          const bytes = pending.get(nextWriteOffset) as Uint8Array
          pending.delete(nextWriteOffset)
          await sink.write(bytes)
          nextWriteOffset += bytes.length
        }
      }

      const flusher = (async (): Promise<void> => {
        while (!workersFinished || pending.size > 0) {
          await flushPending()
          if (!workersFinished || pending.size > 0) {
            await new Promise(r => setTimeout(r, 10))
          }
        }
        await flushPending()
      })()

      const workers = Array.from({ length: workerCount }, async () => {
        while (!transfer.controller?.signal.aborted) {
          const offset = offsets.shift()
          if (offset === undefined) {
            return
          }
          if (firstError) {
            return
          }
          try {
            const part = await this.mcp.downloadChunkedPart(session.download_id, offset, chunkBytes, transfer.controller?.signal)
            const bytes = this.base64ToUint8(part.content_base64)
            pending.set(offset, bytes)
            transfer.bytesDone += bytes.length
          } catch (error: any) {
            firstError = firstError || error
            return
          }
        }
      })

      await Promise.all(workers)
      workersFinished = true
      await flusher
      if (transfer.controller?.signal.aborted) {
        await this.mcp.downloadChunkedClose(session.download_id).catch(() => null)
        sink.close()
        transfer.status = 'cancelled'
        transfer.finishedAt = Date.now()
        return
      }
      if (firstError) {
        throw firstError
      }
      await this.mcp.downloadChunkedClose(session.download_id)
      sink.close()
      transfer.status = 'done'
      transfer.finishedAt = Date.now()
      this.notifications.notice(`Downloaded ${this.baseName(remotePath)}`)
    } catch (error: any) {
      sink?.close?.()
      if (session?.download_id) {
        await this.mcp.downloadChunkedClose(session.download_id).catch(() => null)
      }
      if (transfer.status !== 'cancelled') {
        transfer.status = 'error'
        transfer.error = String(error?.message || error)
        transfer.finishedAt = Date.now()
        this.notifications.error('Download failed', transfer.error)
        this.status = transfer.error
      }
    }
  }

  formatSize (bytes: number | null | undefined): string {
    if (bytes == null) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
    return `${(bytes / 1073741824).toFixed(2)} GB`
  }

  formatDate (iso: string | null | undefined): string {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return '—'
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    } catch { return '—' }
  }

  fileIcon (item: any): string {
    if (item.is_dir) return '📁'
    const ext = (item.path.split('.').pop() || '').toLowerCase()
    const icons: Record<string, string> = {
      js: '📜', ts: '📜', mjs: '📜', jsx: '📜', tsx: '📜',
      py: '🐍', sh: '⚙️', bash: '⚙️',
      json: '📋', yaml: '📋', yml: '📋', toml: '📋', xml: '📋',
      md: '📝', txt: '📄', csv: '📊',
      html: '🌐', css: '🎨', scss: '🎨',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️', ico: '🖼️',
      zip: '📦', tar: '📦', gz: '📦', bz2: '📦', xz: '📦', '7z': '📦', rar: '📦',
      pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙',
      mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
      mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬', webm: '🎬',
      c: '📜', cpp: '📜', h: '📜', hpp: '📜', java: '📜', go: '📜', rs: '📜', rb: '📜', php: '📜',
      sql: '🗃️', db: '🗃️', sqlite: '🗃️',
      log: '📃', ini: '⚙️', cfg: '⚙️', conf: '⚙️', env: '🔒',
      key: '🔑', pem: '🔑', crt: '🔑',
    }
    return icons[ext] || '📄'
  }

  fileType (item: any): string {
    if (item.is_dir) return 'Folder'
    const ext = (item.path.split('.').pop() || '').toLowerCase()
    if (!ext || ext === item.path) return 'File'
    return ext.toUpperCase()
  }

  toggleSort (key: 'name' | 'size' | 'date' | 'type'): void {
    if (this.sortKey === key) {
      this.sortAsc = !this.sortAsc
    } else {
      this.sortKey = key
      this.sortAsc = true
    }
    this.sortItems()
  }

  sortIndicator (key: string): string {
    if (this.sortKey !== key) return ''
    return this.sortAsc ? ' ▲' : ' ▼'
  }

  get totalSize (): string {
    const total = this.filteredItems.reduce((sum: number, item: any) => sum + (item.size || 0), 0)
    return this.formatSize(total)
  }

  get selectionSummary (): string {
    const count = this.selectedIndices.size
    if (count <= 1) return ''
    return `${count} selected`
  }

  isSelected (index: number): boolean {
    return this.selectedIndices.has(index)
  }

  get activeTransferLabel (): string {
    let count = 0
    for (const t of this.transfers) {
      if (t.status === 'running' || t.status === 'queued') count++
    }
    return count ? '\u2B06\u2B07 ' + count + ' active' : '\u2713 Transfers done'
  }

  toggleDetailPane (): void {
    this.detailPaneVisible = !this.detailPaneVisible
  }

  private clearPreview (): void {
    this.selectedPath = ''
    this.selectedContent = ''
    this.selectedIsText = false
  }

  baseName (path: string): string {
    return path.split('/').pop() || path
  }

  private isTextLike (path: string): boolean {
    const name = path.toLowerCase()
    const exts = ['.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.ini', '.cfg', '.conf', '.log', '.sh', '.py', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.scss', '.c', '.cpp', '.h', '.hpp', '.java', '.go', '.rs', '.sql']
    return exts.some(ext => name.endsWith(ext))
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

  private uint8ToBase64 (bytes: Uint8Array): string {
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }

  private base64ToUint8 (base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

}

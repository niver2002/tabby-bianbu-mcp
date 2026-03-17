import { Injector } from '@angular/core';
import { BaseTabComponent, NotificationsService } from 'tabby-core';
import { BianbuMcpService } from './mcp.service';
/** @hidden */
export declare class BianbuCloudFilesTabComponent extends BaseTabComponent {
    private mcp;
    private notifications;
    currentPath: string;
    asRoot: boolean;
    busy: boolean;
    items: any[];
    selectedPath: string;
    selectedContent: string;
    newDirectoryName: string;
    newFileName: string;
    status: string;
    constructor(injector: Injector, mcp: BianbuMcpService, notifications: NotificationsService);
    ngOnInit(): void;
    refresh(): Promise<void>;
    openItem(item: any): Promise<void>;
    saveSelected(): Promise<void>;
    createDirectory(): Promise<void>;
    createFile(): Promise<void>;
    deleteItem(item: any): Promise<void>;
    uploadFile(event: Event): Promise<void>;
    downloadSelected(): Promise<void>;
    private joinPath;
    private readFileAsBase64;
}

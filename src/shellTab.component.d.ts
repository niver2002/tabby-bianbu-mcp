import { Injector } from '@angular/core';
import { BaseTabComponent, NotificationsService } from 'tabby-core';
import { BianbuMcpService } from './mcp.service';
interface ShellEntry {
    command: string;
    cwd: string;
    asRoot: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    ok: boolean;
    time: string;
}
/** @hidden */
export declare class BianbuCloudShellTabComponent extends BaseTabComponent {
    private mcp;
    private notifications;
    presetCommand: string;
    command: string;
    cwd: string;
    timeoutSeconds: number;
    asRoot: boolean;
    busy: boolean;
    entries: ShellEntry[];
    constructor(injector: Injector, mcp: BianbuMcpService, notifications: NotificationsService);
    ngOnInit(): void;
    run(): Promise<void>;
    clear(): void;
}
export {};

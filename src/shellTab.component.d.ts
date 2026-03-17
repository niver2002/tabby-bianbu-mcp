import { Injector } from '@angular/core';
import { BaseTerminalTabComponent } from 'tabby-terminal';
import { NotificationsService } from 'tabby-core';
import { BianbuMcpService } from './mcp.service';
import { BianbuCloudProfile } from './profileProvider';
/** @hidden */
export declare class BianbuCloudShellTabComponent extends BaseTerminalTabComponent<any> {
    private mcp;
    protected localNotifications: NotificationsService;
    profile: BianbuCloudProfile;
    asRoot: boolean;
    cwd: string;
    constructor(injector: Injector, mcp: BianbuMcpService, localNotifications: NotificationsService);
    protected onFrontendReady(): Promise<void>;
}

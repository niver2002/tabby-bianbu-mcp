import { AppService, ConfigService } from 'tabby-core';
/** @hidden */
export declare class BianbuMcpSettingsComponent {
    config: ConfigService;
    private app;
    constructor(config: ConfigService, app: AppService);
    get sampleJson(): string;
    save(): void;
    openShell(): void;
    openFiles(): void;
}

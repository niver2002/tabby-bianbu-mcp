import { ConfigService } from 'tabby-core';
/** @hidden */
export declare class BianbuMcpSettingsComponent {
    config: ConfigService;
    constructor(config: ConfigService);
    get sampleJson(): string;
    save(): void;
}

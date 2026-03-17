import { ConfigProvider } from 'tabby-core';
/** @hidden */
export declare class BianbuMcpConfigProvider extends ConfigProvider {
    defaults: {
        bianbuMcp: {
            enabled: boolean;
            name: string;
            url: string;
            apiKey: string;
            minIntervalMs: number;
            maxRetries: number;
            retryBaseMs: number;
            notes: string;
        };
    };
}

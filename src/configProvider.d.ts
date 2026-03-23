import { ConfigProvider } from 'tabby-core';
/** @hidden */
export declare class BianbuMcpConfigProvider extends ConfigProvider {
    defaults: {
        bianbuMcp: {
            name: string;
            url: string;
            apiKey: string;
            maxRetries: number;
            retryBaseMs: number;
            interactiveConcurrency: number;
            transferConcurrency: number;
            workerCadenceMs: number;
            uploadChunkBytes: number;
            downloadChunkBytes: number;
            notes: string;
            installerRemotePath: string;
            maintenanceAsRoot: boolean;
            reconnectPollMs: number;
            upgradeHealthTimeoutMs: number;
        };
    };
}

import { ConfigService } from 'tabby-core';
export declare class BianbuMcpService {
    private config;
    private nextAllowedAt;
    constructor(config: ConfigService);
    get settings(): any;
    private sleep;
    private shouldRetryStatus;
    private pacedFetch;
    private request;
    private parseBody;
    callTool(name: string, args: any): Promise<any>;
    health(): Promise<any>;
    runCommand(command: string, cwd: string, timeoutSeconds: number, asRoot: boolean): Promise<any>;
    listDirectory(path: string, asRoot: boolean): Promise<any>;
    readTextFile(path: string, maxBytes: number, asRoot: boolean): Promise<any>;
    writeTextFile(path: string, content: string, asRoot: boolean): Promise<any>;
    makeDirectory(path: string, asRoot: boolean): Promise<any>;
    deletePath(path: string, recursive: boolean, asRoot: boolean): Promise<any>;
    uploadBinaryFile(path: string, base64: string, asRoot: boolean): Promise<any>;
    downloadBinaryFile(path: string, asRoot: boolean): Promise<any>;
}

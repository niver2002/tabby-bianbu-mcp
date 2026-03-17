/// <reference types="node" />
/// <reference types="node" />
import { BaseSession } from 'tabby-terminal';
import { Logger } from 'tabby-core';
import { BianbuMcpService } from './mcp.service';
export declare class BianbuShellSession extends BaseSession {
    private mcp;
    private cwd;
    private currentLine;
    private running;
    private asRoot;
    constructor(logger: Logger, mcp: BianbuMcpService);
    start(options: any): Promise<void>;
    resize(_columns: number, _rows: number): void;
    write(data: Buffer): void;
    kill(): void;
    gracefullyKillProcess(): Promise<void>;
    supportsWorkingDirectory(): boolean;
    getWorkingDirectory(): Promise<string | null>;
    private handleChar;
    private execute;
    private extractLastDirectory;
    private emitPrompt;
    private emitText;
    private normalize;
}

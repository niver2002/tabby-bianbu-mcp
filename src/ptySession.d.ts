/// <reference types="node" />
/// <reference types="node" />
import { BaseSession } from 'tabby-terminal';
import { Logger } from 'tabby-core';
import { BianbuMcpService } from './mcp.service';
export declare class BianbuPtySession extends BaseSession {
    private mcp;
    private sessionId;
    private alive;
    private pollAbort;
    private inputQueue;
    private inputFlushTimer;
    private initialCols;
    private initialRows;
    private lastCols;
    private lastRows;
    private resizeTimer;
    constructor(logger: Logger, mcp: BianbuMcpService);
    start(options?: {
        cwd?: string;
        asRoot?: boolean;
        cols?: number;
        rows?: number;
    }): Promise<void>;
    write(data: Buffer): void;
    resize(columns: number, rows: number): void;
    kill(): void;
    gracefullyKillProcess(): Promise<void>;
    supportsWorkingDirectory(): boolean;
    getWorkingDirectory(): Promise<string | null>;
    destroy(): Promise<void>;
    private flushInput;
    private startPollLoop;
    private pollLoop;
    private cleanup;
}

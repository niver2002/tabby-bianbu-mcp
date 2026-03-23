/// <reference types="node" />
/// <reference types="node" />
import { BaseSession } from 'tabby-terminal';
import { Logger } from 'tabby-core';
import { BianbuMcpService } from './mcp.service';
export declare class BianbuShellSession extends BaseSession {
    private mcp;
    private cwd;
    private currentLine;
    private cursorPos;
    private running;
    private asRoot;
    private sessionId;
    private history;
    private historyIndex;
    private savedLine;
    private escBuffer;
    private escTimer;
    constructor(logger: Logger, mcp: BianbuMcpService);
    start(options?: {
        cwd?: string;
        asRoot?: boolean;
    }): Promise<void>;
    resize(_columns: number, _rows: number): void;
    write(data: Buffer): void;
    kill(): void;
    gracefullyKillProcess(): Promise<void>;
    destroy(): Promise<void>;
    supportsWorkingDirectory(): boolean;
    getWorkingDirectory(): Promise<string | null>;
    private handleChar;
    private handleEscSequence;
    private navigateHistory;
    private addToHistory;
    private redrawLine;
    private execute;
    private closeRemoteSession;
    private getPrompt;
    private emitPrompt;
    private emitText;
    private normalize;
}

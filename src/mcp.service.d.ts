import { ConfigService } from 'tabby-core';
import { RemoteHealthInfo, RemoteInstallerAsset } from './remoteRelease';
import { LogDownloadPayload, SessionLog } from './sessionLogs';
export interface MaintenanceProgress {
    step: 'upload' | 'launch' | 'wait' | 'verify';
    stepIndex: number;
    totalSteps: number;
    label: string;
    percent: number;
    detail?: string;
    error?: boolean;
}
interface PushInstallerAndUpgradeOptions {
    action?: 'bootstrap' | 'repair' | 'up';
    asRoot?: boolean;
    healthTimeoutMs?: number;
    onProgress?: (p: MaintenanceProgress) => void;
    reconnectPollMs?: number;
    remotePath?: string;
    signal?: AbortSignal;
}
type LaneKind = 'interactive' | 'transfer';
export declare class BianbuMcpService {
    private config;
    private bundledInstallerCache;
    private interactiveLane;
    private latestMaintenanceSessionValue;
    private transferLane;
    private schedulerKey;
    constructor(config: ConfigService);
    get settings(): any;
    get validationErrors(): string[];
    get bundledInstaller(): RemoteInstallerAsset;
    get normalizedUrl(): string;
    get latestMaintenanceSession(): SessionLog | null;
    private ensureScheduler;
    private sleep;
    private isMissingPathError;
    private readRemoteTextIfExists;
    private readRemoteLogSnippet;
    private createMaintenanceSession;
    private logSession;
    getLatestMaintenanceLocalLogDownloadPayload(): LogDownloadPayload;
    getLatestMaintenanceRemoteLogDownloadPayload(): Promise<LogDownloadPayload>;
    private shouldRetryStatus;
    private parseBody;
    private laneForTool;
    private executeRequest;
    private request;
    callTool(name: string, args: any, signal?: AbortSignal, laneKind?: LaneKind): Promise<any>;
    healthRaw(signal?: AbortSignal): Promise<any>;
    getHealth(signal?: AbortSignal): Promise<RemoteHealthInfo>;
    health(): Promise<any>;
    runCommand(command: string, cwd: string, timeoutSeconds: number, asRoot: boolean): Promise<any>;
    openShellSession(cwd: string, asRoot: boolean): Promise<any>;
    execShellSession(sessionId: string, command: string, timeoutSeconds: number): Promise<any>;
    closeShellSession(sessionId: string): Promise<any>;
    openPtySession(cwd: string, asRoot: boolean, cols: number, rows: number): Promise<any>;
    writePtyInput(sessionId: string, dataBase64: string): Promise<any>;
    /**
     * Read PTY output via long-poll. Bypasses the RequestLane to avoid
     * blocking the interactive lane for up to 5 seconds per poll cycle.
     */
    readPtyOutputDirect(sessionId: string, signal?: AbortSignal): Promise<any>;
    resizePty(sessionId: string, cols: number, rows: number): Promise<any>;
    closePtySession(sessionId: string): Promise<any>;
    /**
     * All PTY calls bypass the RequestLane to avoid queuing behind other
     * operations. This is critical for input latency (write_pty_input)
     * and for long-poll reads that would otherwise block the lane.
     */
    private executePtyRequest;
    listDirectory(path: string, asRoot: boolean): Promise<any>;
    readTextFile(path: string, maxBytes: number, asRoot: boolean): Promise<any>;
    writeTextFile(path: string, content: string, asRoot: boolean): Promise<any>;
    makeDirectory(path: string, asRoot: boolean): Promise<any>;
    deletePath(path: string, recursive: boolean, asRoot: boolean): Promise<any>;
    renamePath(sourcePath: string, destPath: string, asRoot: boolean): Promise<any>;
    uploadBinaryFile(path: string, base64: string, asRoot: boolean, signal?: AbortSignal): Promise<any>;
    uploadChunkedBegin(path: string, asRoot: boolean, totalSize?: number, chunkBytes?: number): Promise<any>;
    uploadChunkedPart(uploadId: string, contentBase64: string, offset?: number, signal?: AbortSignal): Promise<any>;
    uploadChunkedFinish(uploadId: string): Promise<any>;
    uploadChunkedAbort(uploadId: string): Promise<any>;
    uploadTextViaChunked(path: string, text: string, asRoot: boolean, onChunkProgress?: (bytesSent: number, bytesTotal: number) => void): Promise<void>;
    downloadBinaryFile(path: string, asRoot: boolean, signal?: AbortSignal): Promise<any>;
    downloadChunkedBegin(path: string, asRoot: boolean, chunkBytes?: number): Promise<any>;
    downloadChunkedPart(downloadId: string, offset?: number, chunkBytes?: number, signal?: AbortSignal): Promise<any>;
    downloadChunkedClose(downloadId: string): Promise<any>;
    private waitForHealth;
    private waitForInstallerCompletion;
    pushInstallerAndUpgrade(options?: PushInstallerAndUpgradeOptions): Promise<any>;
}
export {};

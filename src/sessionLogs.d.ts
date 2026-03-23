export type SessionLogLevel = 'info' | 'warn' | 'error';
export type SessionLogStatus = 'running' | 'done' | 'error';
export interface SessionLogEntry {
    details?: string | null;
    level: SessionLogLevel;
    message: string;
    timestamp: string;
}
export interface SessionLog {
    action: string;
    asRoot?: boolean;
    entries: SessionLogEntry[];
    error?: string | null;
    finishedAt?: string | null;
    kind: string;
    remoteLogPath?: string | null;
    remotePath?: string | null;
    remoteStatusPath?: string | null;
    sessionName: string;
    startedAt: string;
    status: SessionLogStatus;
}
export interface SessionLogInit {
    action: string;
    asRoot?: boolean;
    kind: string;
    remoteLogPath?: string | null;
    remotePath?: string | null;
    remoteStatusPath?: string | null;
    sessionName: string;
    startedAt?: string;
}
export interface LogDownloadPayload {
    content: string;
    fileName: string;
}
export interface RemoteLogDownloadOptions {
    downloadedAt?: Date | string;
    remoteLogText?: string | null;
    remoteStatusText?: string | null;
    session: SessionLog;
}
export declare function toIsoUtc(value?: Date | string | undefined): string;
export declare function toCompactUtcStamp(value?: Date | string | undefined): string;
export declare function createSessionName(kind: string, action: string, value?: Date | string | undefined): string;
export declare function createSessionLog(init: SessionLogInit): SessionLog;
export declare function appendSessionLogEntry(session: SessionLog, entry: Omit<SessionLogEntry, 'timestamp'> & {
    timestamp?: string;
}): SessionLogEntry;
export declare function finishSessionLog(session: SessionLog, status: SessionLogStatus, value?: Date | string | undefined, error?: string | null): SessionLog;
export declare function renderLocalSessionLog(session: SessionLog): string;
export declare function buildLocalLogDownloadPayload(session: SessionLog, downloadedAt?: Date | string | undefined): LogDownloadPayload;
export declare function buildRemoteLogDownloadPayload(options: RemoteLogDownloadOptions): LogDownloadPayload;

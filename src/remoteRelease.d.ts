export interface RemoteInstallerMetadata {
    bytes: number;
    fileName: string;
    generatedAt: string;
    scriptVersion: string;
    serverVersion: string;
    sha256: string;
    sourceFile: string;
}
export interface RemoteInstallerAsset {
    metadata: RemoteInstallerMetadata;
    script: string;
}
export interface RemoteInstallerStatus {
    action: string | null;
    exitCode: number | null;
    finishedAt: string | null;
    logPath: string | null;
    ok: boolean;
    raw: any;
    sessionName: string | null;
}
export interface RemoteHealthInfo {
    fileRoot: string | null;
    hasSudo: boolean | null;
    ok: boolean;
    raw: any;
    scriptVersion: string | null;
    serverVersion: string | null;
    supports: {
        chunkedTransfers: boolean;
        parallelChunkOffsets: boolean;
        renamePath: boolean;
        shellSession: boolean;
        rateLimiting: boolean;
        isoTimestamps: boolean;
    };
    tools: string[];
    transportMode: string | null;
}
export declare function normalizeMcpUrl(value: string): string;
export declare function validateConnectionSettings(settings: any): string[];
export declare function shellQuote(value: string): string;
export declare function remoteDirName(remotePath: string): string;
export declare function appendRemoteSuffix(remotePath: string, suffix: string): string;
export declare function remoteInstallerLogPath(remotePath: string): string;
export declare function remoteInstallerStatusPath(remotePath: string): string;
export declare function buildDetachedInstallerCommand(remotePath: string, action: 'bootstrap' | 'repair' | 'up', logPath?: string, statusPath?: string, sessionName?: string): string;
export declare function parseRemoteInstallerStatus(raw: any): RemoteInstallerStatus;
export declare function loadBundledInstaller(moduleDir?: string): RemoteInstallerAsset;
export declare function parseRemoteHealth(raw: any): RemoteHealthInfo;

import { AppService, Command, CommandProvider } from 'tabby-core';
/** @hidden */
export declare class BianbuCloudCommandProvider extends CommandProvider {
    private app;
    constructor(app: AppService);
    provide(): Promise<Command[]>;
}

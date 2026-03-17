import { ProfileProvider, Profile, NewTabParameters, BaseTabComponent } from 'tabby-core';
export interface BianbuCloudProfile extends Profile {
    options: {
        kind: 'shell' | 'files';
    };
}
/** @hidden */
export declare class BianbuCloudProfileProvider extends ProfileProvider<BianbuCloudProfile> {
    id: string;
    name: string;
    configDefaults: {};
    getBuiltinProfiles(): Promise<any[]>;
    getNewTabParameters(profile: BianbuCloudProfile): Promise<NewTabParameters<BaseTabComponent>>;
    getSuggestedName(): string | null;
    getDescription(profile: any): string;
}

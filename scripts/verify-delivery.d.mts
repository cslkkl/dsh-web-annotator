/** Types for `verify-delivery.mjs`, which runs without a build step. */
export declare function readTarMember(tarball: string, member: string): Buffer;
export declare function listTarFiles(tarball: string): string[];
export declare function main(): Promise<void>;

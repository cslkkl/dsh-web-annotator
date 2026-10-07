/** Types for `check-doc-paths.mjs`, which runs without a build step. */
export interface BrokenReference {
  rel: string;
  line: number;
  reason: string;
}

export interface DocumentationScan {
  failures: BrokenReference[];
  scanned: number;
  documents: number;
}

export declare function listDocuments(directory: string): string[];
export declare function listWorkflows(directory: string): string[];
export declare function localTarget(target: string | undefined): string | undefined;
export declare function brokenReferences(
  root: string,
  scripts: ReadonlySet<string>,
): DocumentationScan;
export declare function main(): void;

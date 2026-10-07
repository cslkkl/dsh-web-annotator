/** Types for `check-layering.mjs`, which runs without a build step. */
export interface LayeringRule {
  id: string;
  title: string;
  files(relativePath: string): boolean;
  violation(specifier: string): string | null;
}

export declare const RULES: readonly LayeringRule[];
export declare function listSources(directory: string): string[];
export declare function stripComments(text: string): string;
export declare function specifiersOf(text: string): { spec: string; line: number }[];
export declare function main(): void;

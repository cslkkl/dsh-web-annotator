/** Types for `release-assets.mjs`, which runs without a build step. */
export interface ReleaseAcceptance {
  checks: number;
  errors: number;
}

export interface ReleaseNotesInput {
  section: string;
  version: string;
  tag: string;
  commit: string;
  tarball: string;
  sourceArchive: string;
  sha256: string;
  acceptance?: ReleaseAcceptance;
}

export declare function changelogSection(markdown: string, version: string): string | undefined;
export declare function releaseNotes(input: ReleaseNotesInput): string;

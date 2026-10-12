/** Types for `release-assets.mjs`, which runs without a build step. */
export interface ReleaseAcceptance {
  checks: number;
  errors: number;
}

/** The channel a version publishes on. A prerelease must never claim the stable one. */
export interface ReleaseChannel {
  /** Whether the GitHub Release is marked as a prerelease. */
  prerelease: boolean;
  /** The npm dist-tag to publish under. */
  npmTag: string;
}

export interface ReleaseNotesInput {
  section: string;
  version: string;
  tag: string;
  commit: string;
  tarball: string;
  sourceArchive: string;
  sha256: string;
  prerelease: boolean;
  acceptance?: ReleaseAcceptance;
}

export declare function changelogSection(markdown: string, version: string): string | undefined;
export declare function releaseChannel(version: string): ReleaseChannel;
export declare function releaseNotes(input: ReleaseNotesInput): string;

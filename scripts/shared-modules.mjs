/** The picker modules that must stay byte-identical between this package and the
 * Browser patch. The synchronizer and the provider build both read this list, so
 * the two can never drift apart.
 */
export const SHARED_ANNOTATION_MODULES = Object.freeze([
  'page-inspector.ts',
  'protocol.ts',
  'iframe-annotation.ts',
  'screenshot.ts',
]);

/** The monorepo source imports these without an extension; this package needs `./x` for tsx. */
export function toHostSource(source) {
  return source
    .replaceAll("'./page-inspector'", "'./page-inspector.ts'")
    .replaceAll("'./protocol'", "'./protocol.ts'");
}

/** The reviewed Harness baseline this package's providers are built from. */
export const HOST_BASE_COMMIT = '639ed015397290b3745d163aafe02ffee4aa3f84';

/** The Harness checkout next to this package, overridable for CI and other layouts. */
export function hostCheckout(root) {
  return root(process.env.DSH_HOST_CHECKOUT || '../harness-browser-integration');
}

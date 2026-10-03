# DSH Web Annotator

- The primary flow extends Harness's existing Browser tab: click or drag, enter a comment/question in place, hold Space to interact. Do not substitute another browser or the legacy scanning panel.
- Target Harness 0.2.0-rc.2 and the exact additive Browser patch documented in `docs/browser-integration.md`. Stock rc.2 does not declare the annotation slots.
- `src/browser` owns the picker, wire validation and screenshot marking. Synchronize the four shared modules with `node scripts/sync-browser-provider.mjs`; the provider build checks their equality. The Chat patch declares an additive user-text chain; ordinary user messages use the host fallback.
- Slot contributions use public primitives, derived framework props, declared stores and reversible registrations. Provider callbacks expose bounded data and actions, never DOM or an arbitrary evaluator.
- Preserve exact region rectangles, comment/question intent, complete URL and Session isolation. A failed send retains annotations; successful submission removes only the captured IDs.
- Run `npm run check` for source changes. For visible flow changes, build the matching Browser and Chat providers and run the packed `test:acceptance` fixture. Its `session/list` wire argument is `_request`.
- Keep test homes under the workspace and use the supported `dsh` entry. Do not install into or modify a personal Profile for a test.
- Distribution is one prebuilt bundle including all three providers under `lib/host`; `npm pack` must fail if they are absent or stale. Prove installation with `WEB_ANNOTATOR_BUNDLED_HOST=1` and a packed artifact, without source provider overrides. Do not claim marketplace listing until the catalog has merged and installation is exercised there.
- Report native Desktop, remote-page, screenshot-attachment and real-model validation separately. Replay proves request routing and durable logging, not source-code repairs by a model.
- Update the owning docs and release evidence with a change. Keep generated bundles, personal configuration and credentials out of source archives.

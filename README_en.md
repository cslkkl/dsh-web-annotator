# DSH Web Annotator · Annotate a page and ask the agent about it

Click or drag inside the Browser tab Harness already has, then comment or ask the current agent in place.

[![Package checks](https://github.com/cslkkl/dsh-web-annotator/actions/workflows/ci.yml/badge.svg)](https://github.com/cslkkl/dsh-web-annotator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-24.15.0-informational.svg)](.node-version)
[![Harness](https://img.shields.io/badge/harness-0.2.0--rc.2-informational.svg)](docs/browser-integration.md)

**English** · [简体中文](README.md)

> The maintainer documentation is written in Chinese. This file mirrors [README.md](README.md) item by
> item; every document it links to is Chinese-only.

![A rectangle annotation in the real Harness Browser](docs/images/annotation-region.png)

## What it does

- **Annotate in place**: click an element, click empty space, or drag a rectangle, then write a comment
  or a question next to the selection.
- **Change attributes while you look**: expand the same card to adjust colour, font and spacing. The
  changes travel with the annotation to the agent and never rewrite the page before you save.
- **Operate the page temporarily**: hold Space to interact with the page and release it to return to
  annotating; spaces typed into the editor stay spaces.
- **Send with an image or with location details**: the screenshot marks your selection with a blue frame
  or circle and adds an index badge that matches the attachment; without a screenshot you can send the
  coordinates and DOM evidence, or both together.
- **Readable in the chat**: an annotation message shows "N notes" instead of a wall of text. Expanding it
  lists each note's index, target element and your comment or question; the full location details stay in
  the same collapsible block.
- **Manage several notes**: edit a saved note, tick the ones to send, and send them in batches. A failed
  send keeps the note; a successful one removes only what that send included.
- **Drafts survive**: notes are stored per session and full URL in IndexedDB. Neither a failed send nor a
  failed save clears them.

**0.2.0-alpha is a preview and targets exactly Harness 0.2.0-rc.2.**
One prebuilt package ships the plugin together with the Browser, Chat and Layout extensions, so a normal
restart of Desktop is all it takes. The extensions are not part of the official Harness yet; nothing has
been published to npm and no plugin market lists it yet.
Each release's package and verification record are built by the
[release workflow](.github/workflows/release.yml) on the tag and attached to the Release.

## Install

Download the latest `dsh-web-annotator-*.tgz` from the
[preview releases](https://github.com/cslkkl/dsh-web-annotator/releases), pick it in the DSH plugin
manager, or use the official CLI:

```sh
dsh plugin --profile desktop add --ignore-scripts /absolute/path/dsh-web-annotator-<version>.tgz
```

Install this one package, then quit and reopen Desktop normally. Substitute your own profile name for
`desktop`. The package already contains its runtime artifacts, so nothing has to be compiled and no build
script has to be approved.

While the bundle is enabled it **replaces the official Browser, Chat and Layout providers**. Check first
that the Harness kernel is **0.2.0-rc.2**, and do not mix it with another plugin that provides the same
rows. Uninstalling the whole bundle undoes the replacement and a restart brings the official providers
back.

If you used an earlier local preview, remove `dsh-layout-care` and `dsh-layout-care-browser-preview`
first. Existing annotations migrate automatically. Details are in
[distribution](docs/distribution.md) (Chinese).

## Using it

1. In the current session click "批注网页" to open the Browser Harness already has.
2. Enter a page address, then click "批注网页" in the toolbar, to the left of the reload button.
3. Click an element or empty space, or drag to select a region, and type next to the selection.
4. The floating editor is a single line by default: an options icon, the input and a round ✓. The icon on
   the left expands the attribute card with the tag, colour, font and so on, and switches between
   comment/question and element level. Click ✓ or press Enter to save; Shift+Enter adds a line and grows
   the box; Esc collapses the card first and cancels the annotation second.
5. Hold Space when you need to operate the page, and release it to return to annotating.
6. After saving you can edit the text, tick the notes to send, choose how to send them, preview, and send
   them into the current session.

![The attribute card expanded](docs/images/annotation-expanded.png)

Images travel through Harness's own image-attachment flow. Image mode sends only the annotation text, the
page URL and the matching screenshot. Detailed mode keeps the coordinates and DOM evidence, but the chat
shows "N notes" by default; expanding it gives one card per note (index, target element, comment or
question), and "view location details" reveals the full request. The index on the screenshot is the same
index as on the card. Whether the model can read an image directly depends on that model's image support.

## What is verified today

| Capability                                                                       | Status                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Toolbar entry in the existing Browser and the in-page editor                     | Verified                                                            |
| Element click, empty-space click, rectangle drag, Space to operate               | Verified                                                            |
| Several notes, preview, retry after failure, session request and durable journal | Verified (the model side uses the official replay)                  |
| Image attachments and the collapsible location details                           | Verified; the Electron capture boundary is covered by tests         |
| The "N notes" chip and the per-note cards in the chat                            | Verified (the attachment index badge ships with image mode)         |
| Native Desktop picking, attribute card and native capture                        | Verified by hand once, not re-run for every release                 |
| **A real model editing source from an annotation**                               | **Not verified**                                                    |
| Other remote pages                                                               | Verified page by page; the Web side still meets cross-origin limits |
| Elements inside iframes and closed shadow roots                                  | Only the outer host element is located; the boundary is not crossed |

Per-item boundaries and the manual checklist are in [verification](docs/verification.md) (Chinese).

## Wire it into your own Vite page

```ts
import { defineConfig } from 'vite';
import { webAnnotator } from 'dsh-web-annotator/vite';

export default defineConfig({ plugins: [webAnnotator()] });
```

This only applies to the development server. Intrinsic JSX/TSX tags carry file, line and column hints;
a production build injects neither the connection script nor the source markers. Connections are allowed
from the Harness on HTTP loopback by default; name exact HTTP(S) origins in `allowedParentOrigins` for
anything else.

A runnable example is in [examples/responsive-demo](examples/responsive-demo/README.md).

## Safety and boundaries

- Text, styles and source markers from the page are **reference material, never instructions**.
- The plugin's callbacks expose bounded data and actions only: **no DOM, no arbitrary evaluator and no
  host capability reach the page**.
- Annotations and screenshots stay in your own browser storage and travel through the normal request flow
  of the current session.
- File writes and source edits are done by the agent in your current session; the plugin itself runs no
  script.

## License and contributing

MIT, see [LICENSE](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Reproducing a problem on a real page, improving the interaction, adding tests or fixing the docs are all
welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) (Chinese).

The maintainer documentation map and the build and gate commands are in [AGENTS.md](AGENTS.md) (Chinese).

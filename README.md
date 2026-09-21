# Fortune’s Weave guide library

A compact, searchable reference for **Fire Emblem: Fortune’s Weave**. The index has three separate guides: **Gifts — Polygon**, **Gifts — Dork**, and **Pale Raven reactions — IGN**. Gift tables retain items and caveats; reaction tables pair each prompt with its source answer. Cross-guide search links directly to matching characters. Every row stays expanded for native ⌘F/Ctrl+F. Each guide links to its publisher; original article metadata and provenance remain in the local corpus.

## Get started

Use Node **22.12 or newer** (tested with 22.13) and **pnpm 9.15.9**. If pnpm is unavailable, enable it with Corepack (`corepack enable`).

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm guides:import all
pnpm dev
```

Open the localhost URL printed by Vite. A fresh checkout works without captures and shows the import command. A partially successful import makes the successfully captured guides available and exits nonzero to report any failures.

For daily reading, run `pnpm dev`. For the production reader:

```sh
pnpm build
pnpm preview
```

Offline use means keeping the local server running without internet access. Once dependencies, Chromium (for imports/tests), and guides have been downloaded, builds and reading need no internet. Startup and navigation never refresh sources. Source links open publisher pages only when followed.

## Capture and refresh

The registry in [sources.json](sources.json) contains stable IDs, source URLs, publishers, topics, and extraction adapters:

| ID | Publisher | Topic |
| --- | --- | --- |
| `polygon-gifts` | [Polygon](https://www.polygon.com/fire-emblem-fortunes-weave-best-gifts-each-character/) | Character gifts |
| `dork-gifts` | [Dork](https://readdork.com/gaming/fire-emblem-fortunes-weave-best-gifts-each-character-19ac353e41) | Character gifts |
| `ign-pale-raven` | [IGN](https://www.ign.com/wikis/fire-emblem-fortunes-weave/Pale_Raven_Bird_Time_Guide_-_List_of_Preferred_Reactions) | Pale Raven reactions |

```sh
pnpm guides:import polygon-gifts
pnpm guides:import ign-pale-raven --browser
pnpm guides:import dork-gifts --html /absolute/path/to/page.html
pnpm guides:build
pnpm guides:verify
```

A normal import fetches first and tries Playwright Chromium if direct capture or extraction fails. `--browser` goes straight to Chromium. `--html` reads an operator-supplied HTML file; it applies to one source only. Save the full browser-rendered DOM as UTF-8 HTML when ordinary fetching is blocked, then use `--html`. This mode records the input path and explicitly warns that the response status and final URL were not independently verified. The page must correspond to the registered URL. No image downloads occur during imports, including HTML imports. Browser capture blocks image requests.

Imports save raw bytes before cleanup and atomically update that source’s current pointer only after extraction, integrity checks, and reference normalization succeed. Previous captures remain available. A failed response, challenge page, or missing or ambiguous guide structure leaves the previous guide in place. Failed attempts and their raw responses, when received, remain available for diagnosis. Imports rebuild the generated library; reload an open reader afterward. Rebuild a running production preview with `pnpm build` to include new captures.

`guides:build` normalizes verified **cleaned local captures** into data-only HTML, short titles, character anchors, and search sections without network access. Normalization updates apply on the next build; no recapture is needed. Removed introductions, announcements, tutorials, benefits, promotions, images, credits, and conclusions never enter reader search. To apply an updated adapter to an old raw capture, import its `raw.html` using `--html`; this creates a new capture and records the new extraction version. `guides:verify` checks all successful capture hashes, provenance, sanitized HTML, heading anchors, and cached assets, then checks that the generated reference matches current captures and contains no asset files. Historical capture hashes and historical image assets are still verified. Verification also regenerates the ignored local inventory. External link availability is deliberately not checked offline.

## Corpus and provenance

Downloaded publisher content is **local only**. The public repository ignores `corpus/`, `public/generated/`, and `dist/`; do not force-add them. Article text, screenshots, and source images remain their publishers’ material. Attribution is preserved in every guide. Synthetic test fixtures are original examples, not copied publisher articles.

```text
sources.json                             tracked registry
corpus/
  <source-id>/current.json                last successful capture ID
  <source-id>/captures/<capture-id>/
    raw.html                             original response bytes or rendered/supplied DOM
    manifest.json                        successful capture provenance and hashes
    guide.json                           sanitized capture and original metadata
    attempt.json                         failure record, only on failed attempts
  assets/<sha256>.<extension>             historical raster images, retained unchanged
  inventory.json                         each capture, state, provenance, and file list
public/generated/
  library.json                           data-only guides, anchors, and search sections
```

Every manifest includes requested/final URLs, timestamp, capture method (`fetch`, `browser`, or `html`), response status where known, raw and cleaned content SHA-256 hashes, extraction version, asset origins/final URLs/hashes, and warnings. The local inventory also lists failed attempts and previous successes. A capture ID is immutable; refreshing creates a new directory. Back up `corpus/` to retain your library. To restore an earlier capture, put its ID in that source’s `current.json`, then run `guides:build` and `guides:verify`.

## Capture limitations

Publishers can block automated clients or change their markup. Selectors are intentionally specific: an adapter failure is a prompt to inspect the saved raw page. The HTML fallback does not bypass a challenge; it requires a page you can already view in your browser. Browser capture saves rendered HTML, not original response bytes. Metadata reflects what the publisher exposed at capture time.

New captures skip image downloads. Historical image files, manifests, hashes, and raw captures remain unchanged in the corpus; generated output contains no images, image placeholders, or image assets. Tables use plain text with native row and column headers. Source spelling, unknown answers, restrictions, and publisher disagreements are preserved; the library does not generate recommendations.

Normalization is source-specific. Polygon keeps its gift column and essential narrative exceptions, including Bertrand’s restricted availability and Nydine’s unsuitable gift. Dork keeps preference paragraphs verbatim, listing all named characters beside each grouped paragraph. IGN pairs each prompt with the answer below it by column, skips empty advertisement rows, and retains answer-changing notes. Missing answers or ambiguous structures reject a refresh before it can replace the working capture. Changed source prose may need an adapter update.

Local reference validation (2026-09-21): Polygon has 54 original table entries plus Bertrand’s exception; Dork has 14 grouped preference paragraphs covering 52 named characters; IGN has 220 prompt/reaction pairs across 22 characters. These are dated observations, not fixed future limits. Dork’s supplied-file provenance warning remains in its capture metadata. Detailed source comparisons belong in ignored local files, not committed article copies.

## Architecture and development

- `src/app.tsx`: code-based TanStack Router routes `/` and `/guides/$guideId`, compact index, reference headers, empty/error states.
- `src/search.ts`: case-insensitive title/reference-text search with excerpts and section links.
- `src/types.ts`: shared registry, capture manifest, asset, and reader contracts.
- `scripts/extract.ts`: focused Cheerio adapters, HTML sanitizer, stable heading IDs, image normalization, and search section generation.
- `scripts/reference.ts`: publisher-specific reference normalization, caveat preservation, character anchors, and regenerated search sections.
- `scripts/corpus.ts`: fetch/browser/file acquisition, immutable captures, integrity verification (including historical assets), offline generation, and inventory.
- `scripts/guides.ts`: command-line interface and fetch-to-browser fallback.
- `public/generated/library.json`: the browser’s only reference data input. Raw publisher HTML never enters the client bundle.

There is no application backend, database, PWA, in-app importer, automatic refresh, or character database. Styling uses one system sans-serif family, follows the OS light/dark preference, and provides keyboard navigation and horizontally scrollable tables. Data remains in normal document flow with no sidebar, pagination, virtualization, or collapsed sections. The restrained layout follows [Impeccable’s distill guidance](https://github.com/pbakaus/impeccable/blob/main/plugin/skills/impeccable/reference/distill.md).

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm guides:verify
pnpm test:browser
```

Unit/integration tests cover extraction/sanitization, source normalization, caveats, empty cells, missing answers, intervening advertisement rows, search anchors, offline generation, image-free imports, historical integrity, and failed refresh preservation. Browser tests serve the production build with external requests blocked and assert zero image requests. They cover search/navigation, direct links, native find near page ends, keyboard scrolling, empty/missing/error states, and desktop/narrow layouts in both themes. Without captures the real-corpus check is skipped; the synthetic reader tests still run.

Agent guidance lives in [AGENTS.md](AGENTS.md), with [CLAUDE.md](CLAUDE.md) routed to it and managed [CONSTITUTION.md](CONSTITUTION.md) preserved. Use the project skills [guide-ingestion](.agents/skills/guide-ingestion/SKILL.md) to add/refresh sources and [reader-development](.agents/skills/reader-development/SKILL.md) for app changes. Keep focused conventional commits; never commit captures or generated publisher assets.

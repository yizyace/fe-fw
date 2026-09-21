# Fortune’s Weave guide library

A searchable, ad-free local reader for **Fire Emblem: Fortune’s Weave**. Each publisher’s guide stays separate, with its source link, author, publication date when available, and capture date. Search matches titles and article text and links to the matching section.

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

Offline use means keeping the local server running without internet access. Once dependencies, Chromium (for imports/tests), and guides have been downloaded, builds and reading need no internet. Startup and navigation never refresh sources. Original-source links and uncaptured article links open publisher pages only when followed.

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

A normal import fetches first and tries Playwright Chromium if direct capture or extraction fails. `--browser` goes straight to Chromium. `--html` reads an operator-supplied HTML file; it applies to one source only. Save the full browser-rendered DOM as UTF-8 HTML when ordinary fetching is blocked, then use `--html`. This mode records the input path and explicitly warns that the response status and final URL were not independently verified. The page must correspond to the registered URL. Images still download during an HTML import.

Imports save raw bytes before cleanup, download article images, and atomically update that source’s current pointer only after extraction succeeds. Previous captures remain available. A failed response, challenge page, or missing expected guide structure leaves the previous guide in place. Failed attempts and their raw responses, when received, remain available for diagnosis. Imports rebuild the generated library; reload an open reader afterward. Rebuild a running production preview with `pnpm build` to include new captures.

`guides:build` regenerates the browser library and search sections from verified **cleaned local captures**, without network access. To apply an updated adapter to an old raw capture, import its `raw.html` using `--html`; this creates a new capture and records the new extraction version. `guides:verify` checks all successful capture hashes, provenance, sanitized HTML, heading anchors, and cached assets, then checks that generated data and assets match the current captures. Verification also regenerates the ignored local inventory. External link availability is deliberately not checked offline.

## Corpus and provenance

Downloaded publisher content is **local only**. The public repository ignores `corpus/`, `public/generated/`, and `dist/`; do not force-add them. Article text, screenshots, and source images remain their publishers’ material. Attribution is preserved in every guide. Synthetic test fixtures are original examples, not copied publisher articles.

```text
sources.json                             tracked registry
corpus/
  <source-id>/current.json                last successful capture ID
  <source-id>/captures/<capture-id>/
    raw.html                             original response bytes or rendered/supplied DOM
    manifest.json                        successful capture provenance and hashes
    guide.json                           sanitized article and metadata
    attempt.json                         failure record, only on failed attempts
  assets/<sha256>.<extension>             shared content-addressed raster images
  inventory.json                         each capture, state, provenance, and file list
public/generated/
  library.json                           reader guides and generated search sections
  assets/                                assets used by current guides
```

Every manifest includes requested/final URLs, timestamp, capture method (`fetch`, `browser`, or `html`), response status where known, raw and cleaned content SHA-256 hashes, extraction version, asset origins/final URLs/hashes, and warnings. The local inventory also lists failed attempts and previous successes. A capture ID is immutable; refreshing creates a new directory. Back up `corpus/` to retain your library. To restore an earlier capture, put its ID in that source’s `current.json`, then run `guides:build` and `guides:verify`.

## Capture limitations

Publishers can block automated clients or change their markup. Selectors are intentionally specific: an adapter failure is a prompt to inspect the saved raw page. The HTML fallback does not bypass a challenge; it requires a page you can already view in your browser. Browser capture saves rendered HTML, not original response bytes. Metadata reflects what the publisher exposed at capture time.

Only raster images (PNG, JPEG, GIF, WebP, AVIF, up to 20 MB) are cached. Missing/unsupported images become an explicit “Image unavailable” notice and a manifest warning; there are no remote image fallbacks. Video, interactive embeds, promotions, publisher navigation, scripts, event handlers, and publisher styles are removed. Tables retain their cells and captions, but publisher colors are not preserved. Compare the rendered guide with the source after changing an adapter, especially where color conveys meaning. The library preserves publisher disagreements and does not generate recommendations.

Initial local capture validation (2026-09-21): Polygon has one table with 54 character rows and 57 images including its hero; Dork has six character sections and one hero image; IGN has 24 tables, 25 headings, and 20 images. These are a dated observation, not fixed future limits. Dork required browser-saved HTML on this host; its supplied-file provenance warning is expected. Detailed validation belongs in the ignored corpus, not a committed copy of an article.

## Architecture and development

- `src/app.tsx`: code-based TanStack Router routes `/` and `/guides/$guideId`, article index, metadata, empty/error states.
- `src/search.ts`: case-insensitive title/full-text search with excerpts and section links.
- `src/types.ts`: shared registry, capture manifest, asset, and reader contracts.
- `scripts/extract.ts`: focused Cheerio adapters, HTML sanitizer, stable heading IDs, image normalization, and search section generation.
- `scripts/corpus.ts`: fetch/browser/file acquisition, immutable captures, integrity verification, asset caching, offline generation, and inventory.
- `scripts/guides.ts`: command-line interface and fetch-to-browser fallback.
- `public/generated/library.json`: the browser’s only article data input. Raw publisher HTML never enters the client bundle.

There is no application backend, database, PWA, in-app importer, automatic refresh, or character database. Styling uses local system fonts, follows the OS light/dark preference, and provides keyboard navigation and horizontally scrollable tables.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm guides:verify
pnpm test:browser
```

Unit/integration tests cover synthetic extraction/sanitization, headings, lazy images, links, challenges, search, offline generation, and failed refresh preservation. Browser tests serve the production build with external requests blocked, covering search/navigation, direct links, empty/missing/error states, responsive layouts, and every available real guide and image. Without captures the real-corpus check is skipped; the synthetic reader tests still run.

Agent guidance lives in [AGENTS.md](AGENTS.md), with [CLAUDE.md](CLAUDE.md) routed to it and managed [CONSTITUTION.md](CONSTITUTION.md) preserved. Use the project skills [guide-ingestion](.agents/skills/guide-ingestion/SKILL.md) to add/refresh sources and [reader-development](.agents/skills/reader-development/SKILL.md) for app changes. Keep focused conventional commits; never commit captures or generated publisher assets.

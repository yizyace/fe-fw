---
name: reader-development
description: Use when changing the local guide reader UI, search, routing, accessibility, or offline build behavior in this repository.
---

# Reader development

Read root `AGENTS.md`, `CONSTITUTION.md`, and README architecture/development instructions. Use pnpm 9.15.9 and Node 22.12+.

The React/Vite client uses code-based TanStack Router. `/` has a small header, labeled cross-guide search and compact guide rows; `/guides/$guideId` renders one publisher’s data-only reference. `src/types.ts` is the shared contract. `src/search.ts` searches normalized reference text and returns excerpts with character anchors. `scripts/extract.ts` sanitizes captures; `scripts/reference.ts` builds plain-text gift/caveat or prompt/reaction tables, short titles/topics, anchors, and search sections. Only generated `public/generated/library.json` reaches the browser. Preserve this HTML trust boundary.

`pnpm dev` and `pnpm build` regenerate local data without network. Only explicit `guides:import` contacts publishers. The reader requests no images or external resources. New imports skip images; historical captures/assets and original article metadata remain unchanged in the corpus. Publisher source links are user-initiated navigation. There is no backend, database, PWA, in-app importer, scheduled refresh, or generated character advice.

For GitHub Pages, `pnpm build:pages` builds from the reviewed public `reference/library.json` snapshot without using the local corpus. Asset/data URLs and router basepath must use Vite’s `BASE_URL`. Keep static entry pages for each guide and the custom 404 page; `pnpm test:pages` verifies them under `/fe-fw/` on a static server without an SPA fallback. The Pages workflow deploys the default branch after checks.

Keep publishers separate. Index and browser titles use **Gifts — Polygon**, **Gifts — Dork**, and **Pale Raven reactions — IGN**. Guide headers have a library link, short topic, and source link. Keep author/date/capture notes and editorial material in the corpus, outside the reading surface. Search must not expose removed content.

Keep every lookup row expanded in normal document flow for native ⌘F/Ctrl+F; do not intercept these shortcuts, paginate, virtualize, or collapse data. Preserve native table/row/column semantics, keyboard-focusable wide-table scroll regions, accessible labels, clear focus, route/anchor focus, OS light/dark preference, and narrow-screen reading. Use one system sans-serif family: 14px tables, 16px controls, 20px page headings, about 1.4 line height and 6–8px cell padding. Use available width up to 1280px with 16px desktop/12px mobile gutters. Keep the three index links comfortably within the initial viewport. Empty checkout, missing guide, and load-error states need concise recovery actions.

Validate with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm guides:verify`, `pnpm test:browser`, and `pnpm test:pages`. Inspect desktop and narrow layouts in both themes. Browser tests block external requests and assert zero image requests; synthetic tests work on an empty checkout, real-corpus checks require local captures. Verify search result excerpts, direct URLs, character anchors, keyboard navigation, and native find on late-page entries. Add behavior tests for changed search, navigation, normalization, extraction, or offline contracts.

Edit source files, not generated output. Keep `corpus/`, `public/generated/`, and `dist/` out of Git. For capture or normalization changes, use the neighboring guide-ingestion skill. Group implementation with its behavior tests in focused conventional commits; documentation is separate when it can stand alone.

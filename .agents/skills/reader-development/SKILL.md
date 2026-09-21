---
name: reader-development
description: Use when changing the local guide reader UI, search, routing, accessibility, or offline build behavior in this repository.
---

# Reader development

Read root `AGENTS.md`, `CONSTITUTION.md`, and README architecture/development instructions. Use pnpm 9.15.9 and Node 22.12+.

The client is React with Vite and code-based TanStack Router. `/` searches titles and article text; `/guides/$guideId` renders one publisher's article and heading index. `src/types.ts` is the shared contract. `src/search.ts` returns matching excerpts and section anchors. `scripts/extract.ts` creates sanitized article HTML; only generated `public/generated/library.json` reaches the browser. Treat the HTML trust boundary as part of any rendering change.

`pnpm dev` and `pnpm build` regenerate assets from the local corpus without network. Only explicit `guides:import` contacts publishers. Keep article content, fonts, and images local; preserve original-source links as user-initiated navigation. There is no backend, database, PWA, in-app importer, scheduled refresh, or generated character advice in this version.

For a UI change, preserve separate publishers and source/capture metadata, native table semantics, scrollable wide tables, captions, keyboard focus and heading navigation, system light/dark preference, and narrow-screen reading. A checkout with no captures must display import instructions. A missing guide and an unreadable generated library need distinct useful messages.

Validate with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm guides:verify`, and `pnpm test:browser`. Inspect desktop and narrow layouts. Browser tests run against production with external requests blocked; synthetic tests work on an empty checkout, while real-corpus checks require local captures. Add behavioral tests for changed search, navigation, extraction, or offline contracts; avoid tests that only repeat implementation constants.

Edit source files, not `public/generated/` or `dist/`. Keep `corpus/` and generated assets out of Git. For source capture or extraction changes, use the neighboring `guide-ingestion` skill. Group source changes and their behavior tests into focused conventional commits; documentation is a separate change when it can stand alone.

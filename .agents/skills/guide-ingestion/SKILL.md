---
name: guide-ingestion
description: Use when adding, capturing, refreshing, or repairing local Fire Emblem guide sources in this repository.
---

# Guide ingestion

Read root `AGENTS.md`, `CONSTITUTION.md`, and the README capture/corpus sections. Work in the repository root. Source definitions are tracked; publisher content and generated output stay Git-ignored.

1. Inspect `sources.json` and `corpus/<id>/current.json`. Keep stable guide IDs, source URLs, publisher boundaries, and attribution. Contracts are in `src/types.ts`.
2. Run `pnpm guides:import <id>` (or `all`). Direct fetching falls back to Playwright; `--browser` requests a rendered page. If blocked, save full HTML from a browser that can view the registered page and use `--html /absolute/path/page.html`. Supplied-file provenance cannot attest the original HTTP status/final URL. New imports skip image downloads, including HTML imports; browser capture blocks images. Never substitute another publisher or infer missing text.
3. Inspect raw capture, manifest, and cleaned guide. `scripts/extract.ts` owns article selection/sanitization; changes require incrementing `EXTRACTION_VERSION` and a new capture. `scripts/reference.ts` owns data-only normalization; changes apply to existing cleaned captures during offline build. Add synthetic regression fixtures for either. Captures are immutable; importing old raw HTML creates a new capture.
4. Compare every retained gift cell, preference paragraph, prompt/reaction pair, and essential caveat against the capture. Polygon keeps its gift column and narrative exceptions. Dork preserves grouped paragraphs and all named characters. IGN pairs each prompt with the answer below it by column, ignoring empty ad rows; keep unknown answers and answer-changing notes, including table captions. Preserve spelling and publisher disagreements. Do not check only counts: inspect prose outside tables for exceptions. Ambiguous structures and missing answers must reject normalization before promoting `current.json`.
5. Run `pnpm guides:build` and `pnpm guides:verify` offline, plus extraction/normalization tests. Check short titles, anchors, and search text: introductions, update announcements, tutorials, benefits, promotions, conclusions, images, image credits, and unavailable-image notices must be absent. Generated output contains `library.json` only. Historical assets, hashes, provenance, and captures stay intact and remain verified.
6. For real captures run `pnpm build` and `pnpm test:browser`. Verify all data remains expanded and native browser find reaches late entries; check source links, direct anchors, keyboard scrolling, both themes and narrow layouts. Report source IDs, capture methods, retained structural counts, provenance warnings, and results. Keep detailed source comparisons local and ignored.

A failed refresh retains the last working capture and generated library. Inspect `attempt.json` and `raw.html`; do not delete previous guides or treat challenges as content. If all methods fail, report the source as unavailable and preserve the local library. `corpus/inventory.json` records captures, provenance, and historical files. Before committing, check `git status --short` and `git check-ignore corpus public/generated dist`; never force-add them.

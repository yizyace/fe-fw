---
name: guide-ingestion
description: Use when adding, capturing, refreshing, or repairing local Fire Emblem guide sources in this repository.
---

# Guide ingestion

Read the root `AGENTS.md`, `CONSTITUTION.md`, and the README sections on capture, corpus, and limitations. Work in this repository root. Source definitions are tracked; publisher content and generated assets stay Git-ignored.

1. Inspect `sources.json` and `corpus/<id>/current.json`. Keep stable guide IDs and publisher boundaries. Add a source with URL, publisher, topic, and adapter; shared contracts are in `src/types.ts`.
2. Run `pnpm guides:import <id>` (or `all`). Direct fetching falls back to Playwright. Use `--browser` for a rendered page. If blocked, save the full HTML from a browser that can view the registered page and use `--html /absolute/path/page.html`. HTML imports still download article images and need network access for them. This is supplied-file provenance: the importer cannot attest the original HTTP status/final URL. Do not substitute another publisher or infer missing article text.
3. Inspect the new raw capture, manifest, and guide. For selector changes, modify the focused adapter in `scripts/extract.ts`, increment `EXTRACTION_VERSION`, and add a synthetic regression fixture. Capture again: existing capture directories are immutable. Reimporting a saved raw file creates a new `html` capture; it does not overwrite history.
4. Compare source and local reader. Check title, author/date, first and last article passages, heading list, all table rows/cells, lists, image/hero counts, captions, and important internal links. Polygon needs its gift table; Dork needs its character sections; IGN needs its reaction tables. Image-viewer buttons can contain meaningful images. Publisher classes are removed, so verify that losing color does not hide meaning.
5. Run `pnpm guides:build` and `pnpm guides:verify`; run extraction tests if adapters changed. For real captures run `pnpm build` and `pnpm test:browser`. Read manifest warnings, including every unavailable image. No remote image fallback is allowed. Build/verify must work without network.
6. Report source IDs, capture methods, structural counts, warnings, and verification results. `corpus/inventory.json` lists captures and their files; build and verify regenerate this ignored local inventory. Check `git status --short` and `git check-ignore corpus public/generated dist` before committing source/adapter changes.

A failed refresh preserves `current.json`. Inspect its `attempt.json` and `raw.html`; do not delete the previous working guide or treat a challenge as content. If all capture methods fail, report the source as unavailable and preserve the local library.

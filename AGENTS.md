# AI Agents Guidelines

<!-- This file is managed by dd-dm -->
<!-- See CONSTITUTION.md for project rules and guidelines -->

## Project Conventions

For project conventions and coding standards, refer to: [CONSTITUTION.md](./CONSTITUTION.md)

The CONSTITUTION.md file contains all engineering rules and conventions that should be followed when working on this project. All AI agents (GitHub Copilot, Claude, etc.) should read and adhere to those guidelines.

---

<!-- dd-dm:custom:start -->
<!-- Add project-specific agent overrides below this line -->
<!-- These overrides will be preserved during dd-dm pull operations -->

## Local guide library

Read [README.md](./README.md) for architecture and commands. Use pnpm 9.15.9
with Node 22.12+. Browser content comes only from sanitized generated local
captures. Startup and navigation must never contact publishers automatically.

Project skills:

- [Guide ingestion](./.agents/skills/guide-ingestion/SKILL.md): add sources,
  capture or refresh guides, maintain adapters, and verify completeness.
- [Reader development](./.agents/skills/reader-development/SKILL.md): UI,
  routing, search, accessibility, and offline validation.

Keep publishers separate and preserve attribution. Never force-add `corpus/`,
`public/generated/`, or `dist/` to this public repository. The reviewed data-only
`reference/library.json` snapshot is public and powers GitHub Pages; raw captures
and historical assets stay local. Captures are immutable;
failed refreshes retain the last successful guide. `pnpm guides:build` and
`pnpm guides:verify` are offline commands. Validate code with lint, typecheck,
unit tests, production build, and browser tests before calling it complete.
Follow the atomic/conventional commit rules in `CONSTITUTION.md`.

<!-- dd-dm:custom:end -->

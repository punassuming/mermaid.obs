# AGENTS.md — Mermaid Tools Obsidian Plugin

Guidance for AI agents working in this repository.

> **Maintenance rule**: whenever you make a change to this codebase — new files, removed files, new architectural decisions, new commands, changed conventions — **update this file as part of the same commit**. AGENTS.md is the authoritative reference for agents and must stay in sync with the actual state of the repository.

---

## Project overview

**Mermaid Tools** is an Obsidian plugin that enhances Mermaid diagram rendering:

- Fits diagrams to container width with CSS
- Hover-to-zoom (non-destructive, overflow visible)
- Right-click context menu to export diagrams as **SVG** or **PNG** into the current note's folder
- Registers `.mermaid` / `.mmd` files as a custom view that renders diagrams

All plugin logic lives in `src/main.ts`. Styles live in `styles.css`. There are no other source files.

---

## Repository layout

```
src/
  main.ts          # Single TypeScript source file — all plugin logic
styles.css         # All CSS for the plugin
manifest.json      # Obsidian plugin manifest (id, version, minAppVersion, fundingUrl)
versions.json      # Maps plugin versions to minimum Obsidian app versions
package.json       # npm scripts and dev dependencies
tsconfig.json      # TypeScript compiler config (target ES6, strict null checks)
esbuild.config.mjs # esbuild bundler config (watch mode for dev)
build.mjs          # Production build script (runs tsc --noEmit then esbuild)
version-bump.mjs   # Bumps version in manifest.json and versions.json
eslint.config.mts  # ESLint config using eslint-plugin-obsidianmd
.editorconfig      # Tab-indented, LF line endings, UTF-8
```

---

## Build & dev commands

| Command | Purpose |
|---|---|
| `npm install` | Install all dependencies |
| `npm run dev` | Watch mode — rebuilds `main.js` on every save |
| `npm run build` | Production build — type-checks then bundles minified `main.js` |
| `npm run lint` | Run ESLint across `src/` |
| `npm run version` | Bump version in `manifest.json` + `versions.json`, stages both for git |

`main.js` is the bundled output written to the repo root — it is **gitignored** and rebuilt by CI on release.

---

## Key architectural rules

- **Single source file**: keep all plugin logic in `src/main.ts`. Do not split into multiple files unless the file exceeds ~600 lines and there is a clear module boundary.
- **No runtime dependencies**: `obsidian` is the only non-dev dependency. Do not add libraries that would be bundled into `main.js` (increases plugin size and attack surface).
- **`obsidian` is always external**: it is listed in `esbuild.config.mjs` `external` array and must never be bundled.
- **Export default**: the plugin class must be the `default` export of `src/main.ts` — Obsidian requires this.
- **`TextFileView`** is used for the `.mermaid`/`.mmd` file viewer. `getViewData()` must return `this.data`.
- **`MutationObserver`** watches for dynamically added SVGs (live-preview / pane switching). Always call `this.register(() => obs.disconnect())` to clean up.
- **Source paths**: track the owning view element for observer-discovered SVGs so exports retain the source note path, including asynchronous rendering in `.mermaid` / `.mmd` file views.
- **Enhancement cleanup**: when enhancing an SVG, register cleanup that removes listeners, unwraps the SVG, and removes plugin-owned classes and dataset markers.
- **Mermaid SVG detection**: recognize the root diagram SVG, not arbitrary nested SVGs inside a `.mermaid` container.
- **Hover zoom** is CSS-only via `mt-hover` class toggled by JS — do not manipulate `transform` in JS directly.
- **Export paths**: SVG/PNG files are saved into the folder of the active note (or `Mermaid Exports/` as fallback). Use `createUniqueExport()` to avoid clobbering existing files.
- **Export writes**: handle folder creation errors and resolve filename collisions at file creation time, since separate exports can race after an existence check.
- **PNG export**: preserve the diagram aspect ratio and cap canvas size to avoid oversized allocations; the current export uses a white background and the UI must disclose it.
- **Zoom interaction**: support mouse hover, touch toggle, and keyboard activation; keep a visible keyboard focus indicator and use a reduced zoom factor in narrow containers.
- **`isMermaidSvg()`** guards all SVG processing — only touch SVGs that originate from the Mermaid renderer.

---

## TypeScript conventions

- Strict null checks are on (`strictNullChecks`, `noUncheckedIndexedAccess`) — always handle `| undefined`.
- Use `unknown` in catch blocks (`useUnknownInCatchVariables`).
- Prefer `async/await` over raw promise chains.
- Private plugin state uses `private` class fields, not underscore-prefixed names.
- `enhanceMermaidSvg` is intentionally `public` (called from `MermaidFileView`).
- Do not use `any` — ESLint rule `@typescript-eslint/no-explicit-any` is set to `error`.

---

## Versioning

Versions follow **semver**. To cut a release:

1. Run `npm version patch` (or `minor`/`major`) — this calls `version-bump.mjs` and stages `manifest.json` + `versions.json`.
2. Push the tag — the `release.yml` GitHub Actions workflow builds and publishes the release artifact.

`minAppVersion` in `manifest.json` is `1.2.0` — do not lower it without testing against that Obsidian version.

---

## What NOT to do

- Do not modify `main.js` directly — it is generated.
- Do not add a settings tab unless diagrams genuinely need user-configurable options.
- Do not call `mermaid.initialize` with `startOnLoad: true` — it causes double-rendering.
- Do not reconfigure Mermaid globally from the file view; use the Obsidian-provided renderer and wait for its `init()` completion before processing generated SVGs.
- Do not change the `isDesktopOnly` flag to `true` — the plugin works on mobile.
- Do not add `console.log` outside of `catch` blocks.

# Front-end build pipeline (Vite)

## Why Vite (single tool)

- **One bundler** for CSS + JS: minification, tree-shaking where safe, and hashed filenames for cache busting.
- **Aligns with Storybook**, which already uses the Vite toolchain in this repo.
- **Simpler than** maintaining parallel `*.min.js` / manual minify scripts while still editing sources in `public/`.

## Old vs new flow

| Phase | Before | After |
|--------|--------|--------|
| **Sources** | Edited directly in `public/*.js`, `public/styles.css` | Same authoring location; `frontend/css/styles.entry.css` only `@import`s `public/styles.css` for the bundle |
| **CSS tokens** | `scripts/sync-inlined-theme.js`, `scripts/inline-ds-framework.js` update `public/styles.css` | Unchanged — run those scripts when you edit `theme.css` / `ds-framework.css`, then `npm run build:assets` |
| **Production assets** | Manual `*.min.js` duplicates + `GETPRO_STYLES_V` query string | `npm run build:assets` → `public/build/assets/*-[hash].*` + `public/build/asset-map.json` |
| **Templates** | `/styles.css?v=<%= stylesVersion %>` | `<%= asset('styles') %>` — resolves to `/build/...` when built assets are active, else legacy URL + `?v=` |

## Layout

```
frontend/
  css/
    styles.entry.css      # @import ../../public/styles.css
  entries/
    scripts.js            # import ../../public/scripts.js
    theme-prefs.js
    …                     # one entry per page bundle
public/
  styles.css              # main stylesheet (still edited here)
  *.js                    # legacy script sources
  build/                  # gitignored; Vite output + asset-map.json
vite.config.mjs           # multi-entry build + asset-map plugin
src/platform/assetUrls.js # load map, expose res.locals.asset()
```

## Commands

| Command | When |
|---------|------|
| `npm run dev` | Server only; uses `/public/*.css` + `?v=` unless you also run assets (below). |
| `npm run dev:assets` | Watch mode: rebuild `public/build` on change (run in a second terminal). |
| `npm run build:assets` | Production bundle + `asset-map.json`. |
| `npm run build` | `build:assets` then `build-search-lists` (existing). |

## When built assets are used

`src/platform/assetUrls.js` enables hashed URLs when **both** are true:

1. `public/build/asset-map.json` exists and is non-empty (i.e. `npm run build:assets` has been run).
2. Either `GETPRO_USE_BUILD_ASSETS=1`, **or** `NODE_ENV=production`.

**Opt-out:** `GETPRO_USE_BUILD_ASSETS=0` always uses legacy `/public/...?v=stylesVersion`.

**Transition / fallback:** If `asset-map.json` is missing (fresh clone, forgot build), `asset()` falls back to the same legacy paths as before — no 404 for CSS/JS.

## EJS

- `res.locals.asset('styles')`, `asset('scripts')`, etc. — logical names match `vite.config.mjs` `entryInputs` keys.
- Adding a new bundle: add `frontend/entries/foo.js`, add key in `vite.config.mjs`, add `LEGACY_HREF` in `src/platform/assetUrls.js`, reference `asset('foo')` in templates (or re-run `scripts/patch-ejs-assets.mjs` patterns).

## Deployment

Run `npm run build` (or at least `npm run build:assets`) before `npm start` in production so `public/build/` exists. If the host only runs `npm install` + `start`, add a build step to the platform config.

**CI:** `.github/workflows/ci.yml` runs `npm run build:assets` so broken Vite configs fail the pipeline.

**Legacy `*.min.js` / `styles.min.css`:** removed from `public/`; production minification is Vite-only. Sources remain `public/*.js` and `public/styles.css`.

## Rollback

1. Set `GETPRO_USE_BUILD_ASSETS=0` or remove `public/build/asset-map.json`.
2. Revert templates to `/styles.css?v=<%= stylesVersion %>` (git revert) if you remove `res.locals.asset`.
3. Remove `vite.config.mjs`, `frontend/`, `src/platform/assetUrls.js`, and package scripts; restore `npm run build` to search-lists only.

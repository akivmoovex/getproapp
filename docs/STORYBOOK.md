# Storybook (design system)

## Stack

- **App UI:** Express + EJS, global CSS in `public/styles.css`.
- **Storybook:** `@storybook/html-vite` (Storybook 8.6) — stories return HTML strings using the **same CSS and class names** as production.

## Commands

```bash
npm run storybook          # dev server http://localhost:6006
npm run build-storybook    # production static build (see below)
```

## Deployment-ready build

| Item | Value |
|------|--------|
| **Build command** | `npm run build-storybook` |
| **Output directory** | `storybook-static/` (repo root; listed in `.gitignore` — generate in CI or locally, do not commit the folder) |
| **Artifact contents** | Plain static files: `index.html`, `iframe.html`, hashed assets under `assets/`, plus a copy of `public/` for images/fonts referenced by stories |

Prerequisites: **Node ≥20** (see `package.json` `engines`). From a clean tree:

```bash
npm ci
npm run build-storybook
# Upload or serve the entire storybook-static/ directory
```

## Hosting as a static site

Storybook needs **only** a static file server (no Node after build).

1. **Object storage + CDN** — Upload `storybook-static/` to **S3** (or GCS/Azure Blob), serve via **CloudFront** / Cloud CDN. Set **default root** `index.html` and SPA-style fallback if your host requires it (Storybook 8’s build is mostly direct paths; follow your provider’s “static site” guide).
2. **Netlify / Cloudflare Pages / Vercel (static)** — Connect repo or drag-drop the build folder; **publish directory** = `storybook-static`. **Build command** in CI: `npm run build-storybook`.
3. **nginx / Caddy** — `root /var/www/storybook-static;` (or symlink), ensure `try_files` serves `index.html` for `/` and existing files for assets.
4. **GitHub/GitLab Pages** — CI job runs `npm run build-storybook`, deploys `storybook-static` as the Pages artifact (branch or workflow output).

**URL shape:** Prefer a **dedicated hostname** (e.g. `designs.yourcompany.com` or `storybook.internal`) or a **path on an internal domain**, not the same origin as customer-facing Pro-online unless you intend it to be public docs.

## Internal vs public

| Treat as **internal** (recommended default) | Treat as **public** only if you explicitly want it |
|-----------------------------------------------|-----------------------------------------------------|
| Storybook site (design system, component states, copy that may mirror production UI) | Marketing “brand guidelines” intentionally published to customers |
| **`/ui` in-app playground** (if kept) — dev/QA; already `noindex` in app meta | — |
| CI artifacts, VPN-only URLs, basic-auth–protected preview deploys | Open internet without access control |

**Guidelines**

- **Do not** put secrets, real customer data, or internal URLs in stories or MDX. Use neutral copy and fixture data.
- **Prefer** **authentication** (SSO, VPN, Netlify/Vercel password, CloudFront signed URLs) for team Storybook deploys.
- Use **`robots.txt`** `Disallow: /` or **`noindex`** meta on the hosted HTML if the bucket/site is accidentally public — defense in depth.
- The **main product** (`npm start`) stays the public app; Storybook is **not** a substitute for production hosting.

## Short deployment checklist

- [ ] `npm run build-storybook` succeeds on CI (Node 20+).
- [ ] Publish **entire** `storybook-static/` (including copied `public/` assets).
- [ ] Choose **internal** hosting + auth unless publishing docs on purpose.
- [ ] Optional: separate **subdomain** from production app.

## Maintaining parity

When you change:

- `views/partials/components/search_bar.ejs` → update `design-system/fixtures/search-bar-html.js`.
- Token semantics → edit `public/theme.css`, then `npm run sync-inlined-theme`.

## Node version

Storybook 10+ requires newer Node; this project pins **Storybook 8.6** for compatibility with **Node 20** (see `package.json` engines).

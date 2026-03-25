# Lighthouse & Core Web Vitals — GetPro public QA playbook

**Purpose:** Repeatable, route-specific verification for the Express + EJS GetPro app after performance work (hero preload, guarded `public/scripts.js`, company logo LCP behavior, lead status `min-height`, etc.).

**Docs:** **`docs/clean-architecture.md`** · **`docs/route-ownership-matrix.md`** · **`docs/performance-aware-development-rules.md`** (PR checklist, perf-sensitive changes) · **`docs/lighthouse-checklist.md`** (how to measure) · **`docs/performance-budgets.md`** (guardrails) · **`docs/route-asset-inventory.md`** (templates/CSS/JS per route) · **`docs/performance-optimization-notes.md`** (what was found/fixed). **`docs/DESIGN_SYSTEM.md`** — UI tokens and patterns.

**Tools:** Chrome DevTools **Lighthouse** panel (or **PageSpeed Insights** for field-like remote tests). No extra frameworks required.

**Baseline rule:** Always compare runs on the **same environment** (local vs staging vs production), same **throttling** preset, and same **browser channel** (e.g. Chrome stable). Numbers drift between machines; trends matter more than absolute scores.

---

## 1. What to measure (every route)

| Metric / category | Why it matters for GetPro |
|-------------------|---------------------------|
| **LCP** | Hero (`views/index.ejs`), company logo (`views/company.ejs`), or large text. |
| **FCP** | Single blocking `styles.css` bundle — first paint after CSS. |
| **CLS** | Hero + search, directory toolbar/cards, lead `#lead_status` (`.pro-company-profile__lead-status`). |
| **INP** | Nav drawer, directory search/refine FAB, lead submit, join wizard (if testing `/join`). |
| **Performance score** | Overall bundle; regressions often from new CSS/JS or images. |
| **Accessibility** | Forms, nav, carousel — should stay ≥90 if UI unchanged. |
| **Best Practices** | HTTPS, console errors, image aspect — catch accidental regressions. |
| **SEO** | Meta/canonical from `partials/seo_meta.ejs` — quick sanity on public pages. |

---

## 2. Practical measurement workflow (tight loop)

Do this **before** merging a perf-related PR and **after** deploy to staging/production.

### Step A — Pick URLs

1. **Homepage:** tenant root, e.g. `https://{tenant}.{BASE_DOMAIN}/` (local: `http://localhost:{PORT}/` with the same tenant cookie/host routing you use for dev).
2. **Directory:** `.../directory` and one **populated** query, e.g. `.../directory?q=electrician&city=Lusaka` (adjust to your seed data).
3. **Company mini-site:** `.../{subdomain}` on the regional host (see `src/routes/public.js` — mini-site is `/{subdomain}` per tenant). Pick a listing **with a logo** and one **without** for spot checks.
4. **Optional:** No-results directory (`.../directory?q=__unlikely__`), **Join** `.../join`.

### Step B — Lighthouse runs

1. Open URL in **Chrome** → **Incognito** (or fresh profile) to reduce extension noise.
2. **DevTools → Lighthouse** (or **⋮ → More tools → Lighthouse**).
3. **Mode:** Navigation (default).
4. **Categories:** Performance, Accessibility, Best Practices, SEO.
5. **Device:** Run **Mobile** first (Core Web Vitals–oriented), then **Desktop**.
6. **Throttling:** Simulated throttling (default) is fine for repeatability; note if you switch to “applied” or no throttling for debugging.

### Step C — Record scores

Copy results into the **run log template** (section 6). Save a screenshot of the Lighthouse report if you need audit history.

### Step D — Verify LCP in DevTools

1. Open **Performance** panel → record a short reload, **or** use Lighthouse’s **View Treemap** / **LCP** row in the report.
2. **Network** panel: sort by **Priority** or find the **LCP image** (hero WebP on home; company logo on profile when present).
3. **Homepage:** Confirm an early request for hero assets — `<link rel="preload" as="image" …>` in `views/index.ejs` should align with the hero `<picture>` / `<img class="pro-home-hero-photo">`.

### Step E — CLS spot check

1. With **Performance** → enable **Layout Shift Regions** (or watch **Experience** section in Lighthouse).
2. **Homepage:** No large jump after hero paints (search bar inside hero panel should be stable).
3. **Directory:** Toolbar + first cards stable; scroll slowly on mobile width.
4. **Company:** Submit lead form (or type in fields) — `#lead_status` should not violently reflow thanks to `min-height` on `.pro-company-profile__lead-status`.

### Step F — INP spot check (manual)

1. **Throttle CPU 4×** (Performance panel) optionally.
2. Tap **Open navigation** (`#wf-app-nav-toggle`), **Refine search** FAB, **Send request** on lead form.
3. If interactions feel sluggish, capture **Performance** profile and note long tasks — compare to previous baseline.

### Step G — What counts as a regression

Investigate if **any** of these move **worse** vs your last saved run on the **same URL + environment**:

- LCP **+20%** time or **LCP element** changes (e.g. image → text unexpectedly).
- CLS **> 0.1** on a route that was **≤ 0.05** before.
- Performance score **drops ~5+ points** with no intentional UI change.
- New **console errors** or failed network requests for `styles.css` / `scripts.js` / hero images.
- **Accessibility** drops below your team floor (e.g. below 90) after a markup change.

---

## 3. Route-specific checklists

### 3.1 Homepage (`/`)

| Field | Notes |
|-------|--------|
| **Test URL** | `https://{tenant}.{BASE_DOMAIN}/` (or local equivalent). |
| **Primary LCP candidate** | Hero image: `.pro-home-hero-photo` inside `.pro-home-hero-media` (`views/index.ejs`). Text/heading can win on very slow networks — still valid. |
| **Implementation anchors** | Preload: `<link rel="preload" as="image" … imagesrcset …>` in `<head>`. Image: `fetchpriority="high"`, `width`/`height`, `decoding="async"`, responsive `srcset` + AVIF/WebP. |
| **Route-specific risks** | Large CSS blocks first paint; hero panel + search must not shift badly after paint. |
| **JS** | `scripts.js` only runs region picker / global home gate if `#wf-region-m3-root` exists (`public/scripts.js`). No directory-only work on home without DOM hooks. |
| **Manual checks** | (1) Network: hero WebP/AVIF requested early. (2) No huge layout jump after fonts/CSS. (3) Region modal (if present) opens without freezing main thread. |
| **Metrics to weight** | LCP, FCP, CLS, INP (search inputs + nav). |
| **Pass / fail hints** | **Pass:** LCP ≤ team target (e.g. &lt; 2.5s mobile simulated), CLS low, hero visible quickly. **Fail:** LCP image missing from waterfall; hero lazy-loaded by mistake; CLS &gt; 0.1 from hero/search. |

---

### 3.2 Directory results (`/directory`)

| Field | Notes |
|-------|--------|
| **Test URL A** | `.../directory` (default list). |
| **Test URL B (populated)** | `.../directory?q={term}&city={city}` — use real categories/cities from your DB so cards render (e.g. `views/directory.ejs` + `partials/directory_company_cards.ejs`). |
| **Primary LCP candidate** | Usually **text** (toolbar + first card title) or first paint of the card grid — **not** a large image (avatars are initials in `.pro-directory-card__media`). |
| **Implementation anchors** | Cards: fixed avatar tile `--layout-dim-112` (`public/styles.css`). `scripts.js`: `initDirectoryAvatarHue` only if `[data-avatar-hue]` exists; `initRefineSearchFab` only if `.pro-refine-search-fab[data-refine-target]`. |
| **Route-specific risks** | Long lists = more DOM; watch TBT/TTI. Toolbar meta row should not shift when counts update (SSR is static per request). |
| **Manual checks** | (1) No extra JS errors. (2) Scroll: no cumulative shift from late-loading fonts only. (3) Refine FAB scroll/focus still smooth. |
| **Metrics to weight** | CLS, TBT (lab), INP (FAB, filters), Performance score. |
| **Pass / fail hints** | **Pass:** CLS stable; no unnecessary work on pages without avatars (guards). **Fail:** `scripts.js` doing heavy work when `data-avatar-hue` absent (regression if guards removed). |

---

### 3.3 Directory — no results (optional)

| Field | Notes |
|-------|--------|
| **Test URL** | `.../directory?q=__no_such_query__` or filters that return **0** companies. |
| **Primary LCP candidate** | Empty-state card text (`partials/directory_empty_state.ejs`). |
| **Extra script** | `directory-empty-callback.js` is **only** included when `companies.length === 0` (`views/directory.ejs`). |
| **Manual checks** | (1) Callback form / loading / success blocks (`state-block` patterns) — no violent CLS when showing success. (2) One extra deferred script — expect slightly different JS cost vs results page. |
| **Metrics to weight** | CLS when toggling callback success; INP on “Request a call”. |

---

### 3.4 Company mini-site / profile (`/{subdomain}`)

| Field | Notes |
|-------|--------|
| **Test URL** | `https://{tenant}.{BASE_DOMAIN}/{subdomain}` — use a real slug from admin directory. Test **with logo** and **without** if possible. |
| **Primary LCP candidate** | Often **company logo** `<img class="pro-company-profile__logo">` when `logo_url` is set — **not** lazy-loaded; `fetchpriority="high"`, `decoding="async"` (`views/company.ejs`). Otherwise heading/text. |
| **Implementation anchors** | Lead status: `#lead_status` — `min-height` on `.pro-company-profile__lead-status.form-status-message`. Gallery: `.pro-company-carousel__img-wrap` has `aspect-ratio: 3/2`. QR: `loading="lazy"` + `decoding="async"`. |
| **Route-specific risks** | External logo URLs (no local preload). Lead message changes height — mitigated by min-height. |
| **Manual checks** | (1) Logo paints without intentional lazy delay. (2) Submit lead form — status line updates without large jump. (3) Carousel/QR do not block first interaction. |
| **Metrics to weight** | LCP (logo vs text), CLS (hero + lead block), INP (form submit). |
| **Pass / fail hints** | **Fail:** Logo has `loading="lazy"` again; `#lead_status` min-height removed; large CLS on gallery image load without reserved space (should not happen — aspect-ratio set). |

---

### 3.5 Join page (`/join`) — optional

| Field | Notes |
|-------|--------|
| **Test URL** | `.../join` |
| **Primary LCP candidate** | Typically hero/wizard chrome — **not** covered by the same preload as homepage. |
| **Implementation anchors** | `join.js` exits immediately if `#join-wizard` is missing (`public/join.js`). |
| **Manual checks** | Wizard steps, autocomplete, modals — INP and long tasks under interaction. |
| **Metrics to weight** | INP, TBT, CLS when step changes. |

---

## 4. Regression watchpoints (after future UI changes)

| Change | Watch |
|--------|--------|
| **Hero or company logo** | Accidental `loading="lazy"` on LCP images (`views/index.ejs` hero, `views/company.ejs` logo). |
| **Preload** | Removing or breaking `<link rel="preload" as="image" …>` on homepage — LCP regression. |
| **`public/styles.css` / `design-system.css`** | Large additions increase FCP/LCP; run Lighthouse diff after big merges. |
| **`public/scripts.js`** | Unguarded `DOMContentLoaded` logic — directory/home-only code running everywhere again. |
| **State / flash / status** | New blocks without reserved space — CLS (lead form, directory callback, admin flashes). |
| **Directory** | Heavier cards or filters above the fold — LCP/FCP. |
| **Images** | Removing `width`/`height` or `aspect-ratio` from carousel, hero, or logos. |
| **`stylesVersion` / caching** | Stale `styles.js` after deploy — hard refresh or verify query string on assets. |

---

## 5. Lighthouse run log template

Copy the block below into a PR comment, Notion page, or `docs/lighthouse-runs.md` (optional file — not required).

```text
### Lighthouse run

- Date:
- Tester:
- Environment: (local / staging / production) + base URL:
- Browser: Chrome (version)
- Route / full URL:

- Device mode: Mobile | Desktop
- Lighthouse version / Chrome channel:

Scores:
- Performance:
- Accessibility:
- Best Practices:
- SEO:

Core Web Vitals (lab):
- LCP: (s)  Element:
- FCP: (s)
- CLS:
- TBT: (if shown)
- INP: (field / lab note)

Notes:
- Anomalies (extensions off? CPU throttle?):

Suspected regression cause (if any):

Next action:

```

---

## 6. What to optimize next (after using this checklist)

1. **If LCP regresses on home:** Re-verify preload + hero `srcset` + no accidental lazy load; check Network waterfall order.
2. **If CLS regresses on company:** Inspect `#lead_status`, carousel, and dynamic inserts; restore min-height or aspect-ratio.
3. **If TBT/INP regresses on directory:** Profile `scripts.js` — confirm guards; check for new global listeners.
4. **If scores drift only in production:** Compare server headers (compression, caching), not just code.

---

## 7. Related files (quick reference)

| Concern | File(s) |
|---------|---------|
| Homepage hero + preload | `views/index.ejs` |
| Directory shell + conditional callback script | `views/directory.ejs`, `public/directory-empty-callback.js` |
| Company profile + lead form | `views/company.ejs`, `public/scripts.js` (`submitLeadForm`, `setLeadStatus`) |
| Shared layout / scripts | `views/partials/site_header.ejs`, `views/partials/app_navigation.ejs` |
| Global CSS/JS | `public/styles.css`, `public/design-system.css`, `public/scripts.js` |
| Cache-bust query | `server.js` → `stylesVersion` in templates |

For **guardrails before you ship UI changes**, see **`docs/performance-budgets.md`**. For implementation history and server tuning, see **`docs/performance-optimization-notes.md`**.

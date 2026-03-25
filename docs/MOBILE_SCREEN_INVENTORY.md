# Mobile screen inventory (GetPro public web)

This document maps **tenant public routes** to a **single screen role** for mobile product architecture. It supports treating the SSR site as the foundation for a future **Android (Material 3)** app.

**Roles**

| Role | Meaning |
|------|---------|
| **launcher** | Entry: search + shortcuts into the directory journey |
| **results** | Browse/filter listings (directory or category-scoped results) |
| **profile** | One business: contact + credibility + optional lead |
| **support** | Onboarding, help content, editorial, or platform assistance (non-core loop) |

---

## Route → role → notes

| Route | Screen role | Notes |
|-------|---------------|-------|
| `/` | **launcher** | Home: search-first; categories + help CTA; marketing/editorial blocks desktop-first |
| `/directory` | **results** | Main search results; shared toolbar; empty state + callback |
| `/directory?…` | **results** | Same screen; query state only |
| `/category/:slug` | **results** | Category-scoped listing + shared search (toolbar) |
| `/company/:id` | **profile** | Professional/business page; call/WhatsApp/lead |
| `/:miniSiteSlug` | **profile** | Company mini-site (subdomain path) — same mental model as profile |
| `/join` | **support** | Partner onboarding |
| `/articles` | **support** | Content index |
| `/articles/:slug` | **support** | Article detail |
| `/guides` | **support** | Guides index |
| `/guides/:slug` | **support** | Guide detail |
| `/answers` | **support** | FAQ index |
| `/answers/:slug` | **support** | FAQ detail |
| `/sitemap.xml` | *(non-UI)* | SEO |
| `/robots.txt` | *(non-UI)* | SEO |
| `/il` (coming soon) | **support** | Region gate / marketing (`coming_soon_il.ejs`) |
| `404` / not found | **support** | Lightweight error (`not_found.ejs`) — treat as “dead end” in app graph |

**Out of scope here (not tenant public “app” surfaces):**

| Route | Notes |
|-------|--------|
| `/admin/*` | Staff console — must not appear in public nav |
| `/api/*` | JSON APIs |
| `/healthz` | Ops |
| `/getpro-admin`, region gate paths (`/global`, `/il`, …) | Platform / routing mechanics |

---

## Overlaps & tensions

1. **`/directory` vs `/category/:slug`** — Both are **results**. Category is a **filtered slice** of the same mental screen. *Recommendation:* keep one list component/pattern; avoid divergent toolbars long term.
2. **Home vs `/directory`** — Both expose search. *Recommendation:* home = **launcher** (fast search + category shortcuts); directory = **persistent results** (chips, count, list).
3. **Editorial on home (desktop)** — Articles/guides/Q&A belong to **support**, not launcher. *Recommendation:* keep them off the mobile launcher; link out from a compact “Help & topics” row or footer.

---

## Pages that try to do too much (historical)

| Area | Issue | Direction |
|------|--------|-----------|
| Home (desktop) | Many marketing sections | Mobile: launcher-only above the fold; desktop can keep depth |
| Company profile | Aside + long primary | Mobile: contact first; demote QR/support if needed |
| Footer | Repeats directory CTAs | Acceptable; keep single primary CTA per view where possible |

---

## Material 3 mapping (web → app)

| Web pattern | M3 analogue |
|-------------|-------------|
| Top app bar (home) | `SmallTopAppBar` / compact toolbar |
| Directory toolbar | Search + filters row → future **search bar** + chips |
| Result cards | **List** + `Card` list items |
| Company hero + actions | **Profile** header + **FAB** / fixed bottom bar for call |
| Empty state callback | **Modal** / bottom sheet for interest capture |
| Articles/guides | **Secondary** destinations from nav or “Learn” hub |

---

## Simplifications already aligned

- Shared **`pro_search_form`** for home + directory + category.
- Directory **category control hidden** on results; filter via chips/hidden input when needed.
- Mobile **refine search** FAB on directory/category.
- **Autocomplete** deferred until idle/focus on launcher/results (lighter first paint).

---

## Recommended next steps (Android)

1. **Navigation graph:** `Launcher` → `Results` → `Profile`; `Support` graph for join + content.
2. **One Activity + Compose** with typed routes mirroring this table.
3. **Deep links:** `/directory`, `/company/:id`, `/category/:slug`, `/join`, `/articles/:slug`.
4. **Re-use tokens:** map CSS variables (`--wf-primary`, radii, elevation) to M3 `ColorScheme` + `Shapes`.
5. **Callbacks:** same JSON endpoints (`/api/callback-interest`, `/api/leads`).

**Structured mapping (web DS → Android M3 / Compose templates):** see **`docs/android-ui-mapping.md`**.

---

*Generated for internal architecture; update when routes change.*

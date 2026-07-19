# BlessBoard V5 — Front-end asset and CSS efficiency audit

**Date:** 2026-07-19  
**Constraint:** Low-risk improvements only. No bundler, no CDN, no V4 changes, no format conversion.  
**Measurement:** Static include/reference audit only — **no Lighthouse / RUM / transfer-size measurements.**  
**Companion suite:** `npm run test:blessboard:frontend-assets`

---

## 1. Verdict

| Area | Status |
|------|--------|
| Duplicate CSS/JS on one page | **Clean** (auth pages do not stack apex shell + auth CSS incorrectly) |
| Page-specific CSS on every apex hit | **Fixed** — `apex-auth.css` only when `activeNav === 'account'` |
| Media picker on every BA/HQ page | **Fixed** — gated by `loadMediaPicker` |
| Cache-bust drift (templates vs `src` fallbacks) | **Fixed** |
| Preview missing tokens / unversioned CSS | **Fixed** |
| `shell-nav.js` without `defer` | **Fixed** (kept first among deferred scripts) |
| CMS section img CLS attrs | **Fixed** (`width`/`height` + lazy) |
| Design-token `:root` duplication in shells | **None** (tokens stay in `design-tokens.css`) |
| Measured speed gain | **Not claimed** |

---

## 2. Assets and includes reviewed

| Kind | Locations |
|------|-----------|
| CSS | `design-tokens`, `design-system`, shell CSS (`apex`, `tenant-public`, `tenant-auth`, `apex-auth`, `member-portal`, `branch-admin`, `hq-admin`, `platform-admin`, `media-picker`) |
| JS | `design-system.js`, `shell-nav.js`, `apex.js`, `tenant-public.js`, `tenant-auth.js`, `member-portal.js`, `branch-admin.js`, `hq-admin.js`, `media-picker.js` |
| Shells | `*-shell-start/end.ejs`, auth pages, content preview |
| Images | Apex heroes/features, tenant public CMS `bb-tp-media`, brand marks under `/church/images/brand/` |
| Fallbacks | `v5FoundationServer`, HQ/BA/PA/content `sendControlled` HTML |

---

## 3. Duplicates / inefficiencies found

| Finding | Evidence | Action |
|---------|----------|--------|
| `apex-auth.css` on all marketing pages | `apex-shell-start.ejs` always linked; selectors are `.bb-auth-*` / `.bb-apex-account*` | Gate on account |
| `media-picker.css` + `.js` on every BA/HQ page | Shell start/end always linked; only media-upload pages need it | Gate on `loadMediaPicker` |
| Stale `tenant-auth.css?v=1` | `v5FoundationServer.js` rate-limit HTML | Align to `v=13` |
| Unversioned admin CSS on error HTML | HQ/BA/PA/content/members/reports controlled pages | Align to shell `?v=` |
| Preview unversioned + no tokens | `content-admin/preview.ejs` | Include DS head + versions |
| `shell-nav.js` blocking (no `defer`) | Member/BA/HQ/PA shell ends | Add `defer`, keep first |
| CMS `bb-tp-media` missing dimensions | Public section blocks | Add `width`/`height` |
| Brand logo 512×512 for 24–32px display | `blessboard-small-church-logo.png` | **Not deleted** (conversion out of scope) |
| Feature JPG intrinsic ≠ declared attrs | Homepage feature images | Document only |
| Full token `:root` copies in shells | Grep | **None** |

No double `addEventListener` / double-init found in V5 JS (`data-bound` / ready guards present).

---

## 4. Safe improvements made

1. Conditional `apex-auth.css` on apex shell (`activeNav === 'account'`)  
2. Conditional media-picker CSS/JS; `loadMediaPicker = true` on announcement form, content page/section/entities, admin resources  
3. `defer` on `shell-nav.js` (still first)  
4. Align `?v=` on controlled-error HTML + foundation rate-limit page  
5. Preview: `head-design-system` + versioned tenant-public / admin CSS  
6. CMS / preview `bb-tp-media`: `width="960" height="540"` + lazy + decoding  

---

## 5. Suspected unused / keep (not deleted)

| Asset | Why kept |
|-------|----------|
| `blessboard-small-church-logo.png` (large intrinsic) | Referenced widely; resize/format is a separate task |
| Entire `public/blessboard/v5/*.css|js` set | Each file is referenced by at least one shell or auth surface |
| V4 `/church/*` CSS/JS | Out of scope |

No V5 file was deleted.

---

## 6. Measurement limitations

- No network waterfall, Lighthouse, or byte-transfer comparison was run.  
- Savings are reasoned from **bytes no longer requested** on specific routes (e.g. apex marketing without `apex-auth.css`; BA dashboard without media-picker).  
- Do **not** treat this audit as a performance score improvement.

---

## 7. Tests

`tests/blessboard-v5-frontend-assets.test.js` via `npm run test:blessboard:frontend-assets`:

- Apex auth CSS gating  
- Media-picker `loadMediaPicker` gating + opted-in pages  
- Deferred shell-nav ordering  
- Fallback HTML cache versions  
- Preview tokens/versions  
- CMS img dimensions + hero not lazy  
- No shell `:root` primary-token redeclaration  

Also exercised: a11y-structure, shell suites, media, apex-home/auth-gui, design-system, public-pages (see completion report).

---

## 8. Exact results (2026-07-19)

| Check | Result |
|-------|--------|
| `npm run test:blessboard:frontend-assets` | **9 pass / 0 fail** |
| `npm run test:blessboard:a11y-structure` | **87 pass / 0 fail** |
| `npm run test:blessboard:media` | **23 pass / 0 fail** |
| `npm run test:blessboard:apex-auth-gui` | **4 pass / 0 fail** |
| `npm run test:blessboard:apex-home` | **3 pass / 0 fail** |
| `npm run test:blessboard:design-system` | **8 pass / 0 fail** |
| `npm run test:blessboard:branch-admin-shell` | **12 pass / 0 fail** |
| `npm run test:blessboard:hq-shell` | **9 pass / 0 fail** |
| `npm run test:blessboard:platform-admin-shell` | **12 pass / 0 fail** |
| `npm run test:blessboard:public-pages` | **29 pass / 0 fail** |
| `git diff --check` | **clean** |
| CSS lint (changed files) | **N/A** — this audit changed no CSS files (0 errors expected) |
| JS lint | **N/A** — no project eslint script for V5 JS |

**Note:** No transfer-size or Lighthouse measurement was performed.

---

## 9. Suggested commit message

```
Trim V5 asset includes: gate auth/media CSS and align cache versions.
```

# GetPro Church — screen inventory

Design references: `design-reference/stitch-screens/church-flow/` (~110 unique Stitch exports).

## Flow groups

| Folder | Screen IDs | Phase |
|--------|------------|-------|
| `01-public-website` | 01–08 | **01 implemented** (Phase 1); 02–07 deferred |
| `02-authentication` | 09–13 | Phase 2 |
| `03-member-portal` | 14–20 | Phase 2+ |
| `04-branch-admin` | 25–45 | Phase 3+ |
| `05-leader` | 46–50 | Deferred |
| `06-hq` | 58–61 | Phase 7 (report review gap — see below) |
| `07-platform-admin` | 62–68 | Phase 8 |

## Implemented routes (Phase 0–1)

| Host | Route | Template | Design ref |
|------|-------|----------|------------|
| `church.{BASE}` | `GET /` | `views/church/public/home.ejs` | 01 (vertical apex variant) |
| `{org}.church.{BASE}` | `GET /` | `views/church/public/home.ejs` | 01-public-home (branch data) |

Static assets: `public/church/church.css` (scoped; not global `styles.css`).

## MVP golden thread (screen mapping)

| Step | Screens | Status |
|------|---------|--------|
| Discover church | 01 | **Done** (homepage) |
| Register | 10, 11, 12 | Planned Phase 2 |
| Branch verify | 25, 26, 27 | Planned Phase 3 |
| Member login | 09 | Planned Phase 2 |
| Member portal | 14 | Planned Phase 4 |
| Attendance + giving | 36, 39 | Planned Phase 5 |
| Submit report | 40, 41 | Planned Phase 6 |
| HQ review | *missing export 51–57* | Planned Phase 7 |

## Known Stitch export issues

See [CHURCH_IMPLEMENTATION_PLAN.md](./CHURCH_IMPLEMENTATION_PLAN.md#known-stitch-export-issues).

Highlights:

- Exports live under `stitch-screens/church-flow/`, not `getpro-church/`
- Duplicate folders: `01-public-home-* 2`, `01-public-home-mobile 3`
- ID collision: `04-branch-admin-dashboard` vs `04-public-ministries` (canonical branch dashboard is **25**)
- Missing screen IDs: 21–24, 51–57 (HQ report review not exported)
- HQ screens 58–61 are mobile-only
- MD files are generic design-system tokens, not per-screen specs

# GetPro Church — implementation plan

## Phase status

| Phase | Scope | Status |
|-------|-------|--------|
| **0** | Foundation: host parsing, schema, repos, docs, seed | **Done** |
| **1** | Public branch + apex homepage | **Done** |
| **2** | Member register, login, verification waiting states | **Done** |
| **3** | Branch admin verification queue + approve/reject | **Done** |
| 4 | Member portal shell | Planned |
| 5 | Attendance + giving summary | Planned |
| 6 | Monthly report submit | Planned |
| 7 | HQ report review | Planned |
| 8 | Platform org provisioning | Planned |

## Phase 0 — Foundation (implemented)

1. `src/church/host.js` — parse `church.{BASE}` and `{org}.church.{BASE}`
2. `src/church/attachChurchContext.js` — middleware; sets `req.churchContext`
3. `server.js` — church middleware before company guards; `ensureChurchSchema` + sample seed on boot
4. `db/postgres/049_church_core.sql` — core tables
5. `src/db/pg/church/*Repo.js` — organization + branch repos
6. `docs/church/*` — architecture docs
7. `tests/church-host.test.js` — host parsing tests

## Phase 1 — Public homepage (implemented)

1. `src/routes/church/index.js` — `GET /` for church hosts
2. `views/church/public/home.ejs` — Kafue Baptist Church sample content
3. `public/church/church.css` — scoped Ecclesia/GetPro styling

## Known Stitch export issues

| Issue | Detail |
|-------|--------|
| Path | Exports at `design-reference/stitch-screens/church-flow/`, not `getpro-church/` |
| README drift | Stitch README lists 5 groups; repo has 7 (`05-leader`, `06-hq`, `07-platform-admin`) |
| Duplicate folders | `01-public-home-desktop 2`, `01-public-home-mobile 2/3` |
| Misplaced screens | `04-branch-admin-dashboard` inside `01-public-website/` (use **25** as canonical) |
| ID collision | Two screens prefixed `04-` |
| Missing IDs | 21–24, 51–57 (HQ report review not exported) |
| Incomplete pairs | `04-public-ministries` desktop only; `20-member-forms-documents` mobile only |
| HQ mobile-only | 58–61 have no desktop exports |
| MD content | Generic design-system YAML duplicated across screens — not route/field specs |
| HTML | Tailwind CDN prototypes — must not ship as-is |

## Next steps (Phase 2)

1. `src/church/memberAuth.js` + `src/routes/church/auth.js`
2. Templates 09–12
3. `church_members` insert on register; branch verification queue
4. Wire Register / Member Login buttons to real routes

## Safety rules

- Do not refactor regional GetPro routes or global CSS
- Church middleware must not alter `zm.*` or company subdomain behavior
- New tables only via `049_church_core.sql` and future numbered migrations

# GetPro Church — routes

Express route modules for the GetPro Church vertical.

| Module | Status |
|--------|--------|
| `index.js` | Public home + auth mount |
| `auth.js` | **Phase 2** — register, login, verification states, logout, member dashboard placeholder |
| `branchAdmin.js` | **Phase 3** — branch admin login, dashboard, verification queue, member review |

Branch-only auth routes: `/register`, `/login`, …

Branch admin routes (branch host only): `/branch/login`, `/branch/dashboard`, `/branch/member-verification`, `/branch/members/:id`, approve/reject/request-more-info actions.
- `memberPortal.js` — member portal
- `branchAdmin.js` — branch admin console
- `hqAdmin.js` — HQ console
- `platformAdmin.js` — `church.getproapp.org` platform screens

# Data directory

**Runtime:** The Express app **requires PostgreSQL** (`DATABASE_URL` / `GETPRO_DATABASE_URL`) and does **not** open SQLite for requests. **`src/db/index.js`** is a guard/stub only.

**Local files (optional / legacy):**

- **`getpro.sqlite`** — not used by `server.js`. May exist from old workflows or external tools; safe to omit on new setups.
- **`sessions.db`** — **not used** by current `server.js` (sessions are **`connect-pg-simple`** → **`public.session`**). Mentioned here only for archaeology if you inspect very old revisions.

**Other:** Stray `*.sqlite` names are not referenced by this codebase. WAL sidecars (`*.sqlite-wal`, `*.sqlite-shm`) may appear next to any SQLite file you create manually.

`SQLITE_PATH` is irrelevant to production boot unless you run **external** SQLite tooling yourself.

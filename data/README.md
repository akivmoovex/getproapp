# Data directory

- **`getpro.sqlite`** — default SQLite database for GetPro (unless overridden with `SQLITE_PATH`).
- **`sessions.db`** — session store used by the app when `SESSION_DIR` / `SESSION_DB_PATH` point here (see `server.js`).

**Not used by this app:** Stray databases such as `netraz.sqlite`, `pronline.sqlite` (or similar names) are **not** referenced in code. SQLite may also create **`*.sqlite-wal`** and **`*.sqlite-shm`** next to any DB file when WAL mode is active — delete those together when removing an unused database.

Only set **`SQLITE_PATH`** if you intentionally use a different main DB file than `data/getpro.sqlite`.

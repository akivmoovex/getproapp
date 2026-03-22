# Data directory

- **`getpro.sqlite`** — default SQLite database for GetPro (unless overridden with `SQLITE_PATH`).
- **`sessions.db`** — optional session store file when configured (gitignored).

Other `*.sqlite` or `*.db` files (e.g. from other projects or manual copies) are **not** used by this app unless `SQLITE_PATH` points at them.

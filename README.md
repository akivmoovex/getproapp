# GetPro (getproapp.org)

Node + Express directory app using SQLite via `better-sqlite3`.

## Hostinger / Linux: `invalid ELF header` on `better_sqlite3.node`

That error means the **native addon was built for another OS** (e.g. macOS/Windows) and was deployed to **Linux**. Common causes:

1. **`node_modules` was uploaded or committed** from your laptop — don’t do that.
2. The host ran **no install** on Linux, or an old `node_modules` folder overwrote a good one.

**Fix:**

1. Ensure **`node_modules` is not in Git** (see `.gitignore`) and not in your deployment ZIP/FTP upload.
2. On Hostinger, use a **build/install step on the server** (or their CI) so dependencies install **on Linux**:
   - Typical build command: `npm install` or `npm ci`
   - If a bad binary is still there, run once: `npm run rebuild-sqlite` (or `npm rebuild better-sqlite3`).
3. Redeploy so **`npm install` runs on Hostinger’s Linux environment** after upload.

`better-sqlite3` includes a platform-specific `.node` file; it must match the server OS and Node version.

## Local development

```bash
cp .env.example .env
# set ADMIN_PASSWORD in .env
npm install
npm start
```

## Environment

See `.env.example` for variables (admin, session, SQLite paths, domain).

Production: set `BASE_DOMAIN=getproapp.org` (and `PUBLIC_SCHEME=https` if needed). Platform contact env vars: `GETPRO_EMAIL`, `GETPRO_ADDRESS` (legacy `PRO_ONLINE_*` / `NETRA_*` still work). If you used the old default database file, either rename `data/pronline.sqlite` to `data/getpro.sqlite` or set `SQLITE_PATH` to the old path.
# getpro

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

Create a `.env` file in the project root (this file is gitignored). Example:

```bash
# Required for first boot
ADMIN_PASSWORD=your-secure-password

# Recommended
NODE_ENV=development
SESSION_SECRET=use-a-long-random-string-in-production
BASE_DOMAIN=

npm install
npm start
```

Home and directory search use autocomplete lists in `public/data/search-lists.json` (professional services + Zambia places). Regenerate with:

```bash
npm run build-search-lists
```

After editing that JSON, **restart the Node server** so directory search validation reloads the file.

The animated “typing” hint in each field is controlled by `data-watermark-text` on the `.pro-ac` blocks in `views/index.ejs` and `views/directory.ejs` (demo words only; the real options are the full lists in `search-lists.json`).

## Environment

**Common variables:** `ADMIN_PASSWORD` (required), `SESSION_SECRET`, `NODE_ENV`, `BASE_DOMAIN`, `PORT`, `HOST`, `SQLITE_PATH`, `SESSION_DIR`, `GETPRO_EMAIL`, `GETPRO_ADDRESS`, `CALL_CENTER_PHONE`, plus legacy `PRO_ONLINE_*` / `NETRA_*` if needed.

**Production:** set `BASE_DOMAIN=getproapp.org` (and `PUBLIC_SCHEME=https` if needed). On hosts that don’t deploy `.env`, set the same keys in the panel’s environment variables.

If you used the old default database file, either rename `data/pronline.sqlite` to `data/getpro.sqlite` or set `SQLITE_PATH` to the old path.

# BlessBoard public launch — hosting configuration

**Status:** Internal operations guide. Complements in-app redirects in `src/church/blessboardCanonicalRedirect.js`.

**Canonical platform domain:** `https://blessboard.com` (non-www apex)

**Also accepted as BlessBoard apex aliases** (same product routes; redirected to `.com` by default):

- `blessboard.org`
- `www.blessboard.org`

Configure via `BLESSBOARD_APEX_DOMAINS` (defaults include the four apex hosts above). Tenant church subdomains remain under `*.blessboard.com` only — `www` and `.org` are never treated as tenants.

---

## What the application handles

When `BLESSBOARD_CANONICAL_REDIRECT` is not `0`, the Node app issues **301** redirects for BlessBoard product hosts (`blessboard.com`, apex aliases, and `*.blessboard.com`):

| Condition | Redirect |
|-----------|----------|
| Host is a non-canonical apex (`www.blessboard.com`, `blessboard.org`, `www.blessboard.org`) | `https://blessboard.com` + same path and query |
| Request is HTTP (non-localhost) | `https://` + same host + path and query |

Local development (`localhost`, `127.0.0.1`) is not forced to HTTPS unless you set `PUBLIC_SCHEME=https`.

Disable in-process redirects for tests: `BLESSBOARD_CANONICAL_REDIRECT=0`  
Disable HTTPS forcing only: `BLESSBOARD_FORCE_HTTPS=0`

---

## What hosting / reverse proxy should still configure

Even with application redirects, configure the edge layer for performance, HSTS, and certificate coverage:

### 1. TLS certificates

- `blessboard.com`
- `www.blessboard.com` (redirect target should be apex)
- `blessboard.org` / `www.blessboard.org` (alias apex — must hit the same Node app as BlessBoard)
- `*.blessboard.com` (tenant church subdomains)

### 2. Recommended nginx (or equivalent) rules

```nginx
# Apex www → non-www
server {
  listen 443 ssl http2;
  server_name www.blessboard.com;
  return 301 https://blessboard.com$request_uri;
}

# HTTP → HTTPS (all BlessBoard hosts)
server {
  listen 80;
  server_name blessboard.com *.blessboard.com;
  return 301 https://$host$request_uri;
}
```

If the app sits behind a proxy, set:

- `X-Forwarded-Proto: https` on HTTPS requests
- `X-Forwarded-Host` to the original host when terminating TLS at the edge

### 3. HSTS (optional, after HTTPS is stable)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

Apply only when all tenant subdomains serve valid HTTPS.

### 4. Do not redirect tenant hosts to apex

`demo.blessboard.com` must remain on its subdomain. Only non-canonical **apex** aliases (`www.blessboard.com`, `blessboard.org`, `www.blessboard.org`) redirect to `blessboard.com`.

### 5. Hostinger: attach `blessboard.org` to the BlessBoard Node app

If `blessboard.org` shows the GetPro / Pro-online directory instead of BlessBoard, the domain is almost certainly mapped to the wrong Node.js application (or an outdated deploy). Confirm in hPanel:

1. `blessboard.org` and `www.blessboard.org` are on the **same** Node.js app / document root as `blessboard.com` (or deploy this codebase to whichever app currently receives `.org` traffic).
2. DNS A/CNAME for apex + www no longer point at an old Proline / unrelated site.
3. SSL covers `blessboard.org` and `www.blessboard.org`.
4. No Hostinger redirect rule sends `.org` to Proline or getproapp.org marketing.
5. After env changes (`BLESSBOARD_APEX_DOMAINS`, etc.), restart the Node.js application.

---

## SEO outputs that assume apex HTTPS

These are generated in code and already use `https://blessboard.com`:

- `<link rel="canonical">` on marketing pages
- Open Graph `og:url`
- JSON-LD `Organization`, `WebSite`, `BreadcrumbList`
- `/sitemap.xml` loc entries
- `/robots.txt` Sitemap directive

Tenant church sites use **self-referencing** canonicals on their own host (see `docs/blessboard-directory-seo-notes.md`).

---

## Social preview image asset

Add when design is ready:

`public/images/brand/blessboard-social-preview-1200x630.jpg` (1200×630)

Then update `BLESSBOARD_SOCIAL_PREVIEW_IMAGE_PATH` in `src/church/branding.js` to point at the new file.

Until then, the platform uses the temporary homepage auditorium image defined in branding.

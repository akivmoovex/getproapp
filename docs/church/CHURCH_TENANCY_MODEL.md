# GetPro Church — tenancy model

GetPro Church is an **orthogonal vertical** on `getproapp.org`. It does not replace regional GetPro tenants (`zm`, `il`, …) or company marketing subdomains.

## Host patterns

| Host | Context kind | Example |
|------|--------------|---------|
| `church.{BASE_DOMAIN}` | `vertical-apex` | `church.getproapp.org` |
| `{orgSlug}.church.{BASE_DOMAIN}` | `branch` | `kafuebaptist.church.getproapp.org` |

Parsing lives in `src/church/host.js`. Middleware in `src/church/attachChurchContext.js` sets:

- `req.isChurchHost` — `true` on any church vertical host
- `req.churchContext` — `{ kind, host, orgSlug?, organization?, branch? }`

## Regional tenant linkage

Each `church_organizations` row stores `platform_tenant_id` (FK to `public.tenants`) for locale, phone rules, and future billing. **Routing is driven by the church host**, not `{org}.zm.getproapp.org`.

Sample seed org **Kafue Baptist Church** uses the Zambia tenant (`zm`, id 4).

## Reserved label: `church`

The subdomain label `church` is reserved for the vertical apex. Church branch hosts (`*.church.*`) are never classified as company marketing subdomains.

Implementation:

1. `createAttachChurchContext()` runs **before** company-subdomain guards in `server.js`.
2. When `req.isChurchHost` is true, company mini-site restrictions and legacy company `GET /` redirects are skipped.

## Unchanged GetPro hosts

These continue to behave as before:

- `zm.getproapp.org`, `il.getproapp.org`, … — regional platform tenants
- `{companySlug}.getproapp.org` — company marketing subdomains (when not a church host)
- Apex `getproapp.org` / `www.getproapp.org` — global home

## Local development

Set `BASE_DOMAIN` in `.env` (e.g. `getproapp.org` or `localhost` testing via Host header).

Test with curl:

```bash
curl -H "Host: kafuebaptist.church.getproapp.org" http://127.0.0.1:3000/
curl -H "Host: church.getproapp.org" http://127.0.0.1:3000/
curl -H "Host: zm.getproapp.org" http://127.0.0.1:3000/
```

For localhost without a matching BASE_DOMAIN suffix, church parsing returns null unless BASE_DOMAIN is configured to match your test host pattern.

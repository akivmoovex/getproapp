# V211 Shared EJS Rendering Audit

Branch `V11`, commit `33603f307f8576228ac27c3de2ceb9ec25107efb`. Read-only runtime analysis; no runtime, product, database, deployment, or public-route changes were made.

## Renderer inventory

### BlessBoard

`src/blessboard/http/v5EjsTemplateCache.js`

- Root: `views/blessboard/v5`.
- `loadV5Template(relativePath)` joins the root and reads source synchronously.
- A module `Map` caches `{ source, filename }` by the caller-supplied relative path.
- `renderV5Ejs(relativePath, data)` calls `ejs.render(source, locals, { filename })`.
- Default locals are BlessBoard-specific: deployment brand, build identity, CDN marketing asset, runtime image/media presentation, image-placement style, and video embed helpers.
- EJS `filename` is preserved for include resolution; no `root` or `views` option is supplied.
- No explicit path traversal validation or file existence error translation is present.
- Consumers include `renderApexMarketing.js`, `renderApexLegal.js`, `renderWebsiteSetupPage.js`, and `renderTenantPublicPage.js`; those consumers are reached by BlessBoard apex, tenant, and website routes.

### ActiveClinic public renderer

`src/activeclinic/http/renderActiveClinicPublic.js`

- Root: `views/activeclinic`.
- `renderPartial(relativePath, data)` appends `.ejs` when needed, joins the root, checks `existsSync`, reads synchronously, and calls `ejs.render`.
- It supplies `filename`, `root`, and `views`, so absolute and relative include resolution differs intentionally from the BlessBoard renderer.
- Default locals include build identity, CSRF field, CDN asset helper, HTML escaping, booking labels, phone fields, SEO, clinic website navigation, registration presentation, and public media locals.
- `renderPublicPage` composes product-specific header, footer, body, and shell templates.
- `renderPublicView` is a deprecated compatibility wrapper used by older ActiveClinic callers.
- Consumers include ActiveClinic public routes and compatibility/auth/public state paths.

### Additional renderers

`src/activeclinic/http/renderActiveClinicView.js` is a second ActiveClinic generic renderer. It reads synchronously and calls `ejs.render` with `filename`, `root`, and `views`, plus only a CDN helper. It is consumed by `renderActiveClinicAuth.js` and other ActiveClinic auth/view modules.

`src/blessboard/http/renderTenantPublicPage.js` duplicates the BlessBoard source-cache/render pattern and adds church-specific date, media, initials, URL, and tenant-page locals.

Other Platform renderers under `src/platform/website`, `src/platform/registration`, and release-note/admin modules are page/domain renderers, not an existing generic EJS source-loading utility. No existing `src/platform` renderer provides the proposed product-neutral primitive.

## Mechanism comparison

| Mechanism | BlessBoard | ActiveClinic | Assessment |
|---|---|---|---|
| `fs.readFileSync` | Cached source loader | Public partials and generic view loader | Duplicated |
| `ejs.render` | Yes | Yes | Duplicated |
| `ejs.renderFile` | No evidence in inspected renderers | No evidence in inspected renderers | Not a target |
| `res.render` | Route/template layer uses Express in other paths | Route/template layer uses Express in other paths | Not equivalent to these helpers |
| Template cache | `Map`, source cache | No equivalent cache in inspected AC helpers | Deliberate behavioral difference |
| Root | BlessBoard V5 root | ActiveClinic root | Must remain adapter-owned |
| Includes | `filename` only | `filename`, `root`, `views` | Contract difference; unsafe to flatten |
| Defaults | Church/brand/media/build locals | Clinic/SEO/CSRF/booking/media/build locals | Product-specific |
| Escaping | Delegated to EJS/templates | Explicit `escapeHtml` plus EJS | Product behavior |
| Missing template | Native read error | Explicit ActiveClinic error for partials | Error contract difference |

## Consumers and compatibility

The functions are not unused: they are referenced by product HTTP renderers, shell composition, legal/about/marketing pages, tenant public pages, auth pages, and compatibility wrappers. Dynamic template names include ActiveClinic `contentTemplate` and BlessBoard page selection. Static grep cannot prove the complete route set because callers can derive template paths from request/page state.

No template files should move. BB and AC adapters must continue to own their locals, SEO, navigation, media, branding, and route-specific composition.

## Proposed Platform boundary

The candidate shape is:

```text
renderEjsTemplate({
  viewsRoot,
  relativePath,
  locals,
  cachePolicy,
  renderOptions
})
```

This would need validated relative-path handling, explicit cache policy, preserved `filename`/`root`/`views` semantics, error compatibility, and a decision about development invalidation. It must not accept untrusted paths without containment validation.

The current implementations do not share the same include contract or cache contract. A generic utility would either expose product-specific options or silently change behavior. Therefore the safe boundary is not ready for extraction.

## Measured benefit

Measured source mechanisms:

- BlessBoard cached source load plus render path: approximately 10 generic lines in `v5EjsTemplateCache.js`.
- ActiveClinic generic view load plus render path: approximately 19 lines in `renderActiveClinicView.js`.
- ActiveClinic public partial load plus render path: approximately 22 lines in `renderActiveClinicPublic.js`.
- BlessBoard tenant renderer repeats the cached load/render mechanism, but its surrounding helper code is product-specific.

The directly duplicated low-level mechanism is therefore approximately 51 source lines across the inspected helpers, before tests and API validation. This is an upper-bound mechanism count, not a claim that 51 lines can be deleted: ActiveClinic partial composition and BlessBoard tenant behavior are not interchangeable.

Estimated Platform utility: 30–45 lines plus 40–70 lines of characterization tests and adapters. Estimated net source-line reduction: **negative or negligible** after validation, adapters, path containment, cache invalidation, and compatibility tests. No measurable maintenance benefit justifies extraction at this stage.

## Risks

- Changing `filename`, `root`, or `views` can break EJS includes.
- Sharing a cache can serve stale templates in development or cross product roots.
- Joining untrusted relative paths without containment checks creates traversal risk.
- Normalizing errors can break route-level status/error behavior.
- Shared defaults could leak BB branding into AC or clinic/SEO/CSRF locals into church templates.
- A shared helper could accidentally become a second template policy authority.

No authentication, CSRF, session, RBAC, tenant, database, startup, or public URL behavior should be involved.

## Characterization test plan

Before reconsidering extraction, add deterministic fixture tests for:

1. BB and AC roots resolve only their own templates.
2. Relative EJS includes use the current `filename` behavior.
3. AC `root`/`views` include behavior remains unchanged.
4. BB source cache hits and development cache policy are explicit.
5. Missing-template errors preserve product-specific messages/status handling.
6. EJS escaping and product default locals remain byte-for-byte equivalent.
7. Header/footer/body public shell composition remains unchanged.
8. Dynamic template paths cannot escape the selected root.
9. Product branding and helper namespaces remain isolated.
10. Compatibility exports (`renderPublicView` and BlessBoard renderer exports) remain unchanged.

Use safe fixture templates and HTML parity comparisons after normalizing only nondeterministic build data. Do not use database-mutating suites.

## Recommendation

`EXTRACTION_RECOMMENDATION=NO_EXTRACTION`. The duplicated primitive is real, but the cache and include contracts differ, product locals dominate the surrounding code, and the measured net reduction is negative or negligible. Keep the renderers product-specific. Revisit only after a separately approved fixture/parity test batch demonstrates identical include, cache, error, path, and HTML behavior.

`EXTRACTION_READY=NO`.

Smallest reversible next step: characterization fixtures only; no Platform API, no adapter migration, and no template movement. Rollback is removal of those fixtures/tests.

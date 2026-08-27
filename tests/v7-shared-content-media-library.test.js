"use strict";

/**
 * V1 shared content/media library.
 *
 * Storage stays product-owned (ActiveClinic: platform.website_media,
 * BlessBoard: blessboard.media_assets). These tests pin the shared interaction
 * model both products adapt onto: one canonical card shape, shared search and
 * type filtering, shared empty states, one rendered UI, and no leakage of
 * internal storage fields.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const libraryModel = require("../src/platform/website/libraryModel");
const {
  renderWebsiteLibrary,
  LIBRARY_STYLESHEET,
  TEMPLATE,
} = require("../src/platform/website/renderWebsiteLibrary");

const ROOT = path.join(__dirname, "..");
const readRepoFile = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Rows shaped like each product's real list output.
const AC_ROW = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "org-secret",
  instanceId: "instance-secret",
  uploaderIdentityId: "identity-secret",
  mediaKind: "image",
  originalFilename: "reception.png",
  storageKey: "website/org/instance/abc-reception.png",
  mimeType: "image/png",
  sizeBytes: 204800,
  widthPx: null,
  heightPx: null,
  altText: "Reception desk",
  status: "active",
  sha256: "deadbeefdeadbeef",
  createdAt: "2026-08-01T09:00:00.000Z",
  publicSrc: "/clinics/demo-clinic/website/media/11111111-1111-4111-8111-111111111111",
});

const BB_ROW = Object.freeze({
  id: "22222222-2222-4222-8222-222222222222",
  originalFilename: "bulletin.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1572864,
  visibility: "private",
  createdAt: "2026-07-15T09:00:00.000Z",
  category: "document",
  deliveryPath: "/_bb/media/22222222-2222-4222-8222-222222222222",
  previewPath: "/hq/content/media/22222222-2222-4222-8222-222222222222",
});

// ————————————————————————————————————————————————————————————————
// Canonical card shape
// ————————————————————————————————————————————————————————————————

test("both products normalize onto one canonical card shape", () => {
  const ac = libraryModel.normalizeLibraryItem(AC_ROW);
  const bb = libraryModel.normalizeLibraryItem(BB_ROW, { previewUrl: BB_ROW.previewPath });

  assert.deepEqual(Object.keys(ac).sort(), Object.keys(bb).sort());
  assert.equal(ac.kind, libraryModel.LIBRARY_KIND.IMAGE);
  assert.equal(bb.kind, libraryModel.LIBRARY_KIND.DOCUMENT);
  assert.equal(ac.title, "reception.png");
  assert.equal(bb.title, "bulletin.pdf");
  assert.equal(ac.sizeLabel, "200 KB");
  assert.equal(bb.sizeLabel, "1.5 MB");
  assert.equal(ac.createdAtLabel, "2026-08-01");
  assert.equal(bb.visibility, "private");
});

test("normalizing drops internal storage fields so they cannot reach a client", () => {
  const item = libraryModel.normalizeLibraryItem(AC_ROW);
  for (const banned of [
    "storageKey",
    "storageBucket",
    "sha256",
    "organizationId",
    "instanceId",
    "uploaderIdentityId",
    "payloadBytes",
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(item, banned),
      false,
      `${banned} must not survive normalization`
    );
  }
  const serialized = JSON.stringify(item);
  assert.doesNotMatch(serialized, /org-secret|instance-secret|identity-secret|deadbeef/);
  assert.doesNotMatch(serialized, /website\/org\/instance/);
});

test("kind resolves from declared kind or MIME type", () => {
  const k = libraryModel.LIBRARY_KIND;
  assert.equal(libraryModel.resolveKind({ mediaKind: "image" }), k.IMAGE);
  assert.equal(libraryModel.resolveKind({ category: "document" }), k.DOCUMENT);
  assert.equal(libraryModel.resolveKind({ mediaKind: "video_url" }), k.VIDEO);
  assert.equal(libraryModel.resolveKind({ mimeType: "image/webp" }), k.IMAGE);
  assert.equal(libraryModel.resolveKind({ mimeType: "application/pdf" }), k.DOCUMENT);
  assert.equal(libraryModel.resolveKind({}), k.DOCUMENT);
});

test("alt text is optional and never invented", () => {
  const withAlt = libraryModel.normalizeLibraryItem(AC_ROW);
  assert.equal(withAlt.altText, "Reception desk");
  assert.equal(withAlt.supportsAltText, true);

  // BlessBoard media rows carry no alt column; alt text is section-scoped there.
  const withoutAlt = libraryModel.normalizeLibraryItem(BB_ROW);
  assert.equal(withoutAlt.altText, null);
  assert.equal(withoutAlt.supportsAltText, false);

  const emptyAlt = libraryModel.normalizeLibraryItem({ ...AC_ROW, altText: "" });
  assert.equal(emptyAlt.altText, "");
  assert.equal(emptyAlt.supportsAltText, true);
});

test("rows without an id are rejected", () => {
  assert.equal(libraryModel.normalizeLibraryItem({ originalFilename: "x.png" }), null);
  assert.equal(libraryModel.normalizeLibraryItem(null), null);
  assert.deepEqual(libraryModel.normalizeLibraryItems(null), []);
  assert.equal(libraryModel.normalizeLibraryItems([AC_ROW, { nope: 1 }]).length, 1);
});

test("byte formatting is human readable", () => {
  assert.equal(libraryModel.formatBytes(0), "—");
  assert.equal(libraryModel.formatBytes(512), "512 B");
  assert.equal(libraryModel.formatBytes(2048), "2 KB");
  assert.equal(libraryModel.formatBytes(5 * 1024 * 1024), "5 MB");
  assert.equal(libraryModel.formatBytes("nonsense"), "—");
});

// ————————————————————————————————————————————————————————————————
// Shared search and type filtering
// ————————————————————————————————————————————————————————————————

const MIXED = [
  AC_ROW,
  BB_ROW,
  { id: "33333333-3333-4333-8333-333333333333", originalFilename: "logo.svgz", mimeType: "image/webp", sizeBytes: 4096 },
];

test("search matches filename and alt text, case insensitively", () => {
  const items = libraryModel.normalizeLibraryItems(MIXED);
  assert.equal(libraryModel.filterLibraryItems(items, { q: "RECEPTION" }).length, 1);
  assert.equal(libraryModel.filterLibraryItems(items, { q: "desk" })[0].title, "reception.png");
  assert.equal(libraryModel.filterLibraryItems(items, { q: "bulletin" }).length, 1);
  assert.equal(libraryModel.filterLibraryItems(items, { q: "nothing-here" }).length, 0);
  assert.equal(libraryModel.filterLibraryItems(items, {}).length, 3);
});

test("type filtering uses the canonical kind", () => {
  const items = libraryModel.normalizeLibraryItems(MIXED);
  assert.equal(libraryModel.filterLibraryItems(items, { kind: "image" }).length, 2);
  assert.equal(libraryModel.filterLibraryItems(items, { kind: "document" }).length, 1);
  assert.equal(libraryModel.filterLibraryItems(items, { kind: "bogus" }).length, 3);
});

test("search and type filtering combine", () => {
  const items = libraryModel.normalizeLibraryItems(MIXED);
  assert.equal(libraryModel.filterLibraryItems(items, { kind: "image", q: "logo" }).length, 1);
  assert.equal(libraryModel.filterLibraryItems(items, { kind: "document", q: "logo" }).length, 0);
});

test("queries are trimmed and length capped", () => {
  assert.equal(libraryModel.normalizeQuery("  a   b  "), "a b");
  assert.equal(libraryModel.normalizeQuery("x".repeat(500)).length, libraryModel.MAX_QUERY_LENGTH);
  assert.equal(libraryModel.normalizeQuery(null), "");
});

// ————————————————————————————————————————————————————————————————
// View model and empty states
// ————————————————————————————————————————————————————————————————

test("view model reports the three distinct empty states", () => {
  const items = libraryModel.normalizeLibraryItems(MIXED);
  const S = libraryModel.LIBRARY_STATE;

  assert.equal(libraryModel.buildLibraryView({ items }).state, S.READY);
  assert.equal(libraryModel.buildLibraryView({ items: [] }).state, S.EMPTY);
  assert.equal(libraryModel.buildLibraryView({ items, q: "zzz" }).state, S.NO_RESULTS);
  assert.equal(libraryModel.buildLibraryView({ items, error: true }).state, S.ERROR);

  const errored = libraryModel.buildLibraryView({ items, error: true });
  assert.equal(errored.items.length, 0, "an errored library must not render stale rows");
  assert.equal(errored.isEmpty, true);
});

test("empty-state copy differs per state and is overridable per product", () => {
  const items = libraryModel.normalizeLibraryItems(MIXED);
  const empty = libraryModel.buildLibraryView({ items: [] }).emptyState;
  const noResults = libraryModel.buildLibraryView({ items, q: "zzz" }).emptyState;
  assert.notEqual(empty.title, noResults.title);

  const custom = libraryModel.buildLibraryView({
    items: [],
    emptyState: { title: "No media uploaded yet" },
  });
  assert.equal(custom.emptyState.title, "No media uploaded yet");
  assert.ok(custom.emptyState.body, "overriding the title keeps the shared body copy");
});

test("type filters are offered only for kinds the tenant actually has", () => {
  const imagesOnly = libraryModel.buildLibraryView({
    items: libraryModel.normalizeLibraryItems([AC_ROW]),
  });
  assert.deepEqual(imagesOnly.kindFilters, [], "a single kind needs no filter tabs");

  const mixed = libraryModel.buildLibraryView({
    items: libraryModel.normalizeLibraryItems(MIXED),
    basePath: "/app/settings/website/media",
  });
  const labels = mixed.kindFilters.map((f) => f.label);
  assert.deepEqual(labels, ["All", "Images", "Documents"]);
  assert.equal(mixed.kindFilters[0].current, true);
  assert.equal(mixed.counts.image, 2);
  assert.equal(mixed.counts.document, 1);
  assert.ok(!labels.includes("Videos"), "no video files means no video tab");
});

test("filter links preserve the active search term", () => {
  const view = libraryModel.buildLibraryView({
    items: libraryModel.normalizeLibraryItems(MIXED),
    basePath: "/app/settings/website/media",
    q: "e",
  });
  const images = view.kindFilters.find((f) => f.key === "image");
  assert.ok(images.href.includes("q=e"));
  assert.ok(images.href.includes("type=image"));
});

test("view model reports filtered and total counts separately", () => {
  const view = libraryModel.buildLibraryView({
    items: libraryModel.normalizeLibraryItems(MIXED),
    kind: "image",
  });
  assert.equal(view.total, 3);
  assert.equal(view.filteredTotal, 2);
});

// ————————————————————————————————————————————————————————————————
// Shared rendered UI
// ————————————————————————————————————————————————————————————————

test("shared UI renders consistent cards for both products", () => {
  const view = libraryModel.buildLibraryView({
    items: libraryModel.normalizeLibraryItems(MIXED, (row) => ({
      previewUrl: row.publicSrc || row.previewPath || null,
      detailsUrl: `/details/${row.id}`,
    })),
    basePath: "/app/settings/website/media",
    heading: "Media Library",
  });
  const html = renderWebsiteLibrary(view);

  assert.ok(html.includes('data-gp-library="1"'));
  assert.ok(html.includes('data-gp-library-grid="1"'));
  assert.equal((html.match(/data-gp-library-item="1"/g) || []).length, 3);
  assert.ok(html.includes("Media Library"));
  assert.ok(html.includes("reception.png"));
  assert.ok(html.includes("bulletin.pdf"));
  assert.ok(html.includes("200 KB"));
  assert.ok(html.includes("Alt text"));
  // Images get a real thumbnail; non-images get a placeholder, not a broken img.
  assert.ok(html.includes('class="gp-lib__thumb-img"'));
  assert.ok(html.includes("gp-lib__thumb-placeholder"));
});

test("shared UI renders the empty state instead of an empty grid", () => {
  const html = renderWebsiteLibrary(libraryModel.buildLibraryView({ items: [] }));
  assert.ok(html.includes('data-gp-library-empty="1"'));
  assert.ok(html.includes('role="status"'));
  assert.ok(!html.includes('data-gp-library-grid="1"'));
});

test("shared UI escapes untrusted filenames and alt text", () => {
  const view = libraryModel.buildLibraryView({
    items: libraryModel.normalizeLibraryItems([
      {
        id: "44444444-4444-4444-8444-444444444444",
        originalFilename: '<img src=x onerror=alert(1)>"evil',
        mimeType: "image/png",
        sizeBytes: 10,
        altText: '"><script>alert(2)</script>',
      },
    ]),
  });
  const html = renderWebsiteLibrary(view);
  assert.ok(!html.includes("<script>"), "alt text must not inject markup");
  assert.ok(!html.includes("<img src=x"), "filenames must not inject elements");
  // The raw double quote must be escaped everywhere, or it would terminate the
  // title="…" and alt="…" attributes and let the rest become markup.
  assert.ok(!/(?:title|alt)="[^"]*"[a-z]/i.test(html), "attributes must not be breakable");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&#34;") || html.includes("&quot;"));
});

test("shared UI exposes search and type filtering when there is content", () => {
  const view = libraryModel.buildLibraryView({
    items: libraryModel.normalizeLibraryItems(MIXED),
    basePath: "/hq/content/media",
  });
  const html = renderWebsiteLibrary(view);
  assert.ok(html.includes('type="search"'));
  assert.ok(html.includes('name="q"'));
  assert.ok(html.includes('action="/hq/content/media"'));
  assert.ok(html.includes('aria-label="Filter files by type"'));
  assert.ok(html.includes('role="search"'));
});

test("shared UI hides the search box when the library is empty", () => {
  const html = renderWebsiteLibrary(libraryModel.buildLibraryView({ items: [] }));
  assert.ok(!html.includes('type="search"'), "nothing to search in an empty library");
});

test("the search form keeps the active type filter", () => {
  const html = renderWebsiteLibrary(
    libraryModel.buildLibraryView({
      items: libraryModel.normalizeLibraryItems(MIXED),
      basePath: "/hq/content/media",
      kind: "image",
    })
  );
  assert.ok(html.includes('<input type="hidden" name="type" value="image"/>'));
});

test("renderWebsiteLibrary rejects a missing view model", () => {
  assert.throws(() => renderWebsiteLibrary(null), TypeError);
});

// ————————————————————————————————————————————————————————————————
// Shared stylesheet: mobile 390 / 360 and overflow safety
// ————————————————————————————————————————————————————————————————

test("shared library stylesheet exists and is versioned", () => {
  assert.match(LIBRARY_STYLESHEET, /^\/platform\/website-library\.css\?v=/);
  assert.ok(fs.existsSync(path.join(ROOT, "public/platform/website-library.css")));
  assert.ok(fs.existsSync(TEMPLATE));
});

test("shared library CSS collapses to one column and avoids horizontal overflow at 390/360", () => {
  const css = readRepoFile("public/platform/website-library.css");
  assert.match(css, /@media \(max-width: 480px\)/, "must cover 390px and 360px viewports");

  const mobile = css.slice(css.indexOf("@media (max-width: 480px)"));
  assert.match(mobile, /\.gp-lib__grid\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(mobile, /\.gp-lib__toolbar\s*\{[^}]*flex-direction:\s*column/);

  // Page-level overflow guards.
  assert.match(css, /\.gp-lib\s*\{[\s\S]*?overflow-x:\s*clip/);
  assert.match(css, /overflow-wrap:\s*anywhere/, "long filenames must wrap, not widen cards");
  // Fixed pixel widths on elements would overflow a 360px viewport. Breakpoint
  // declarations (max-width/min-width in @media) are legitimately in px.
  assert.ok(
    !/(?:^|[\s;{])width:\s*\d{3,}px/m.test(css),
    "no fixed pixel element widths that could overflow 360px"
  );
});

test("shared library CSS inherits product design tokens rather than hard-coding a palette", () => {
  const css = readRepoFile("public/platform/website-library.css");
  assert.match(css, /--gp-lib-border:\s*var\(--ac-mw-border,\s*var\(--bb-border/);
  assert.match(css, /--gp-lib-accent:\s*var\(--ac-mw-accent,\s*var\(--bb-primary/);
});

test("shared library CSS keeps touch targets usable", () => {
  const css = readRepoFile("public/platform/website-library.css");
  const btn = css.slice(css.indexOf(".gp-lib__btn {"));
  assert.match(btn, /min-height:\s*2\.75rem/);
});

// ————————————————————————————————————————————————————————————————
// Product wiring: adapters, not duplicate UI
// ————————————————————————————————————————————————————————————————

test("ActiveClinic renders the shared library instead of its own grid", () => {
  const view = readRepoFile("views/activeclinic/app/website-cms-media.ejs");
  assert.ok(view.includes("cms.libraryHtml"), "must inject the shared library UI");
  assert.ok(
    !view.includes("ac-mw-media-grid"),
    "the duplicated ActiveClinic media grid must be gone"
  );
  assert.ok(view.includes("cms.libraryStylesheet"));

  const routes = readRepoFile("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
  assert.ok(routes.includes('require("../../platform/website/libraryModel")'));
  assert.ok(routes.includes("libraryModel.buildLibraryView("));
  assert.ok(routes.includes("renderWebsiteLibrary(library)"));
  // Search and type filtering are wired from the query string.
  assert.ok(routes.includes("q: req.query && req.query.q"));
  assert.ok(routes.includes("kind: req.query && req.query.type"));
});

test("ActiveClinic keeps its upload flow and alt-text editing", () => {
  const view = readRepoFile("views/activeclinic/app/website-cms-media.ejs");
  assert.ok(view.includes('data-ac-mw-upload="1"'), "upload dialog retained");
  assert.ok(view.includes('name="file"'));
  assert.ok(view.includes('name="altText"'), "alt text editable on the details form");
  assert.ok(view.includes("csrfField"), "upload and metadata posts stay CSRF protected");
});

test("ActiveClinic media JSON no longer leaks storage internals to the picker", () => {
  const routes = readRepoFile("src/activeclinic/http/activeClinicWebsiteRoutes.js");
  assert.ok(routes.includes("libraryModel.normalizeLibraryItems"));
  assert.ok(routes.includes("libraryModel.filterLibraryItems"));
  // Back-compat keys the existing picker markup reads.
  assert.ok(routes.includes("publicSrc: item.previewUrl"));
  assert.ok(routes.includes("originalFilename: item.title"));
  assert.ok(
    !routes.includes("media: (listed.media || []).map((item) => ({\n          ...item,"),
    "the raw row spread must be gone"
  );
});

test("the ActiveClinic picker builds cards as DOM nodes, not markup", () => {
  const js = readRepoFile("public/activeclinic/website-cms.js");
  const picker = js.slice(js.indexOf("data-ac-mw-picker-grid"));
  assert.ok(picker.includes("label.textContent"), "filenames set as text, not HTML");
  assert.ok(
    !/button\.innerHTML\s*=/.test(picker),
    "the picker must not assemble cards from concatenated markup"
  );
  assert.ok(picker.includes("altHint.textContent"), "alt text shown in the picker");
  assert.ok(picker.includes("item.previewUrl || item.publicSrc"), "reads the shared DTO");
});

test("BlessBoard serves a real Content Library page, not a raw JSON body", () => {
  const routes = readRepoFile("src/blessboard/http/contentAdminRoutes.js");
  assert.ok(routes.includes("function wantsHtml("), "content negotiation helper required");
  assert.ok(routes.includes("content-admin/media-library.ejs"));
  assert.ok(routes.includes("renderWebsiteLibrary(library)"));
  assert.ok(
    routes.includes("if (!wantsHtml(req)) {"),
    "JSON must remain the default so the media picker is unaffected"
  );

  const view = readRepoFile("views/blessboard/v5/content-admin/media-library.ejs");
  assert.ok(view.includes("libraryHtml"));
  assert.ok(view.includes("hq-shell-start"));
  assert.ok(view.includes("branch-admin-shell-start"));
  assert.ok(view.includes("libraryStylesheet"));
});

test("BlessBoard content negotiation defaults to JSON without an Accept header", () => {
  const { wantsHtml } = requireContentAdminInternals();
  assert.equal(wantsHtml({ headers: {} }), false);
  assert.equal(wantsHtml({ headers: { accept: "*/*" } }), false);
  assert.equal(wantsHtml({ headers: { accept: "application/json" } }), false);
  assert.equal(
    wantsHtml({ headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" } }),
    true
  );
});

/** wantsHtml is module-private; re-derive it from source to pin the behaviour. */
function requireContentAdminInternals() {
  const source = readRepoFile("src/blessboard/http/contentAdminRoutes.js");
  const start = source.indexOf("function wantsHtml(req) {");
  assert.ok(start > -1, "wantsHtml must exist");
  const end = source.indexOf("\n}", start) + 2;
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${source.slice(start, end)}; return wantsHtml;`);
  return { wantsHtml: factory() };
}

test("the shared library links stay the documented product entry points", () => {
  const registry = readRepoFile("src/platform/website-engine/productSchemaRegistry.js");
  assert.ok(registry.includes('libraryPath: "/hq/content/media"'));
  assert.ok(registry.includes('libraryPath: "/app/settings/website/library"'));
});

test("neither product duplicates the shared library markup", () => {
  for (const rel of [
    "views/activeclinic/app/website-cms-media.ejs",
    "views/blessboard/v5/content-admin/media-library.ejs",
  ]) {
    const view = readRepoFile(rel);
    assert.ok(
      !view.includes("gp-lib__card"),
      `${rel} must inject the shared library, not restate its markup`
    );
  }
});

test("no tenant identifiers are hard-coded in the shared library layer", () => {
  for (const rel of [
    "src/platform/website/libraryModel.js",
    "src/platform/website/renderWebsiteLibrary.js",
    "views/platform/website/library.ejs",
    "public/platform/website-library.css",
  ]) {
    const source = readRepoFile(rel).toLowerCase();
    for (const banned of ["demo-church", "juflona", "demo-clinic", "pronline"]) {
      assert.ok(!source.includes(banned), `${rel} must not hard-code ${banned}`);
    }
  }
});

test("the shared layer does not reimplement either storage backend", () => {
  // Strip comments: the header documents which store each product owns, but the
  // code itself must never name a table or issue a query.
  const code = readRepoFile("src/platform/website/libraryModel.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!code.includes("SELECT "), "the shared model must not query storage");
  assert.ok(!code.includes("website_media"), "storage stays product-owned");
  assert.ok(!code.includes("media_assets"));
  assert.ok(!code.includes("require("), "the shared model has no storage dependencies");
});

"use strict";

/**
 * V1 shared media folders.
 *
 * Folders are one flat namespace per organization in platform.media_folders,
 * used by both products. Assignment is a nullable folder_id on each product's
 * existing asset row, so asset storage is untouched and NULL means Unfiled.
 *
 * The load-bearing guarantees pinned here:
 *   - deleting a folder never deletes assets (they return to Unfiled)
 *   - folders and assignments cannot cross a tenant boundary
 *   - folders are flat: no nesting is representable
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  foundationDbUnavailableSkipReason,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");

const folders = require("../src/platform/website/mediaFoldersService");
const libraryModel = require("../src/platform/website/libraryModel");
const { renderWebsiteLibrary } = require("../src/platform/website/renderWebsiteLibrary");

const ROOT = path.join(__dirname, "..");
const readRepoFile = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const IDENTITY_KEY = "blessboard-platform-v5";

// ————————————————————————————————————————————————————————————————
// Migration shape (no database required)
// ————————————————————————————————————————————————————————————————

describe("shared media folders — migration shape", () => {
  const platformSql = readRepoFile("db/migrations/platform/033_media_folders.sql");
  const blessboardSql = readRepoFile("db/migrations/blessboard/101_media_assets_folder.sql");

  it("is additive: nullable columns, no data rewrite, no drops", () => {
    for (const sql of [platformSql, blessboardSql]) {
      assert.ok(!/DROP TABLE/i.test(sql), "must not drop tables");
      assert.ok(!/DROP COLUMN/i.test(sql), "must not drop columns");
      assert.ok(!/\bUPDATE\s+\w+\.\w+\s+SET/i.test(sql), "must not backfill or rewrite rows");
      assert.ok(!/DELETE\s+FROM/i.test(sql), "must not delete rows");
    }
    assert.match(platformSql, /ADD COLUMN IF NOT EXISTS folder_id UUID NULL/);
    assert.match(blessboardSql, /ADD COLUMN IF NOT EXISTS folder_id UUID NULL/);
  });

  it("guarantees folder deletion preserves assets via ON DELETE SET NULL", () => {
    const acFk = /REFERENCES platform\.media_folders \(id\)\s*\n?\s*ON DELETE SET NULL/;
    assert.match(platformSql, acFk, "ActiveClinic assets must survive folder deletion");
    assert.match(blessboardSql, acFk, "BlessBoard assets must survive folder deletion");
    assert.ok(
      !/media_folders[\s\S]*ON DELETE CASCADE/i.test(platformSql + blessboardSql),
      "no cascade may reach an asset row"
    );
  });

  it("is flat by schema: nesting is not representable", () => {
    // Strip comments: the header explains the choice, the DDL must not make it.
    const ddl = platformSql.replace(/^\s*--.*$/gm, "");
    assert.ok(!/parent_id/i.test(ddl), "no parent_id column may exist");
    assert.ok(!/parent_folder/i.test(ddl));
  });

  it("scopes folders to a tenant and enforces it in the database", () => {
    assert.match(platformSql, /organization_id UUID NOT NULL/);
    assert.match(platformSql, /REFERENCES platform\.organizations \(id\)/);
    assert.match(platformSql, /media_folders_org_name_uidx/, "names unique per tenant");
    assert.match(platformSql, /lower\(name\)/, "uniqueness is case-insensitive");
    // Triggers, so tenant isolation does not rely on route-level checks alone.
    assert.match(platformSql, /CREATE TRIGGER website_media_folder_same_organization/);
    assert.match(blessboardSql, /CREATE TRIGGER media_assets_folder_belongs_to_church/);
  });

  it("orders correctly: platform runs before blessboard so the FK target exists", () => {
    const migrator = readRepoFile("db/scripts/lib/migrator.js");
    const order = /const MODULE_ORDER = \[([^\]]+)\]/.exec(migrator)[1];
    assert.ok(
      order.indexOf("platform") < order.indexOf("blessboard"),
      "platform.media_folders must be created before blessboard references it"
    );
  });
});

// ————————————————————————————————————————————————————————————————
// Service behaviour without a database
// ————————————————————————————————————————————————————————————————

describe("shared media folders — input handling", () => {
  it("normalizes folder names and enforces the length cap", () => {
    assert.equal(folders.normalizeFolderName("  Photos   2026 "), "Photos 2026");
    assert.equal(folders.normalizeFolderName("Line\nBreak"), "Line Break");
    assert.equal(folders.normalizeFolderName(""), "");
    assert.equal(folders.normalizeFolderName(null), "");
    assert.equal(
      folders.normalizeFolderName("x".repeat(500)).length,
      folders.MAX_NAME_LENGTH
    );
  });

  it("whitelists asset tables per product and never trusts caller input", () => {
    assert.deepEqual(Object.keys(folders.PRODUCT_SOURCES).sort(), ["activeclinic", "blessboard"]);
    assert.equal(folders.PRODUCT_SOURCES.activeclinic.table, "platform.website_media");
    assert.equal(folders.PRODUCT_SOURCES.blessboard.table, "blessboard.media_assets");

    const source = readRepoFile("src/platform/website/mediaFoldersService.js");
    // Table and column names may only come from the frozen map.
    assert.ok(source.includes("Object.freeze"), "the product map must be frozen");
    assert.ok(
      !/\$\{input\.(table|product)\}/.test(source),
      "no caller value may be interpolated into SQL"
    );
    assert.ok(source.includes("${source.table}"), "tables come from the whitelist");
  });

  it("rejects an unknown product rather than guessing a table", async () => {
    const res = await folders.moveMediaToFolder(null, {
      product: "'; DROP TABLE platform.website_media; --",
      scopeId: "11111111-1111-4111-8111-111111111111",
      mediaId: "22222222-2222-4222-8222-222222222222",
      folderId: null,
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, folders.RESULT.UNSUPPORTED_PRODUCT);
  });

  it("rejects non-UUID identifiers before touching the database", async () => {
    for (const bad of ["", "not-a-uuid", "1 OR 1=1", null]) {
      const res = await folders.moveMediaToFolder(null, {
        product: "activeclinic",
        scopeId: bad,
        mediaId: "22222222-2222-4222-8222-222222222222",
        folderId: null,
      });
      assert.equal(res.ok, false);
      assert.equal(res.code, folders.RESULT.INVALID_INPUT);
    }
  });
});

// ————————————————————————————————————————————————————————————————
// Shared library view: folder rail
// ————————————————————————————————————————————————————————————————

describe("shared media folders — library view", () => {
  const items = libraryModel.normalizeLibraryItems([
    { id: "a1", originalFilename: "hero.png", mimeType: "image/png", sizeBytes: 2048, folderId: "f1" },
    { id: "a2", originalFilename: "flyer.pdf", mimeType: "application/pdf", sizeBytes: 4096, folderId: null },
  ]);
  const folderRows = [
    { id: "f1", name: "Photos" },
    { id: "f2", name: "Bulletins" },
  ];
  const base = {
    items,
    folders: folderRows,
    folderCounts: { all: 2, unfiled: 1, f1: 1, f2: 0 },
    foldersEnabled: true,
    basePath: "/media",
  };

  it("offers All Media, Unfiled, then each folder", () => {
    const view = libraryModel.buildLibraryView(base);
    assert.deepEqual(
      view.folderFilters.map((f) => f.label),
      ["All Media", "Unfiled", "Photos", "Bulletins"]
    );
    assert.deepEqual(view.folderFilters.map((f) => f.count), [2, 1, 1, 0]);
    assert.equal(view.folderFilters[0].current, true, "All Media is the default view");
  });

  it("All Media shows everything, a folder shows only its files, Unfiled shows the rest", () => {
    assert.deepEqual(
      libraryModel.buildLibraryView(base).items.map((i) => i.title),
      ["hero.png", "flyer.pdf"]
    );
    assert.deepEqual(
      libraryModel.buildLibraryView({ ...base, folder: "f1" }).items.map((i) => i.title),
      ["hero.png"]
    );
    assert.deepEqual(
      libraryModel.buildLibraryView({ ...base, folder: "unfiled" }).items.map((i) => i.title),
      ["flyer.pdf"]
    );
    assert.deepEqual(
      libraryModel.buildLibraryView({ ...base, folder: "f2" }).items.map((i) => i.title),
      []
    );
  });

  it("an empty folder shows the no-results state, not a bare grid", () => {
    const view = libraryModel.buildLibraryView({ ...base, folder: "f2" });
    assert.equal(view.state, libraryModel.LIBRARY_STATE.NO_RESULTS);
    assert.ok(renderWebsiteLibrary(view).includes('data-gp-library-empty="1"'));
  });

  it("folder selection combines with search and type filtering", () => {
    const view = libraryModel.buildLibraryView({ ...base, folder: "f1", q: "hero", kind: "image" });
    assert.deepEqual(view.items.map((i) => i.title), ["hero.png"]);
    // Type tabs preserve the active folder so the two controls compose.
    const withFolder = libraryModel.buildLibraryView({ ...base, folder: "f1" });
    const imageTab = withFolder.kindFilters.find((f) => f.key === "image");
    assert.ok(imageTab.href.includes("folder=f1"));
  });

  it("renders the folder rail and per-file move control", () => {
    const view = libraryModel.buildLibraryView({
      ...base,
      canManageFolders: true,
      folderCreateAction: "/media/folders",
      folderRenameAction: "/media/folders/rename",
      folderDeleteAction: "/media/folders/delete",
      moveAction: "/media/move",
      folder: "f1",
      csrfField: "_csrf",
      csrfToken: "tok",
    });
    const html = renderWebsiteLibrary(view);
    assert.ok(html.includes('data-gp-library-folders="1"'));
    assert.ok(html.includes('data-gp-library-folder="all"'));
    assert.ok(html.includes('data-gp-library-folder="unfiled"'));
    assert.ok(html.includes('data-gp-library-move="1"'));
    assert.ok(html.includes('data-gp-library-folder-create="1"'));
    // Rename and delete apply to the folder currently being viewed.
    assert.ok(html.includes('data-gp-library-folder-rename="1"'));
    assert.ok(html.includes('data-gp-library-folder-delete="1"'));
    assert.ok(html.includes("Files move to Unfiled. Nothing is deleted."));
    // Every mutating form carries CSRF.
    assert.equal((html.match(/name="_csrf" value="tok"/g) || []).length >= 4, true);
    // The move control preselects the folder the file is already in.
    assert.ok(/<option value="f1" selected>Photos<\/option>/.test(html));
  });

  it("hides folder management when the viewer cannot edit", () => {
    const html = renderWebsiteLibrary(
      libraryModel.buildLibraryView({ ...base, canManageFolders: false, moveAction: "/media/move" })
    );
    assert.ok(html.includes('data-gp-library-folders="1"'), "the rail stays readable");
    assert.ok(!html.includes('data-gp-library-move="1"'), "no move control without edit rights");
    assert.ok(!html.includes('data-gp-library-folder-create="1"'));
  });

  it("stays inert for products that have not enabled folders", () => {
    const view = libraryModel.buildLibraryView({ items });
    assert.equal(view.foldersEnabled, false);
    assert.deepEqual(view.folderFilters, []);
    assert.deepEqual(view.moveTargets, []);
    assert.ok(!renderWebsiteLibrary(view).includes("data-gp-library-folders"));
  });

  it("escapes folder names supplied by a tenant", () => {
    const view = libraryModel.buildLibraryView({
      ...base,
      folders: [{ id: "f1", name: '"><script>alert(1)</script>' }],
      canManageFolders: true,
      moveAction: "/media/move",
    });
    const html = renderWebsiteLibrary(view);
    assert.ok(!html.includes("<script>"), "folder names must not inject markup");
  });

  it("keeps the folder rail usable at 390 and 360 px", () => {
    const css = readRepoFile("public/platform/website-library.css");
    const mobile = css.slice(css.indexOf("@media (max-width: 480px)"));
    assert.match(mobile, /\.gp-lib__folder-rail/, "the rail needs mobile rules");
    assert.match(mobile, /overflow-x:\s*auto/, "pills scroll rather than widening the page");
    assert.match(mobile, /\.gp-lib__folder-admin[\s\S]*?flex-direction:\s*column/);
    const railRule = css.slice(css.indexOf(".gp-lib__folder {"));
    assert.match(railRule, /min-height:\s*2\.75rem/, "tap targets stay usable");
  });
});

// ————————————————————————————————————————————————————————————————
// Database-backed behaviour
// ————————————————————————————————————————————————————————————————

describe("shared media folders — database behaviour", () => {
  let pool;
  let skipReason = null;
  let orgA;
  let orgB;
  let churchA;
  let ownerUserId;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "folders-a",
        displayName: "Folders A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "folders-a",
        hostname: "folders-a.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "folders-b",
        displayName: "Folders B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "folders-b",
        hostname: "folders-b.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "folders-a",
        churchKey: "folders-a",
        displayName: "Folders Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ Folders A",
      });
      assert.equal(ch.ok, true, ch.message);
      churchA = ch.records.church;

      const owner = await createBlessBoardUser(pool, {
        email: "folders-owner@example.test",
        password: "correct-horse-battery-staple",
        displayName: "Folders Owner",
      });
      assert.equal(owner.ok, true, owner.reason || owner.message);
      ownerUserId = owner.user.id;
    } catch (err) {
      skipReason = foundationDbUnavailableSkipReason(err && err.message);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  const skipIfNeeded = (t) => {
    if (!skipReason) return false;
    t.skip(skipReason);
    return true;
  };

  const orgAId = () => orgA.records.organization.id;
  const orgBId = () => orgB.records.organization.id;

  it("creates, lists, and renames folders per tenant", async (t) => {
    if (skipIfNeeded(t)) return;
    const created = await folders.createFolder(pool, { organizationId: orgAId(), name: "Photos" });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.folder.name, "Photos");

    const listed = await folders.listFolders(pool, { organizationId: orgAId() });
    assert.equal(listed.ok, true);
    assert.ok(listed.folders.some((f) => f.id === created.folder.id));

    const renamed = await folders.renameFolder(pool, {
      organizationId: orgAId(),
      folderId: created.folder.id,
      name: "Service Photos",
    });
    assert.equal(renamed.ok, true, JSON.stringify(renamed));
    assert.equal(renamed.folder.name, "Service Photos");
  });

  it("rejects duplicate folder names case-insensitively within a tenant", async (t) => {
    if (skipIfNeeded(t)) return;
    const first = await folders.createFolder(pool, { organizationId: orgAId(), name: "Bulletins" });
    assert.equal(first.ok, true);
    const dupe = await folders.createFolder(pool, { organizationId: orgAId(), name: "bulletins" });
    assert.equal(dupe.ok, false);
    assert.equal(dupe.code, folders.RESULT.NAME_TAKEN);

    // The same name is fine for a different tenant.
    const other = await folders.createFolder(pool, { organizationId: orgBId(), name: "Bulletins" });
    assert.equal(other.ok, true, JSON.stringify(other));
  });

  it("does not leak or accept another tenant's folder", async (t) => {
    if (skipIfNeeded(t)) return;
    const mine = await folders.createFolder(pool, { organizationId: orgAId(), name: "Private A" });
    assert.equal(mine.ok, true);

    const listedB = await folders.listFolders(pool, { organizationId: orgBId() });
    assert.equal(listedB.folders.some((f) => f.id === mine.folder.id), false);

    const stolen = await folders.getFolder(pool, {
      organizationId: orgBId(),
      folderId: mine.folder.id,
    });
    assert.equal(stolen.ok, false);
    assert.equal(stolen.code, folders.RESULT.FOLDER_NOT_FOUND);

    const renameAcross = await folders.renameFolder(pool, {
      organizationId: orgBId(),
      folderId: mine.folder.id,
      name: "Hijacked",
    });
    assert.equal(renameAcross.ok, false);
    assert.equal(renameAcross.code, folders.RESULT.FOLDER_NOT_FOUND);

    const deleteAcross = await folders.deleteFolder(pool, {
      organizationId: orgBId(),
      folderId: mine.folder.id,
    });
    assert.equal(deleteAcross.ok, false);
    assert.equal(deleteAcross.code, folders.RESULT.FOLDER_NOT_FOUND);

    // Still there for its owner.
    const stillMine = await folders.getFolder(pool, {
      organizationId: orgAId(),
      folderId: mine.folder.id,
    });
    assert.equal(stillMine.ok, true);
  });

  it("resolves a BlessBoard church to its organization", async (t) => {
    if (skipIfNeeded(t)) return;
    const resolved = await folders.resolveOrganizationId(pool, {
      product: "blessboard",
      scopeId: churchA.id,
    });
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    assert.equal(resolved.organizationId, orgAId());
  });

  it("deleting a folder returns its BlessBoard assets to Unfiled and deletes nothing", async (t) => {
    if (skipIfNeeded(t)) return;
    const folder = await folders.createFolder(pool, { organizationId: orgAId(), name: "Deletable" });
    assert.equal(folder.ok, true);

    const asset = await pool.query(
      `INSERT INTO blessboard.media_assets
         (church_id, uploaded_by_user_id, storage_bucket, storage_key, original_filename,
          mime_type, size_bytes, sha256, visibility, status)
       VALUES ($1, $2, 'blessboard-public', 'folders/keep-me.png', 'keep-me.png',
               'image/png', 1024, repeat('a', 64), 'public', 'active')
       RETURNING id`,
      [churchA.id, ownerUserId]
    );
    const assetId = asset.rows[0].id;

    const moved = await folders.moveMediaToFolder(pool, {
      product: "blessboard",
      scopeId: churchA.id,
      mediaId: assetId,
      folderId: folder.folder.id,
    });
    assert.equal(moved.ok, true, JSON.stringify(moved));
    assert.equal(moved.folderId, folder.folder.id);

    const removed = await folders.deleteFolder(pool, {
      organizationId: orgAId(),
      folderId: folder.folder.id,
    });
    assert.equal(removed.ok, true, JSON.stringify(removed));

    // The asset must still exist, now Unfiled.
    const after = await pool.query(
      `SELECT id, folder_id, status FROM blessboard.media_assets WHERE id = $1`,
      [assetId]
    );
    assert.equal(after.rows.length, 1, "deleting a folder must never delete an asset");
    assert.equal(after.rows[0].folder_id, null, "the asset returns to Unfiled");
    assert.equal(after.rows[0].status, "active", "the asset stays active");
  });

  it("moves an asset back to Unfiled on request", async (t) => {
    if (skipIfNeeded(t)) return;
    const folder = await folders.createFolder(pool, { organizationId: orgAId(), name: "Temp Home" });
    const asset = await pool.query(
      `INSERT INTO blessboard.media_assets
         (church_id, uploaded_by_user_id, storage_bucket, storage_key, original_filename,
          mime_type, size_bytes, sha256, visibility, status)
       VALUES ($1, $2, 'blessboard-public', 'folders/movable.png', 'movable.png',
               'image/png', 1024, repeat('b', 64), 'public', 'active')
       RETURNING id`,
      [churchA.id, ownerUserId]
    );
    const assetId = asset.rows[0].id;

    await folders.moveMediaToFolder(pool, {
      product: "blessboard",
      scopeId: churchA.id,
      mediaId: assetId,
      folderId: folder.folder.id,
    });
    const unfiled = await folders.moveMediaToFolder(pool, {
      product: "blessboard",
      scopeId: churchA.id,
      mediaId: assetId,
      folderId: null,
    });
    assert.equal(unfiled.ok, true, JSON.stringify(unfiled));
    assert.equal(unfiled.folderId, null);
  });

  it("refuses to file an asset into another tenant's folder", async (t) => {
    if (skipIfNeeded(t)) return;
    const foreign = await folders.createFolder(pool, {
      organizationId: orgBId(),
      name: "Foreign Folder",
    });
    assert.equal(foreign.ok, true);

    const asset = await pool.query(
      `INSERT INTO blessboard.media_assets
         (church_id, uploaded_by_user_id, storage_bucket, storage_key, original_filename,
          mime_type, size_bytes, sha256, visibility, status)
       VALUES ($1, $2, 'blessboard-public', 'folders/cross.png', 'cross.png',
               'image/png', 1024, repeat('c', 64), 'public', 'active')
       RETURNING id`,
      [churchA.id, ownerUserId]
    );
    const attempt = await folders.moveMediaToFolder(pool, {
      product: "blessboard",
      scopeId: churchA.id,
      mediaId: asset.rows[0].id,
      folderId: foreign.folder.id,
    });
    assert.equal(attempt.ok, false);
    assert.equal(attempt.code, folders.RESULT.FOLDER_NOT_FOUND);

    // And the database refuses it even if the service check were bypassed.
    await assert.rejects(
      pool.query(`UPDATE blessboard.media_assets SET folder_id = $2 WHERE id = $1`, [
        asset.rows[0].id,
        foreign.folder.id,
      ]),
      /does not belong|not \S+$|belongs to organization/i
    );
  });

  it("reports folder counts including All and Unfiled", async (t) => {
    if (skipIfNeeded(t)) return;
    const counted = await folders.folderCounts(pool, {
      product: "blessboard",
      scopeId: churchA.id,
    });
    assert.equal(counted.ok, true, JSON.stringify(counted));
    assert.equal(typeof counted.counts.all, "number");
    assert.equal(typeof counted.counts.unfiled, "number");
    assert.ok(counted.counts.all >= counted.counts.unfiled);
  });

  it("enforces the per-tenant folder limit", async (t) => {
    if (skipIfNeeded(t)) return;
    const org = await provisionPlatformTenant(pool, {
      organizationKey: "folders-limit",
      displayName: "Folders Limit",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "folders-limit",
      hostname: "folders-limit.blessboard.org",
      domainType: "canonical",
      deploymentCode: "blessboard-org-staging",
      isPrimary: true,
    });
    const orgId = org.records.organization.id;
    await pool.query(
      `INSERT INTO platform.media_folders (organization_id, name)
       SELECT $1, 'bulk ' || g FROM generate_series(1, $2) g`,
      [orgId, folders.MAX_FOLDERS_PER_ORGANIZATION]
    );
    const overflow = await folders.createFolder(pool, { organizationId: orgId, name: "One Too Many" });
    assert.equal(overflow.ok, false);
    assert.equal(overflow.code, folders.RESULT.LIMIT_REACHED);
  });
});

// ————————————————————————————————————————————————————————————————
// Product wiring
// ————————————————————————————————————————————————————————————————

describe("shared media folders — product wiring", () => {
  it("both products use the one shared service", () => {
    const ac = readRepoFile("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    const bb = readRepoFile("src/blessboard/http/contentAdminRoutes.js");
    for (const source of [ac, bb]) {
      assert.ok(source.includes('require("../../platform/website/mediaFoldersService")'));
      assert.ok(source.includes("mediaFoldersService.loadFolderContext"));
      assert.ok(source.includes("mediaFoldersService.createFolder"));
      assert.ok(source.includes("mediaFoldersService.renameFolder"));
      assert.ok(source.includes("mediaFoldersService.deleteFolder"));
      assert.ok(source.includes("mediaFoldersService.moveMediaToFolder"));
    }
  });

  it("folder routes are registered before the media id routes that would shadow them", () => {
    const ac = readRepoFile("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    // Only the POST registrations can shadow each other; the GET ":mediaId"
    // route is a different method and is registered earlier.
    const acPostMediaId = ac.indexOf('app.post(\n    "/app/settings/website/media/:mediaId"');
    assert.ok(acPostMediaId > -1, "the POST :mediaId route must exist");
    assert.ok(
      ac.indexOf('"/app/settings/website/media/folders"') < acPostMediaId,
      "'folders' must not be captured as a media id"
    );
    assert.ok(ac.indexOf('"/app/settings/website/media/move"') < acPostMediaId);

    const bb = readRepoFile("src/blessboard/http/contentAdminRoutes.js");
    assert.ok(
      bb.indexOf("`${p}/media/folders`") < bb.indexOf("`${p}/media/:assetId/archive`"),
      "'folders' must not be captured as an asset id"
    );
  });

  it("every folder mutation is a CSRF-protected POST", () => {
    const ac = readRepoFile("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    const acFolders = ac.slice(ac.indexOf('"/app/settings/website/media/folders"'));
    assert.ok(!/app\.get\(\s*"\/app\/settings\/website\/media\/folders/.test(ac), "no GET mutations");
    assert.equal(
      (acFolders.match(/validateCsrf\(req/g) || []).length >= 4,
      true,
      "create, rename, delete and move each validate CSRF"
    );

    const bb = readRepoFile("src/blessboard/http/contentAdminRoutes.js");
    assert.ok(bb.includes("function folderCsrfOk("));
    const bbFolders = bb.slice(bb.indexOf("`${p}/media/folders`"));
    assert.equal((bbFolders.match(/folderCsrfOk\(req, res\)/g) || []).length >= 4, true);
    assert.ok(!/router\.get\(`\$\{p\}\/media\/folders/.test(bb), "no GET mutations");
  });

  it("asset row mappers expose folderId so the rail can filter", () => {
    assert.ok(readRepoFile("src/platform/website/mediaService.js").includes("folderId: row.folder_id"));
    const repo = readRepoFile("src/blessboard/media/mediaAssetsRepository.js");
    assert.ok(repo.includes("folderId: row.folder_id"));
    assert.ok(repo.includes("folder_id"), "folder_id must be selected");
    assert.ok(
      readRepoFile("src/blessboard/media/mediaUploadService.js").includes("folderId: asset.folderId"),
      "the list DTO must carry folderId"
    );
  });

  it("does not add nested folders or cross-tenant sharing", () => {
    for (const rel of [
      "src/platform/website/mediaFoldersService.js",
      "src/platform/website/libraryModel.js",
      "views/platform/website/library.ejs",
    ]) {
      const source = readRepoFile(rel).toLowerCase();
      assert.ok(!source.includes("parentid"), `${rel} must not introduce nesting`);
      assert.ok(!source.includes("parent_folder"));
      assert.ok(!source.includes("shared_with"), `${rel} must not share across tenants`);
    }
  });

  it("does not rewrite asset storage", () => {
    const source = readRepoFile("src/platform/website/mediaFoldersService.js");
    for (const banned of ["storage_key", "storage_bucket", "payload_bytes", "sha256"]) {
      assert.ok(!source.includes(banned), `folders must not touch ${banned}`);
    }
  });
});

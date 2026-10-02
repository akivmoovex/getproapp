"use strict";

/**
 * V2.05 / V5 — BlessBoard Service Times publish regression.
 *
 * Contract: edit → draft → reload → preview → publish → snapshot → public
 * for BOTH platform publish entry points. Uses existing BB website publish infra.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  saveStructuredDraft,
  applyStructuredDraftsToModel,
} = require("../src/blessboard/services/websiteStructuredDraftService");
const {
  listStructuredDrafts,
} = require("../src/blessboard/repositories/websiteStructuredDraftRepository");
const { publish: publishProductWebsite } = require("../src/platform/website/publishWorkflow");
const {
  publishChurchWebsite,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  publishWebsiteDrafts,
} = require("../src/blessboard/services/websiteDraftPublishService");
const {
  resolvePublicServiceTimesEntries,
  entriesFromSection,
  validateServiceTimeEntries,
  SERVICE_TIMES_SCHEMA,
} = require("../src/blessboard/services/homeServiceTimesService");
const {
  buildPublicationSnapshot,
} = require("../src/blessboard/services/websitePublicationVersionService");
const contentRepo = require("../src/blessboard/repositories/publicContentRepository");
const {
  authorize: authorizeBlessBoard,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const {
  hasWebsitePermission,
  PERMISSIONS: WEBSITE_PERMISSIONS,
} = require("../src/platform/website/permissions");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

async function provisionChurch(pool, plan = "foundation") {
  const key = uniq(plan === "growth" ? "stg" : "stf");
  const row = await appRepo.createApplication(pool, {
    church_name: `Service Times ${key}`,
    country: "Zambia",
    city: "Lusaka",
    contact_name: "Site Admin",
    contact_email: `${key}@example.org`,
    contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    selected_plan: plan,
    consent_terms: true,
    branch_name: "Main Campus",
  });
  const result = await provisionRegisteredBlessBoardChurch(pool, {
    applicationId: row.id,
    administratorPassword: PASSWORD,
    requestId: `req-${key}`,
    actorContext: {
      type: "test",
      source: "unit",
      dataEnvironment: "testing",
      deploymentCode: "blessboard-org-staging",
    },
  });
  assert.equal(result.ok, true, result.message || result.status);
  return result.records;
}

function serviceTimesPayload(entries) {
  return { entries };
}

async function saveServiceTimesDraft(pool, records, entries) {
  return saveStructuredDraft(pool, {
    organizationId: records.organizationId,
    churchId: records.churchId,
    branchId: null,
    editorUserId: records.administratorUserId,
    draftKind: "service_times",
    pageKey: "home",
    sectionKey: "service_times",
    entityKey: "collection",
    op: "upsert",
    payload: serviceTimesPayload(entries),
  });
}

function namesFromSection(section) {
  return entriesFromSection(section).map((e) => e.name);
}

function namesFromSnapshot(snapshot) {
  const home = (snapshot.pages || []).find((p) => p.pageKey === "home");
  const st = home && (home.sections || []).find((s) => s.sectionKey === "service_times");
  if (!st) return [];
  const meta = st.layoutMetadata;
  if (!meta || meta.schema !== SERVICE_TIMES_SCHEMA || !Array.isArray(meta.entries)) {
    return [];
  }
  return meta.entries.map((e) => e.name);
}

describe("V2.05 BlessBoard service times publish", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";

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
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("validation preserves primary/id and normalizes HTML time seconds", () => {
    const validated = validateServiceTimeEntries([
      {
        id: "svc-keep",
        name: "Sunday Worship",
        day: "sunday",
        startTime: "10:00:00",
        endTime: "11:30:00",
        enabled: true,
        primary: true,
        sortOrder: 10,
      },
    ]);
    assert.equal(validated.ok, true);
    assert.equal(validated.entries[0].id, "svc-keep");
    assert.equal(validated.entries[0].primary, true);
    assert.equal(validated.entries[0].startTime, "10:00");
    assert.equal(validated.entries[0].endTime, "11:30");
  });

  it("A–G: edit → draft → reload → preview → publish → snapshot → public (platform publish)", async () => {
    requireDb();
    const records = await provisionChurch(pool);
    const changed = [
      {
        id: "svc-1",
        name: "Sunday Worship CHANGED",
        day: "sunday",
        startTime: "10:00",
        endTime: "11:30",
        enabled: true,
        primary: true,
        sortOrder: 10,
      },
      {
        id: "svc-2",
        name: "Midweek Prayer CHANGED",
        day: "wednesday",
        startTime: "18:30",
        enabled: true,
        primary: false,
        sortOrder: 20,
      },
    ];

    // A + B: edit + save draft
    const draft = await saveServiceTimesDraft(pool, records, changed);
    assert.equal(draft.saved, true);
    assert.equal(draft.published, false);
    assert.equal(draft.payload.entries[0].primary, true);
    assert.deepEqual(
      draft.payload.entries.map((e) => e.name),
      ["Sunday Worship CHANGED", "Midweek Prayer CHANGED"]
    );

    // C: reload draft retained
    const reloaded = await listStructuredDrafts(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    const stDraft = (reloaded || []).find((d) => d.draftKind === "service_times");
    assert.ok(stDraft, "service_times draft missing after save");
    assert.deepEqual(
      (stDraft.payload.entries || []).map((e) => e.name),
      ["Sunday Worship CHANGED", "Midweek Prayer CHANGED"]
    );

    // D: preview projection shows draft overlay
    const previewModel = { serviceTimesEntries: [] };
    applyStructuredDraftsToModel(previewModel, [stDraft]);
    assert.deepEqual(
      previewModel.serviceTimesEntries.map((e) => e.name),
      ["Sunday Worship CHANGED", "Midweek Prayer CHANGED"]
    );

    // E: publish via platform orchestrator (editor /website/publish)
    const published = await publishProductWebsite(pool, {
      productCode: "blessboard",
      grantedPermissions: ["website.publish"],
      request: {
        churchId: records.churchId,
        organizationId: records.organizationId,
        branchId: null,
        actorUserId: records.administratorUserId,
        deferServiceTimes: true,
        confirmPublish: true,
        mobilePreviewConfirmed: true,
        relaxPreviewRequirement: true,
        forcePublishVersion: true,
      },
    });
    assert.equal(published.ok, true, published.message || published.reason || published.status);

    // Live section
    const page = await contentRepo.findPageByScope(pool, {
      churchId: records.churchId,
      branchId: null,
      pageKey: "home",
    });
    assert.equal(page.status, "published");
    const sections = await contentRepo.listSectionsForPage(pool, page.id, {});
    const st = (sections || []).find((s) => s.sectionKey === "service_times");
    assert.ok(st);
    assert.equal(st.layoutMetadata.schema, SERVICE_TIMES_SCHEMA);
    assert.deepEqual(namesFromSection(st), [
      "Sunday Worship CHANGED",
      "Midweek Prayer CHANGED",
    ]);

    // F: published snapshot contains changed values (layout_metadata.entries)
    const snapshot = await buildPublicationSnapshot(pool, records.churchId, null);
    assert.deepEqual(namesFromSnapshot(snapshot), [
      "Sunday Worship CHANGED",
      "Midweek Prayer CHANGED",
    ]);
    assert.ok(
      (snapshot.serviceTimeRefs || []).some((r) => r.name === "Sunday Worship CHANGED"),
      "serviceTimeRefs should include changed entries"
    );

    // G: public resolver exposes changed values
    const pub = await resolvePublicServiceTimesEntries(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    assert.deepEqual(
      pub.entries.map((e) => e.name),
      ["Sunday Worship CHANGED", "Midweek Prayer CHANGED"]
    );
  });

  it("multiple service times, delete one, and second publish path (publishWebsiteDrafts)", async () => {
    requireDb();
    const records = await provisionChurch(pool, "growth");

    await saveServiceTimesDraft(pool, records, [
      {
        id: "svc-1",
        name: "Alpha Gathering",
        day: "sunday",
        startTime: "09:00",
        enabled: true,
        primary: true,
        sortOrder: 10,
      },
      {
        id: "svc-2",
        name: "Beta Gathering",
        day: "tuesday",
        startTime: "19:00",
        enabled: true,
        primary: false,
        sortOrder: 20,
      },
      {
        id: "svc-3",
        name: "Gamma Gathering",
        day: "friday",
        startTime: "18:00",
        enabled: true,
        primary: false,
        sortOrder: 30,
      },
    ]);

    // Path 2: content-admin draft-changes publish (apply drafts then governance publish)
    const path2 = await publishWebsiteDrafts(pool, {
      organizationId: records.organizationId,
      churchId: records.churchId,
      branchId: null,
      actorUserId: records.administratorUserId,
      actorRole: "organisation_administrator",
      deferServiceTimes: true,
      confirmPublish: true,
    });
    assert.equal(path2.ok, true, path2.message || path2.reason || path2.status);

    let pub = await resolvePublicServiceTimesEntries(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    assert.equal(pub.entries.length, 3);
    assert.ok(pub.entries.some((e) => e.name === "Beta Gathering"));

    // Delete one (keep Alpha + Gamma)
    await saveServiceTimesDraft(pool, records, [
      {
        id: "svc-1",
        name: "Alpha Gathering",
        day: "sunday",
        startTime: "09:00",
        enabled: true,
        primary: true,
        sortOrder: 10,
      },
      {
        id: "svc-3",
        name: "Gamma Gathering",
        day: "friday",
        startTime: "18:00",
        enabled: true,
        primary: false,
        sortOrder: 20,
      },
    ]);

    const path1 = await publishChurchWebsite(pool, {
      churchId: records.churchId,
      organizationId: records.organizationId,
      branchId: null,
      actorUserId: records.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      forcePublishVersion: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
    });
    assert.equal(path1.ok, true, path1.message || path1.reason || path1.status);

    pub = await resolvePublicServiceTimesEntries(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    assert.deepEqual(
      pub.entries.map((e) => e.name),
      ["Alpha Gathering", "Gamma Gathering"]
    );
    const snapshot = await buildPublicationSnapshot(pool, records.churchId, null);
    assert.deepEqual(namesFromSnapshot(snapshot), ["Alpha Gathering", "Gamma Gathering"]);
  });

  it("tenant isolation: church A publish does not leak into church B public", async () => {
    requireDb();
    const churchA = await provisionChurch(pool);
    const churchB = await provisionChurch(pool);

    await saveServiceTimesDraft(pool, churchA, [
      {
        id: "svc-a",
        name: "Church A Only Service",
        day: "sunday",
        startTime: "08:00",
        enabled: true,
        primary: true,
        sortOrder: 10,
      },
    ]);
    const published = await publishProductWebsite(pool, {
      productCode: "blessboard",
      grantedPermissions: ["website.publish"],
      request: {
        churchId: churchA.churchId,
        organizationId: churchA.organizationId,
        branchId: null,
        actorUserId: churchA.administratorUserId,
        deferServiceTimes: true,
        confirmPublish: true,
        mobilePreviewConfirmed: true,
        relaxPreviewRequirement: true,
        forcePublishVersion: true,
      },
    });
    assert.equal(published.ok, true);

    const pubA = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.churchId,
      branchId: null,
    });
    const pubB = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchB.churchId,
      branchId: null,
    });
    assert.ok(pubA.entries.some((e) => e.name === "Church A Only Service"));
    assert.equal(
      pubB.entries.some((e) => e.name === "Church A Only Service"),
      false
    );
  });

  it("RBAC: website.edit ≠ website.publish for service times publish", async () => {
    requireDb();
    const records = await provisionChurch(pool);

    const editAuth = await authorizeBlessBoard(pool, {
      actor: { userId: records.administratorUserId },
      permission: "website.edit",
      tenantContext: {
        resolved: true,
        organization: { id: records.organizationId },
        church: { id: records.churchId },
      },
      resourceContext: {
        organizationId: records.organizationId,
        churchId: records.churchId,
        branchId: null,
      },
    });
    const publishAuth = await authorizeBlessBoard(pool, {
      actor: { userId: records.administratorUserId },
      permission: "website.publish",
      tenantContext: {
        resolved: true,
        organization: { id: records.organizationId },
        church: { id: records.churchId },
      },
      resourceContext: {
        organizationId: records.organizationId,
        churchId: records.churchId,
        branchId: null,
      },
    });
    assert.equal(editAuth.allowed, true, editAuth.reasonCode);
    assert.equal(publishAuth.allowed, true, publishAuth.reasonCode);

    // Platform grant allowlist: edit alone must not satisfy publish permission.
    assert.equal(
      hasWebsitePermission(["website.edit"], WEBSITE_PERMISSIONS.PUBLISH),
      false
    );
    assert.equal(
      hasWebsitePermission(["website.publish"], WEBSITE_PERMISSIONS.PUBLISH),
      true
    );
    assert.notEqual(WEBSITE_PERMISSIONS.EDIT, WEBSITE_PERMISSIONS.PUBLISH);
  });
});

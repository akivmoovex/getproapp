"use strict";

/**
 * V8 BlessBoard announcements BB19–BB22.
 * Admin CRUD/schedule, public website visibility, branch scope, media, V7 compat.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  createAnnouncement,
  updateAnnouncement,
  listPublicWebsiteAnnouncements,
  getPublicWebsiteAnnouncement,
  listAnnouncementPublicationHistory,
  SCHEDULER_DEPENDENCY,
  resolveEffectiveStatus,
  STATUS,
} = require("../src/blessboard/services/announcementsService");

const PASSWORD = "AnnouncementsQa99!";
let pool;
let skipReason = null;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

async function seedChurch(key) {
  const org = await provisionPlatformTenant(pool, {
    organizationKey: key,
    displayName: `Org ${key}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: key,
    hostname: `${key}.blessboard.test`,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(org.ok, true, org.message);
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: key,
    churchKey: key,
    displayName: `Church ${key}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, church.message);
  const email = `admin@${key}.test`;
  const user = await createBlessBoardUser(pool, {
    email,
    password: PASSWORD,
    displayName: "Admin",
  });
  assert.equal(user.ok, true, user.message || user.reason);
  const role = await assignBlessBoardRole(pool, {
    email,
    organizationKey: key,
    churchKey: key,
    roleKey: "church_hq_admin",
  });
  assert.equal(role.ok, true, role.message || role.reason);
  return {
    organization: org.records.organization,
    church: church.records.church,
    branch: church.records.hqBranch,
    user: user.user,
    key,
    tenant: {
      resolved: true,
      organization: org.records.organization,
      church: church.records.church,
      primaryBranch: church.records.hqBranch,
    },
  };
}

before(async () => {
  try {
    const databaseUrl = await resetFoundationDatabase();
    process.env.DATABASE_URL = databaseUrl;
    pool = createFoundationPool(databaseUrl);
    await migrate({ connectionString: databaseUrl, direction: "up" });
  } catch (err) {
    skipReason = err && err.message ? err.message : String(err);
    pool = null;
  }
});

after(async () => {
  if (pool) await pool.end().catch(() => {});
});

describe("V8 BlessBoard announcements BB19–BB22", () => {
  it("documents scheduler unavailable and stitch markers for BB19–BB22", () => {
    assert.equal(SCHEDULER_DEPENDENCY.available, false);
    const checks = [
      ["views/blessboard/v5/announcements/admin-list.ejs", "BB19"],
      ["views/blessboard/v5/announcements/admin-form.ejs", "BB20"],
      ["views/blessboard/v5/announcements/admin-publish.ejs", "BB20"],
      ["views/blessboard/v5/public/announcements.ejs", "BB21"],
      ["views/blessboard/v5/public/announcement-detail.ejs", "BB22"],
    ];
    for (const [rel, code] of checks) {
      const p = path.join(__dirname, "..", rel);
      assert.ok(fs.existsSync(p), rel);
      const html = fs.readFileSync(p, "utf8");
      assert.match(html, new RegExp(`data-bb-stitch="${code}"`));
      assert.match(html, new RegExp(`data-bb-screen-desktop="${code}-D"`));
      assert.match(html, new RegExp(`data-bb-screen-mobile="${code}-M"`));
    }
    assert.match(
      fs.readFileSync(
        path.join(__dirname, "../views/blessboard/v5/announcements/admin-form.ejs"),
        "utf8"
      ),
      /loadMediaPicker:\s*true/
    );
    assert.match(
      fs.readFileSync(
        path.join(__dirname, "../views/blessboard/v5/announcements/admin-detail.ejs"),
        "utf8"
      ),
      /data-publication-history="1"/
    );
    assert.match(
      fs.readFileSync(
        path.join(__dirname, "../public/blessboard/v5/tenant-public.css"),
        "utf8"
      ),
      /@media \(max-width:\s*720px\)[\s\S]*\.bb-tp-announcements \.bb-tp-btn/
    );
    assert.ok(
      fs.existsSync(
        path.join(__dirname, "../db/migrations/blessboard/112_announcement_public_audience_v8.sql")
      )
    );
  });

  it("CRUD draft → schedule → publish with public audience and audit history", async () => {
    requireDb();
    const seed = await seedChurch(uniq("bbann"));
    const created = await createAnnouncement(pool, {
      churchId: seed.church.id,
      branchId: null,
      actorUserId: seed.user.id,
      tenant: seed.tenant,
      title: "Sunday gathering",
      body: "Join us at 10am",
      status: "draft",
      audiences: ["members", "public"],
      timezone: "UTC",
    });
    assert.equal(created.ok, true, created.reason);

    const future = new Date(Date.now() + 86400000).toISOString();
    const scheduled = await updateAnnouncement(pool, created.item.id, {
      churchId: seed.church.id,
      scopeBranchId: null,
      actorUserId: seed.user.id,
      tenant: seed.tenant,
      status: "scheduled",
      startsAt: future,
      endsAt: null,
      audiences: ["members", "public"],
    });
    assert.equal(scheduled.ok, true, scheduled.reason);
    assert.equal(scheduled.item.status, "scheduled");

    const hidden = await listPublicWebsiteAnnouncements(pool, {
      churchId: seed.church.id,
      branchId: null,
    });
    assert.equal(hidden.ok, true);
    assert.equal(hidden.items.length, 0, "future scheduled must not be public");

    const published = await updateAnnouncement(pool, created.item.id, {
      churchId: seed.church.id,
      scopeBranchId: null,
      actorUserId: seed.user.id,
      tenant: seed.tenant,
      status: "published",
      confirmPublish: true,
      startsAt: new Date(Date.now() - 60000).toISOString(),
      enforcePublishConfirm: true,
      audiences: ["members", "public"],
    });
    assert.equal(published.ok, true, published.reason);

    const listed = await listPublicWebsiteAnnouncements(pool, {
      churchId: seed.church.id,
      branchId: null,
    });
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].title, "Sunday gathering");

    const detail = await getPublicWebsiteAnnouncement(pool, {
      churchId: seed.church.id,
      id: created.item.id,
    });
    assert.equal(detail.ok, true);
    assert.equal(detail.item.effectiveStatus, "published");

    const history = await listAnnouncementPublicationHistory(pool, {
      churchId: seed.church.id,
      id: created.item.id,
    });
    assert.equal(history.ok, true);
    assert.ok(history.events.length >= 1);
  });

  it("hides draft, expired, and non-public-audience from website", async () => {
    requireDb();
    const seed = await seedChurch(uniq("bbann2"));
    const draft = await createAnnouncement(pool, {
      churchId: seed.church.id,
      actorUserId: seed.user.id,
      tenant: seed.tenant,
      title: "Draft only",
      body: "Secret",
      status: "draft",
      audiences: ["public"],
    });
    assert.equal(draft.ok, true);

    const membersOnly = await createAnnouncement(pool, {
      churchId: seed.church.id,
      actorUserId: seed.user.id,
      tenant: seed.tenant,
      title: "Members only",
      body: "Private",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      audiences: ["members"],
    });
    assert.equal(membersOnly.ok, true, membersOnly.reason);

    const expired = await createAnnouncement(pool, {
      churchId: seed.church.id,
      actorUserId: seed.user.id,
      tenant: seed.tenant,
      title: "Expired notice",
      body: "Gone",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      audiences: ["public"],
      startsAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      endsAt: new Date(Date.now() - 86400000).toISOString(),
    });
    assert.equal(expired.ok, true, expired.reason);
    assert.equal(resolveEffectiveStatus(expired.item), "expired");

    const listed = await listPublicWebsiteAnnouncements(pool, {
      churchId: seed.church.id,
    });
    assert.equal(listed.items.length, 0);
    const miss = await getPublicWebsiteAnnouncement(pool, {
      churchId: seed.church.id,
      id: draft.item.id,
    });
    assert.equal(miss.ok, false);
  });

  it("enforces HQ-wide vs branch visibility on public list", async () => {
    requireDb();
    const seed = await seedChurch(uniq("bbann3"));
    const { rows: branchRows } = await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status)
       VALUES ($1, 'campus', 'Campus', 'branch', 'active')
       RETURNING id`,
      [seed.church.id]
    );
    const campusId = branchRows[0].id;

    const churchWide = await createAnnouncement(pool, {
      churchId: seed.church.id,
      branchId: null,
      actorUserId: seed.user.id,
      tenant: seed.tenant,
      title: "Church wide",
      body: "All campuses",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      audiences: ["public"],
    });
    assert.equal(churchWide.ok, true, churchWide.reason);

    const campusOnly = await createAnnouncement(pool, {
      churchId: seed.church.id,
      branchId: campusId,
      actorUserId: seed.user.id,
      tenant: seed.tenant,
      title: "Campus only",
      body: "Local",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      audiences: ["public"],
    });
    assert.equal(campusOnly.ok, true, campusOnly.reason);

    const hqSite = await listPublicWebsiteAnnouncements(pool, {
      churchId: seed.church.id,
      branchId: null,
    });
    assert.equal(hqSite.items.length, 1);
    assert.equal(hqSite.items[0].title, "Church wide");

    const campusSite = await listPublicWebsiteAnnouncements(pool, {
      churchId: seed.church.id,
      branchId: campusId,
    });
    assert.equal(campusSite.items.length, 2);

    const campusDetailOfChurch = await getPublicWebsiteAnnouncement(pool, {
      churchId: seed.church.id,
      branchId: campusId,
      id: churchWide.item.id,
    });
    assert.equal(campusDetailOfChurch.ok, true);

    const hqDetailOfCampus = await getPublicWebsiteAnnouncement(pool, {
      churchId: seed.church.id,
      branchId: null,
      id: campusOnly.item.id,
    });
    assert.equal(hqDetailOfCampus.ok, false);
  });

  it("rejects unauthorized publish and keeps V7 draft/published/archived insert", async () => {
    requireDb();
    const seed = await seedChurch(uniq("bbann4"));
    const viewerEmail = `viewer@${uniq("v")}.test`;
    const viewer = await createBlessBoardUser(pool, {
      email: viewerEmail,
      password: PASSWORD,
      displayName: "Viewer",
    });
    assert.equal(viewer.ok, true);
    // No role assignment → publish denied when tenant authz is provided
    const denied = await createAnnouncement(pool, {
      churchId: seed.church.id,
      actorUserId: viewer.user.id,
      tenant: seed.tenant,
      title: "Nope",
      body: "Denied",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      audiences: ["public"],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, STATUS.FORBIDDEN);

    const { rows } = await pool.query(
      `INSERT INTO blessboard.announcements
         (church_id, title, body, status, published_at)
       VALUES ($1, 'V7 classic', 'Works', 'published', now())
       RETURNING id, status, timezone`,
      [seed.church.id]
    );
    assert.equal(rows[0].status, "published");
    assert.equal(rows[0].timezone, "UTC");
  });

  it("unpublish removes website visibility and isolates across churches", async () => {
    requireDb();
    const a = await seedChurch(uniq("bbann5a"));
    const b = await seedChurch(uniq("bbann5b"));
    const published = await createAnnouncement(pool, {
      churchId: a.church.id,
      actorUserId: a.user.id,
      tenant: a.tenant,
      title: "Visible then gone",
      body: "Body",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      audiences: ["public"],
    });
    assert.equal(published.ok, true, published.reason);

    const cross = await getPublicWebsiteAnnouncement(pool, {
      churchId: b.church.id,
      id: published.item.id,
    });
    assert.equal(cross.ok, false);

    const unpublished = await updateAnnouncement(pool, published.item.id, {
      churchId: a.church.id,
      scopeBranchId: null,
      actorUserId: a.user.id,
      tenant: a.tenant,
      status: "draft",
    });
    assert.equal(unpublished.ok, true, unpublished.reason);
    assert.equal(unpublished.item.status, "draft");

    const listed = await listPublicWebsiteAnnouncements(pool, {
      churchId: a.church.id,
      branchId: null,
    });
    assert.equal(listed.items.length, 0);
    const miss = await getPublicWebsiteAnnouncement(pool, {
      churchId: a.church.id,
      id: published.item.id,
    });
    assert.equal(miss.ok, false);
  });

  it("public paths and navigation include announcements", () => {
    const {
      PATH_TO_PAGE_KEY,
      PAGE_KEY_TO_PATH,
    } = require("../src/blessboard/http/tenantPublicPaths");
    assert.equal(PATH_TO_PAGE_KEY["/announcements"], "announcements");
    assert.equal(PAGE_KEY_TO_PATH.announcements, "/announcements");
    const {
      PUBLIC_PAGE_KEYS,
    } = require("../src/blessboard/services/publicContentConstants");
    assert.ok(PUBLIC_PAGE_KEYS.includes("announcements"));
    const {
      buildPublicWebsiteNavigation,
    } = require("../src/blessboard/http/buildPublicWebsiteNavigation");
    const nav = buildPublicWebsiteNavigation({
      scopeType: "church",
      pathPrefix: "",
      activePageKey: "announcements",
    });
    const flat = JSON.stringify(nav);
    assert.match(flat, /announcements/);
  });
});

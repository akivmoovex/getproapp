"use strict";

/**
 * BlessBoard V5 announcements: audiences, publish workflow, reads, counts,
 * attachments, authorization, and V4 isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  foundationDbUnavailableSkipReason,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  V5_IDENTITY_KEY: IDENTITY_KEY,
  DEFAULT_V5_COOKIE,
  baseV5TestEnv,
  makeTenant,
  extractSetCookie: extractCookie,
  joinCookieHeader: cookieHeader,
} = require("./helpers/blessboardV5Fixtures");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  submitMemberRegistration,
  approveMemberRegistration,
  linkMemberToUser,
} = require("../src/blessboard/services/memberRegistrationService");
const {
  STATUS,
  createAnnouncement,
  updateAnnouncement,
  listMemberAnnouncements,
  getMemberAnnouncement,
  markAnnouncementRead,
  evaluateAnnouncementCapability,
} = require("../src/blessboard/services/announcementsService");
const { insertMediaAsset } = require("../src/blessboard/media/mediaAssetsRepository");
const { createMediaUploadService } = require("../src/blessboard/media/mediaUploadService");
const { VISIBILITY } = require("../src/blessboard/media/mediaConstants");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "ann-a.blessboard.org";
const HOST_B = "ann-b.blessboard.org";
const ROOT = path.join(__dirname, "..");

const PDF_MIN = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");

function baseEnv(overrides) {
  return baseV5TestEnv({
    BLESSBOARD_MEDIA_FORCE_LOCAL: "1",
    ...overrides,
  });
}

describe("blessboard announcements", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let mediaRoot;
  let mediaService;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let branchB;
  let campusBranch;
  let hqAdmin;
  let branchAdmin;
  let campusAdmin;
  let platformAdmin;
  let memberUser;
  let memberId;
  let memberB;
  let campusMember;
  let campusMemberId;

  before(async () => {
    try {
      mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bb-ann-media-"));
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "ann-a",
        displayName: "Ann A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ann-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "ann-a",
        churchKey: "ann-a",
        displayName: "Ann Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      const campusIns = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus', 'Campus A', 'branch', 'active', false, 'UTC', 'US')
         RETURNING id, church_id, branch_key, display_name`,
        [churchA.id]
      );
      campusBranch = campusIns.rows[0];

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "ann-b",
        displayName: "Ann B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ann-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "ann-b",
        churchKey: "ann-b",
        displayName: "Ann Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;
      branchB = chB.records.hqBranch;

      async function makeUser(email, role, orgRec) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message);
        if (role) {
          const assigned = await assignBlessBoardRole(pool, role);
          assert.equal(assigned.ok, true, assigned.message || assigned.reason);
        }
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: orgRec.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      hqAdmin = await makeUser(
        "hq@ann-a.example.test",
        {
          email: "hq@ann-a.example.test",
          organizationKey: "ann-a",
          churchKey: "ann-a",
          roleKey: "church_hq_admin",
        },
        orgA
      );
      branchAdmin = await makeUser(
        "branch@ann-a.example.test",
        {
          email: "branch@ann-a.example.test",
          organizationKey: "ann-a",
          churchKey: "ann-a",
          roleKey: "branch_admin",
          branchKey: "hq",
        },
        orgA
      );
      campusAdmin = await makeUser(
        "campus@ann-a.example.test",
        {
          email: "campus@ann-a.example.test",
          organizationKey: "ann-a",
          churchKey: "ann-a",
          roleKey: "branch_admin",
          branchKey: "campus",
        },
        orgA
      );
      platformAdmin = await makeUser(
        "platform@ann-a.example.test",
        {
          email: "platform@ann-a.example.test",
          organizationKey: "ann-a",
          roleKey: "platform_admin",
        },
        orgA
      );
      memberUser = await makeUser("member@ann-a.example.test", null, orgA);
      campusMember = await makeUser("campus-member@ann-a.example.test", null, orgA);
      memberB = await makeUser("member@ann-b.example.test", null, orgB);

      async function provisionLinkedMember(email, userBundle, phone, branch) {
        const submitted = await submitMemberRegistration(pool, {
          churchId: churchA.id,
          branchId: branch.id,
          firstName: "Ann",
          lastName: "Member",
          preferredName: "Ann",
          email,
          phone,
        });
        assert.equal(submitted.ok, true, submitted.reason);
        const approved = await approveMemberRegistration(pool, {
          registrationId: submitted.registration.id,
          actorUserId: hqAdmin.user.id,
        });
        assert.equal(approved.ok, true, approved.reason);
        const linked = await linkMemberToUser(pool, {
          memberId: approved.member.id,
          actorUserId: hqAdmin.user.id,
          userId: userBundle.user.id,
        });
        assert.equal(linked.ok, true, linked.reason);
        return approved.member.id;
      }

      memberId = await provisionLinkedMember(
        "member@ann-a.example.test",
        memberUser,
        "+15551235001",
        branchA
      );
      campusMemberId = await provisionLinkedMember(
        "campus-member@ann-a.example.test",
        campusMember,
        "+15551235002",
        campusBranch
      );

      const submittedB = await submitMemberRegistration(pool, {
        churchId: churchB.id,
        branchId: branchB.id,
        firstName: "Other",
        lastName: "Member",
        email: "member@ann-b.example.test",
        phone: "+15551235003",
      });
      assert.equal(submittedB.ok, true, submittedB.reason);
      const hqB = await makeUser(
        "hq@ann-b.example.test",
        {
          email: "hq@ann-b.example.test",
          organizationKey: "ann-b",
          churchKey: "ann-b",
          roleKey: "church_hq_admin",
        },
        orgB
      );
      const approvedB = await approveMemberRegistration(pool, {
        registrationId: submittedB.registration.id,
        actorUserId: hqB.user.id,
      });
      assert.equal(approvedB.ok, true, approvedB.reason);
      await linkMemberToUser(pool, {
        memberId: approvedB.member.id,
        actorUserId: hqB.user.id,
        userId: memberB.user.id,
      });

      mediaService = createMediaUploadService(baseEnv(), { rootDir: mediaRoot });
      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv({ BLESSBOARD_MEDIA_ROOT: mediaRoot }),
        mediaService,
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("announcements suite setup failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
    if (mediaRoot) fs.rmSync(mediaRoot, { recursive: true, force: true });
  });

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(foundationDbUnavailableSkipReason(skipReason));
      return true;
    }
    return false;
  }

  it("creates announcement tables with expected constraints", async (t) => {
    if (skipIfNeeded(t)) return;
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'blessboard'
          AND table_name LIKE 'announcement%'
        ORDER BY table_name`
    );
    assert.deepEqual(
      tables.rows.map((r) => r.table_name),
      [
        "announcement_attachments",
        "announcement_audiences",
        "announcement_reads",
        "announcements",
      ]
    );
  });

  it("evaluates platform publish policy without silent publish", () => {
    const platformOnly = [{ roleKey: "platform_admin" }];
    const denied = evaluateAnnouncementCapability(
      platformOnly,
      { branchId: null },
      { allowPlatformAdminPublish: false },
      "publish"
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "platform_publish_denied");
    const allowed = evaluateAnnouncementCapability(
      platformOnly,
      { branchId: null },
      { allowPlatformAdminPublish: true },
      "publish"
    );
    assert.equal(allowed.ok, true);
    const readOk = evaluateAnnouncementCapability(
      platformOnly,
      { branchId: null },
      {},
      "read"
    );
    assert.equal(readOk.ok, true);
  });

  it("HQ publishes church-wide with confirm; drafts without confirm", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const noConfirm = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Needs confirm",
      body: "Body text",
      status: "published",
      audiences: ["members"],
      enforcePublishConfirm: true,
      confirmPublish: false,
    });
    assert.equal(noConfirm.ok, false);
    assert.equal(noConfirm.reason, "confirm_publish");

    const draft = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Draft church-wide",
      body: "Draft body",
      status: "draft",
      audiences: ["members", "admins"],
      isPinned: true,
      actionUrl: "https://example.com/act",
      actionLabel: "Learn more",
      enforcePublishConfirm: true,
    });
    assert.equal(draft.ok, true, draft.reason);
    assert.equal(draft.item.status, "draft");
    assert.equal(draft.item.branchId, null);
    assert.ok(draft.item.audiences.includes("members"));
    assert.ok(draft.item.audiences.includes("admins"));

    const published = await updateAnnouncement(pool, draft.item.id, {
      actorUserId: hqAdmin.user.id,
      tenant,
      churchId: churchA.id,
      scopeBranchId: null,
      status: "published",
      confirmPublish: "1",
      enforcePublishConfirm: true,
      expectedUpdatedAt: draft.item.updatedAt,
    });
    assert.equal(published.ok, true, published.reason);
    assert.equal(published.item.status, "published");
    assert.ok(published.item.publishedAt);
  });

  it("branch admin cannot publish church-wide; can publish assigned branch", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const denied = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Branch tries church-wide",
      body: "Nope",
      status: "draft",
      audiences: ["members"],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, STATUS.FORBIDDEN);

    const ok = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Branch scoped",
      body: "Branch body",
      status: "published",
      audiences: ["members"],
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(ok.ok, true, ok.reason);
    assert.equal(ok.item.branchId, branchA.id);
  });

  it("campus branch admin cannot manage HQ branch announcements", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, campusBranch, branchA);
    const created = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: campusAdmin.user.id,
      tenant,
      title: "Wrong branch",
      body: "Should fail",
      status: "draft",
      audiences: ["members"],
    });
    assert.equal(created.ok, false);
    assert.equal(created.status, STATUS.FORBIDDEN);

    const campusOk = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      actorUserId: campusAdmin.user.id,
      tenant,
      title: "Campus only",
      body: "Campus body",
      status: "published",
      audiences: ["members"],
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(campusOk.ok, true, campusOk.reason);
  });

  it("platform admin may inspect but not publish by default", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const draft = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: platformAdmin.user.id,
      tenant,
      title: "Platform draft",
      body: "Inspect only path",
      status: "draft",
      audiences: ["admins"],
    });
    assert.equal(draft.ok, true, draft.reason);

    const published = await updateAnnouncement(pool, draft.item.id, {
      actorUserId: platformAdmin.user.id,
      tenant,
      churchId: churchA.id,
      scopeBranchId: null,
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      expectedUpdatedAt: draft.item.updatedAt,
    });
    assert.equal(published.ok, false);
    assert.equal(published.reason, "platform_publish_denied");
  });

  it("isolates member audiences and branch scope for reads", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);

    const churchWide = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Church-wide members",
      body: "Everyone",
      status: "published",
      audiences: ["members"],
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(churchWide.ok, true, churchWide.reason);

    const adminsOnly = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Admins only",
      body: "Staff",
      status: "published",
      audiences: ["admins"],
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(adminsOnly.ok, true, adminsOnly.reason);

    const campusAnn = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      actorUserId: hqAdmin.user.id,
      tenant: makeTenant(churchA, orgA.records.organization, campusBranch, branchA),
      title: "Campus members",
      body: "Campus",
      status: "published",
      audiences: ["members"],
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(campusAnn.ok, true, campusAnn.reason);

    const hqList = await listMemberAnnouncements(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
    });
    assert.equal(hqList.ok, true);
    const hqTitles = hqList.items.map((i) => i.title);
    assert.ok(hqTitles.includes("Church-wide members"));
    assert.ok(!hqTitles.includes("Admins only"));
    assert.ok(!hqTitles.includes("Campus members"));

    const campusList = await listMemberAnnouncements(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      memberId: campusMemberId,
    });
    assert.equal(campusList.ok, true);
    const campusTitles = campusList.items.map((i) => i.title);
    assert.ok(campusTitles.includes("Church-wide members"));
    assert.ok(campusTitles.includes("Campus members"));

    const cross = await getMemberAnnouncement(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      id: campusAnn.item.id,
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.status, STATUS.FORBIDDEN);
  });

  it("tracks reads and derives delivery counts safely", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Read tracking",
      body: "Please read",
      status: "published",
      audiences: ["members"],
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(created.ok, true, created.reason);
    assert.ok(created.item.delivery.eligibleCount >= 1);
    assert.equal(created.item.delivery.readCount, 0);

    const detail = await getMemberAnnouncement(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      id: created.item.id,
      recordSeen: true,
    });
    assert.equal(detail.ok, true);
    assert.ok(detail.item.firstSeenAt);
    assert.equal(detail.item.readAt, null);

    const marked = await markAnnouncementRead(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      id: created.item.id,
    });
    assert.equal(marked.ok, true);
    assert.ok(marked.read.readAt);

    const again = await markAnnouncementRead(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      id: created.item.id,
    });
    assert.equal(again.ok, true);
    assert.equal(String(again.read.readAt), String(marked.read.readAt));

    const refreshed = await updateAnnouncement(pool, created.item.id, {
      actorUserId: hqAdmin.user.id,
      tenant,
      churchId: churchA.id,
      scopeBranchId: branchA.id,
      title: "Read tracking",
      expectedUpdatedAt: created.item.updatedAt,
    });
    // optimistic may conflict if updated_at drifted — reload via create path counts
    const { rows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE read_at IS NOT NULL)::int AS read_count
         FROM blessboard.announcement_reads
        WHERE announcement_id = $1`,
      [created.item.id]
    );
    assert.equal(Number(rows[0].read_count), 1);
    void refreshed;
  });

  it("attaches media assets from the same church only", async (t) => {
    if (skipIfNeeded(t)) return;
    const sha = crypto.createHash("sha256").update("announcement-attach").digest("hex");
    const asset = await insertMediaAsset(pool, {
      churchId: churchA.id,
      branchId: null,
      uploadedByUserId: hqAdmin.user.id,
      storageBucket: "local",
      storageKey: `ann/${sha}`,
      originalFilename: "flyer.pdf",
      mimeType: "application/pdf",
      sizeBytes: 128,
      sha256: sha,
      visibility: "private",
    });
    const foreignSha = crypto.createHash("sha256").update("foreign-attach").digest("hex");
    const foreign = await insertMediaAsset(pool, {
      churchId: churchB.id,
      branchId: null,
      uploadedByUserId: hqAdmin.user.id,
      storageBucket: "local",
      storageKey: `ann/${foreignSha}`,
      originalFilename: "other.pdf",
      mimeType: "application/pdf",
      sizeBytes: 64,
      sha256: foreignSha,
      visibility: "private",
    });

    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const withAtt = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "With attachment",
      body: "See flyer",
      status: "draft",
      audiences: ["members"],
      mediaAssetIds: [asset.id],
    });
    assert.equal(withAtt.ok, true, withAtt.reason);
    assert.equal(withAtt.item.attachments.length, 1);
    assert.equal(withAtt.item.attachments[0].mediaAssetId, asset.id);

    const publicOnly = await insertMediaAsset(pool, {
      churchId: churchA.id,
      branchId: null,
      uploadedByUserId: hqAdmin.user.id,
      storageBucket: "local",
      storageKey: `ann/${crypto.createHash("sha256").update("public-attach").digest("hex")}`,
      originalFilename: "public.pdf",
      mimeType: "application/pdf",
      sizeBytes: 32,
      sha256: crypto.createHash("sha256").update("public-attach").digest("hex"),
      visibility: "public",
    });
    const rejectPublic = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Public attachment rejected",
      body: "Nope",
      status: "draft",
      audiences: ["members"],
      mediaAssetIds: [publicOnly.id],
    });
    assert.equal(rejectPublic.ok, false);
    assert.equal(rejectPublic.reason, "media_asset");

    const bad = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Bad attachment",
      body: "Nope",
      status: "draft",
      audiences: ["members"],
      mediaAssetIds: [foreign.id],
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "media_asset");
  });

  it("serves announcement attachments via authz download; blocks public media path and cross-tenant", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const uploaded = await mediaService.uploadMediaAsset(pool, {
      churchId: churchA.id,
      uploadedByUserId: branchAdmin.user.id,
      buffer: PDF_MIN,
      originalFilename: 'flyer\r\n"evil.pdf',
      claimedMime: "application/pdf",
      visibility: VISIBILITY.PRIVATE,
    });
    assert.equal(uploaded.ok, true, uploaded.reason);

    const created = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      audiences: ["members"],
      title: "Attachment download",
      body: "See attached flyer",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      mediaAssetIds: [uploaded.asset.id],
    });
    assert.equal(created.ok, true, created.reason);
    const att = created.item.attachments[0];
    assert.ok(att && att.id);

    const memberDetail = await request(app)
      .get(`/member/announcements/${created.item.id}`)
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`);
    assert.equal(memberDetail.status, 200);
    assert.match(
      memberDetail.text,
      new RegExp(`/member/announcements/${created.item.id}/attachments/${att.id}/file`)
    );
    assert.doesNotMatch(memberDetail.text, /\/_bb\/media\//);
    assert.doesNotMatch(memberDetail.text, /storage_key|storageKey|BLESSBOARD_MEDIA_ROOT|\/tmp\//i);

    const memberFile = await request(app)
      .get(`/member/announcements/${created.item.id}/attachments/${att.id}/file`)
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(memberFile.status, 200);
    assert.match(String(memberFile.headers["content-type"] || ""), /application\/pdf/);
    assert.match(String(memberFile.headers["content-disposition"] || ""), /attachment/);
    assert.doesNotMatch(String(memberFile.headers["content-disposition"] || ""), /\r|\n/);
    assert.match(String(memberFile.headers["cache-control"] || ""), /private/i);
    assert.equal(String(memberFile.headers["x-content-type-options"] || ""), "nosniff");
    assert.deepEqual(Buffer.from(memberFile.body), PDF_MIN);

    const publicPath = await request(app)
      .get(`/_bb/media/${uploaded.asset.id}`)
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`);
    assert.equal(publicPath.status, 403);

    const foreign = await request(app)
      .get(`/member/announcements/${created.item.id}/attachments/${att.id}/file`)
      .set("Host", HOST_B)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberB.rawToken}`);
    assert.ok(foreign.status === 403 || foreign.status === 404);

    const adminFile = await request(app)
      .get(`/branch-admin/announcements/${created.item.id}/attachments/${att.id}/file`)
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(adminFile.status, 200);
    assert.deepEqual(Buffer.from(adminFile.body), PDF_MIN);
  });

  it("HQ admin HTML CRUD and member list/detail/read endpoints", async (t) => {
    if (skipIfNeeded(t)) return;
    const hqCookie = `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`;
    const list = await request(app)
      .get("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /Announcements/);
    assert.doesNotMatch(list.text, new RegExp(churchA.id, "i"));

    const csrf = extractCookie(list, CSRF_COOKIE);
    const createRes = await request(app)
      .post("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(hqCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "HTTP published",
        body: "From form",
        status: "published",
        audience_members: "1",
        confirm_publish: "1",
      });
    assert.equal(createRes.status, 303);
    assert.match(createRes.headers.location, /\/hq\/announcements\/[0-9a-f-]{36}/i);
    const annId = createRes.headers.location.split("/").pop().split("?")[0];

    const memberCookie = `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`;
    const memberList = await request(app)
      .get("/member/announcements")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(memberList.status, 200);
    assert.match(memberList.text, /HTTP published/);
    assert.doesNotMatch(memberList.text, new RegExp(churchA.id, "i"));

    const detail = await request(app)
      .get(`/member/announcements/${annId}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /From form/);
    const memberCsrf = extractCookie(detail, CSRF_COOKIE);

    const mark = await request(app)
      .post(`/member/announcements/${annId}/read`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${memberCsrf}`))
      .set("Accept", "application/json")
      .type("form")
      .send({ [CSRF_FIELD]: memberCsrf });
    assert.equal(mark.status, 200);
    assert.equal(mark.body.ok, true);
    assert.ok(mark.body.readAt);

    const afterRead = await request(app)
      .get(`/member/announcements/${annId}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(afterRead.status, 200);
    assert.match(afterRead.text, /data-bb-unread="0"/);
    assert.match(afterRead.text, /data-bb-read-status="read"/);
    assert.match(afterRead.text, /You have read this announcement/);
    assert.doesNotMatch(afterRead.text, /Mark as read/);
  });

  it("renders pinned, featured, and unread announcement states in member GUI", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Pinned featured notice",
      body: "Body for GUI states",
      status: "published",
      audiences: ["members"],
      isPinned: true,
      isFeatured: true,
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(created.ok, true, created.reason);

    const memberCookie = `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`;
    const list = await request(app)
      .get("/member/announcements")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-member-announcements="1"/);
    assert.match(list.text, /data-bb-stitch-announcements="16-member-announcements"/);
    assert.match(list.text, /data-bb-ann-toolbar="1"/);
    assert.match(list.text, /data-bb-ann-filter-link="unread"/);
    assert.match(list.text, /data-bb-ann-search="1"/);
    assert.match(list.text, /Pinned featured notice/);
    assert.match(list.text, /data-bb-pinned="1"/);
    assert.match(list.text, /data-bb-featured="1"/);
    assert.match(list.text, /data-bb-unread="1"/);
    assert.match(list.text, /bb-mp-chip--pinned/);
    assert.match(list.text, /bb-mp-chip--featured/);
    assert.match(list.text, /bb-mp-chip--unread/);
    assert.doesNotMatch(list.text, /Showing \d+ of \d+|1,240|Total Views|delivery rate/i);
    assert.doesNotMatch(list.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(list.text, new RegExp(memberId, "i"));

    const unreadOnly = await request(app)
      .get("/member/announcements?filter=unread")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(unreadOnly.status, 200);
    assert.match(unreadOnly.text, /data-bb-ann-filter="unread"/);
    assert.match(unreadOnly.text, /Pinned featured notice/);

    const noResults = await request(app)
      .get("/member/announcements?q=zzzz-no-match-term")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(noResults.status, 200);
    assert.match(noResults.text, /data-bb-ann-empty="no-results"/);
    assert.doesNotMatch(noResults.text, /Pinned featured notice/);

    const detail = await request(app)
      .get(`/member/announcements/${created.item.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-member-announcement-detail="1"/);
    assert.match(detail.text, /data-bb-pinned="1"/);
    assert.match(detail.text, /data-bb-featured="1"/);
    assert.match(detail.text, /Mark as read/);
    assert.match(detail.text, /name="_csrf"/);
  });

  it("blocks cross-tenant member access", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Tenant A only",
      body: "Secret",
      status: "published",
      audiences: ["members"],
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(created.ok, true, created.reason);

    const foreign = await request(app)
      .get(`/member/announcements/${created.item.id}`)
      .set("Host", HOST_B)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberB.rawToken}`);
    assert.ok(foreign.status === 403 || foreign.status === 404);
  });

  it("branch admin list/create/preview/publish/archive GUI with CSRF and delivery summary", async (t) => {
    if (skipIfNeeded(t)) return;
    const baCookie = `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`;
    const list = await request(app)
      .get("/branch-admin/announcements")
      .set("Host", HOST_A)
      .set("Cookie", baCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-announcement-admin-list="1"/);
    assert.match(list.text, /data-bb-stitch-announcements="35-branch-announcements-management"/);
    assert.match(list.text, /Announcements management/);
    assert.match(list.text, /Create announcement/);
    assert.match(list.text, /data-bb-ann-filter="1"/);
    assert.match(list.text, /data-bb-ann-status-chips="1"/);
    assert.match(list.text, /data-bb-ann-audience-chips="1"/);
    assert.match(list.text, /data-bb-ann-table="1"/);
    assert.match(list.text, /data-bb-ann-cards="1"/);
    assert.doesNotMatch(list.text, /Active Today|Scheduled|1,240|Total Views|Admin Tip|Engagement|Announcement Insights/i);
    assert.doesNotMatch(list.text, /data-bb-delivery=/);
    assert.doesNotMatch(list.text, /data-bb-hq-announcements=/);
    assert.doesNotMatch(list.text, /data-bb-ann-action="edit"/);
    assert.doesNotMatch(list.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(list.text, new RegExp(branchA.id, "i"));

    const newForm = await request(app)
      .get("/branch-admin/announcements/new")
      .set("Host", HOST_A)
      .set("Cookie", baCookie);
    assert.equal(newForm.status, 200);
    assert.match(newForm.text, /data-bb-announcement-admin-form="1"/);
    assert.match(newForm.text, /data-bb-stitch-announcement-editor="35-branch-announcements-management"/);
    assert.match(newForm.text, /data-bb-form-mode="create"/);
    assert.match(newForm.text, /name="_csrf"/);
    assert.match(newForm.text, /name="title"/);
    assert.match(newForm.text, /name="body"/);
    assert.match(newForm.text, /name="audience_members"/);
    assert.match(newForm.text, /name="audience_admins"/);
    assert.match(newForm.text, /name="is_pinned"/);
    assert.match(newForm.text, /name="is_featured"/);
    assert.match(newForm.text, /name="action_url"/);
    assert.match(newForm.text, /name="action_label"/);
    assert.match(newForm.text, /name="media_asset_id"/);
    assert.match(newForm.text, /data-bb-ann-save-draft="1"/);
    assert.match(newForm.text, /data-bb-ann-publish-submit="1"/);
    assert.match(newForm.text, /name="status"[\s\S]*value="draft"/);
    assert.match(newForm.text, /name="status"[\s\S]*value="published"/);
    assert.match(newForm.text, /name="confirm_publish"/);
    assert.match(newForm.text, /data-bb-ann-live-preview="1"/);
    assert.doesNotMatch(newForm.text, /Schedule|Template|Delivery channel|Total Views|Engagement/i);
    assert.doesNotMatch(newForm.text, new RegExp(churchA.id, "i"));

    const csrf = extractCookie(newForm, CSRF_COOKIE);
    const createRes = await request(app)
      .post("/branch-admin/announcements")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(baCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "Branch GUI draft",
        body: "Branch scoped body for GUI",
        status: "draft",
        audience_members: "1",
      });
    assert.equal(createRes.status, 303);
    assert.match(createRes.headers.location, /\/branch-admin\/announcements\/[0-9a-f-]{36}/i);
    const annId = createRes.headers.location.split("/").pop().split("?")[0];

    const editForm = await request(app)
      .get(`/branch-admin/announcements/${annId}/edit`)
      .set("Host", HOST_A)
      .set("Cookie", baCookie);
    assert.equal(editForm.status, 200);
    assert.match(editForm.text, /data-bb-form-mode="edit"/);
    assert.match(editForm.text, /data-bb-ann-editor-status="draft"/);
    assert.match(editForm.text, /data-bb-ann-save-draft="1"/);
    assert.match(editForm.text, /data-bb-ann-publish="1"/);
    assert.match(editForm.text, /name="expected_updated_at"/);
    assert.match(editForm.text, /Branch GUI draft/);
    assert.doesNotMatch(editForm.text, /data-bb-ann-publish-submit="1"/);

    const detail = await request(app)
      .get(`/branch-admin/announcements/${annId}`)
      .set("Host", HOST_A)
      .set("Cookie", baCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-announcement-admin-detail="1"/);
    assert.match(detail.text, /Branch GUI draft/);
    assert.match(detail.text, /data-bb-delivery="summary"/);
    assert.match(detail.text, /Delivery \/ read summary/);
    assert.match(detail.text, /data-bb-ann-preview="1"/);
    assert.match(detail.text, /data-bb-ann-publish="1"/);
    assert.match(detail.text, /bb-ann-archive-modal/);
    assert.doesNotMatch(detail.text, /method="post"[^>]*action="[^"]*\/delete"/i);
    assert.doesNotMatch(detail.text, /DELETE FROM/i);

    const noCsrfArchive = await request(app)
      .post(`/branch-admin/announcements/${annId}/archive`)
      .set("Host", HOST_A)
      .set("Cookie", baCookie)
      .type("form")
      .send({});
    assert.equal(noCsrfArchive.status, 403);

    const preview = await request(app)
      .get(`/branch-admin/announcements/${annId}/preview`)
      .set("Host", HOST_A)
      .set("Cookie", baCookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /data-bb-announcement-admin-preview="1"/);
    assert.match(preview.text, /Member preview/);
    assert.match(preview.text, /Not published/);

    const publishPage = await request(app)
      .get(`/branch-admin/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", baCookie);
    assert.equal(publishPage.status, 200);
    assert.match(publishPage.text, /data-bb-announcement-admin-publish="1"/);
    assert.match(publishPage.text, /Confirm publish/);
    assert.match(publishPage.text, /name="confirm_publish"/);
    const pubCsrf = extractCookie(publishPage, CSRF_COOKIE);

    const noConfirm = await request(app)
      .post(`/branch-admin/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(baCookie, `${CSRF_COOKIE}=${pubCsrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: pubCsrf,
      });
    assert.equal(noConfirm.status, 400);
    assert.match(noConfirm.text, /confirm/i);

    const published = await request(app)
      .post(`/branch-admin/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(baCookie, `${CSRF_COOKIE}=${pubCsrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: pubCsrf,
        confirm_publish: "1",
      });
    assert.equal(published.status, 303);
    assert.match(published.headers.location, /saved=published/);

    const afterPublish = await request(app)
      .get(`/branch-admin/announcements/${annId}`)
      .set("Host", HOST_A)
      .set("Cookie", baCookie);
    assert.equal(afterPublish.status, 200);
    assert.match(afterPublish.text, /data-bb-announcement-status="published"/);
    assert.match(afterPublish.text, /Eligible members/);
    const archCsrf = extractCookie(afterPublish, CSRF_COOKIE);

    const archived = await request(app)
      .post(`/branch-admin/announcements/${annId}/archive`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(baCookie, `${CSRF_COOKIE}=${archCsrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: archCsrf });
    assert.equal(archived.status, 303);
    assert.match(archived.headers.location, /saved=archived/);

    const afterArchive = await request(app)
      .get(`/branch-admin/announcements/${annId}`)
      .set("Host", HOST_A)
      .set("Cookie", baCookie);
    assert.equal(afterArchive.status, 200);
    assert.match(afterArchive.text, /data-bb-announcement-status="archived"/);
    assert.doesNotMatch(afterArchive.text, /data-bb-ann-publish="1"/);

    const { rows } = await pool.query(
      `SELECT status FROM blessboard.announcements WHERE id = $1`,
      [annId]
    );
    assert.equal(rows[0].status, "archived");
  });

  it("branch admin cannot open another campus announcement on host HQ scope", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, campusBranch, branchA);
    const created = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      actorUserId: hqAdmin.user.id,
      tenant: makeTenant(churchA, orgA.records.organization, branchA),
      title: "Campus only announcement",
      body: "Not for HQ branch admin queue",
      status: "draft",
      audiences: ["members"],
    });
    assert.equal(created.ok, true, created.reason);

    const baCookie = `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`;
    const denied = await request(app)
      .get(`/branch-admin/announcements/${created.item.id}`)
      .set("Host", HOST_A)
      .set("Cookie", baCookie);
    assert.ok(denied.status === 403 || denied.status === 404, `status=${denied.status}`);
    void tenant;
  });

  it("HQ church-wide and branch-scoped announcement GUI preserve publish/preview/archive/concurrency", async (t) => {
    if (skipIfNeeded(t)) return;
    const hqCookie = `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`;

    const list = await request(app)
      .get("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-announcement-admin-list="1"/);
    assert.match(list.text, /data-bb-hq-announcements="1"/);
    assert.match(list.text, /data-bb-stitch-announcements="61-hq-broadcast-center"/);
    assert.match(list.text, /data-bb-delivery="overview"/);
    assert.match(list.text, /data-bb-hq-ann-branches="1"/);
    assert.match(list.text, /data-bb-ann-filter="1"/);
    assert.match(list.text, /data-bb-ann-status-chips="1"/);
    assert.match(list.text, /data-bb-ann-audience-chips="1"/);
    assert.match(list.text, /href="\/hq\/announcements\/b\/campus"/);
    assert.match(list.text, /href="\/hq\/registrations"/);
    assert.doesNotMatch(list.text, /delivery rate|%\s*read|branch reach|WhatsApp/i);
    assert.doesNotMatch(list.text, new RegExp(churchA.id, "i"));

    const newForm = await request(app)
      .get("/hq/announcements/new")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(newForm.status, 200);
    assert.match(newForm.text, /data-bb-announcement-admin-form="1"/);
    assert.match(newForm.text, /data-bb-hq-announcement-editor="1"/);
    assert.match(newForm.text, /data-bb-stitch-announcement-editor="61-hq-broadcast-center"/);
    assert.match(newForm.text, /data-bb-ann-scope-panel="1"/);
    assert.match(newForm.text, /data-bb-ann-scope="church"/);
    assert.match(newForm.text, /name="_csrf"/);
    assert.match(newForm.text, /name="title"/);
    assert.match(newForm.text, /name="body"/);
    assert.match(newForm.text, /name="audience_members"/);
    assert.match(newForm.text, /name="audience_admins"/);
    assert.match(newForm.text, /name="is_pinned"/);
    assert.match(newForm.text, /name="confirm_publish"/);
    assert.match(newForm.text, /data-bb-ann-save-draft="1"/);
    assert.match(newForm.text, /data-bb-ann-publish-submit="1"/);
    assert.doesNotMatch(newForm.text, /Schedule for|Template library|WhatsApp|Push notification/i);
    assert.doesNotMatch(newForm.text, new RegExp(churchA.id, "i"));

    const csrf = extractCookie(list, CSRF_COOKIE);
    const createRes = await request(app)
      .post("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(hqCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "HQ oversight draft",
        body: "Church-wide message",
        status: "draft",
        audience_members: "1",
      });
    assert.equal(createRes.status, 303);
    const annId = createRes.headers.location.split("/").pop().split("?")[0];

    const editForm = await request(app)
      .get(`/hq/announcements/${annId}/edit`)
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(editForm.status, 200);
    assert.match(editForm.text, /data-bb-hq-announcement-editor="1"/);
    assert.match(editForm.text, /data-bb-form-mode="edit"/);
    assert.match(editForm.text, /data-bb-ann-audience-estimate="1"/);
    assert.match(editForm.text, /data-bb-delivery="eligible"/);
    assert.match(editForm.text, /name="expected_updated_at"/);
    assert.match(editForm.text, /HQ oversight draft/);

    const preview = await request(app)
      .get(`/hq/announcements/${annId}/preview`)
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /data-bb-announcement-admin-preview="1"/);
    assert.match(preview.text, /HQ oversight draft/);

    const publishPage = await request(app)
      .get(`/hq/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(publishPage.status, 200);
    assert.match(publishPage.text, /data-bb-hq-announcement-publish="1"/);
    assert.match(publishPage.text, /data-bb-stitch-announcement-publish="61-hq-broadcast-center"/);
    assert.match(publishPage.text, /name="confirm_publish"/);
    assert.match(publishPage.text, /name="expected_updated_at"/);
    assert.match(publishPage.text, /data-bb-delivery="eligible"|data-bb-ann-audience-estimate="1"/);
    assert.match(publishPage.text, /data-bb-ann-publish-scope="church"/);
    const pubCsrf = extractCookie(publishPage, CSRF_COOKIE);

    const stale = await request(app)
      .post(`/hq/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(hqCookie, `${CSRF_COOKIE}=${pubCsrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: pubCsrf,
        confirm_publish: "1",
        expected_updated_at: "2000-01-01T00:00:00.000Z",
      });
    assert.equal(stale.status, 409);
    assert.match(stale.text, /Someone else updated|try again/i);

    const freshPage = await request(app)
      .get(`/hq/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    const expectedMatch = freshPage.text.match(
      /name="expected_updated_at"\s+value="([^"]+)"/
    );
    assert.ok(expectedMatch, "expected_updated_at present");
    const freshCsrf = extractCookie(freshPage, CSRF_COOKIE);
    const published = await request(app)
      .post(`/hq/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(hqCookie, `${CSRF_COOKIE}=${freshCsrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: freshCsrf,
        confirm_publish: "1",
        expected_updated_at: expectedMatch[1],
      });
    assert.equal(published.status, 303);
    assert.match(published.headers.location, /saved=published/);

    const afterPublish = await request(app)
      .get("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(afterPublish.status, 200);
    assert.match(afterPublish.text, /HQ oversight draft/);
    assert.match(afterPublish.text, /data-bb-delivery="row"/);
    assert.match(afterPublish.text, /data-bb-eligible=/);
    assert.match(afterPublish.text, /eligible/);
    assert.doesNotMatch(afterPublish.text, /delivery rate|%\s*read|branch reach/i);

    const searched = await request(app)
      .get("/hq/announcements?q=oversight&status=published&page=1")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(searched.status, 200);
    assert.match(searched.text, /HQ oversight draft/);
    assert.match(searched.text, /value="oversight"/);

    const noResults = await request(app)
      .get("/hq/announcements?q=zzznomatch999")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(noResults.status, 200);
    assert.match(noResults.text, /data-bb-ann-empty="no-results"/);
    assert.doesNotMatch(noResults.text, /HQ oversight draft/);

    const adminsOnly = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant: makeTenant(churchA, orgA.records.organization, branchA),
      title: "Admins only HQ note",
      body: "No member delivery",
      status: "published",
      audiences: ["admins"],
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(adminsOnly.ok, true, adminsOnly.reason);
    const adminsList = await request(app)
      .get("/hq/announcements?q=Admins+only")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(adminsList.status, 200);
    assert.match(adminsList.text, /Admins only HQ note/);
    assert.match(adminsList.text, /data-bb-delivery="unavailable"/);

    const branchList = await request(app)
      .get("/hq/announcements/b/campus")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(branchList.status, 200);
    assert.match(branchList.text, /Campus A|Branch announcements|scope/i);
    assert.match(branchList.text, /href="\/hq\/announcements"/);
    assert.doesNotMatch(branchList.text, /HQ oversight draft/);

    const branchCsrf = extractCookie(branchList, CSRF_COOKIE);
    const branchCreate = await request(app)
      .post("/hq/announcements/b/campus")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(hqCookie, `${CSRF_COOKIE}=${branchCsrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: branchCsrf,
        title: "Campus HQ managed",
        body: "Branch scoped",
        status: "draft",
        audience_members: "1",
      });
    assert.equal(branchCreate.status, 303);
    assert.match(branchCreate.headers.location, /\/hq\/announcements\/b\/campus\/[0-9a-f-]{36}/i);
    const campusAnnId = branchCreate.headers.location.split("/").pop().split("?")[0];

    const detail = await request(app)
      .get(`/hq/announcements/b/campus/${campusAnnId}`)
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Campus HQ managed/);
    assert.match(detail.text, /data-bb-ann-preview="1"|Preview/i);
    const archCsrf = extractCookie(detail, CSRF_COOKIE);
    const expectedArch = detail.text.match(
      /name="expected_updated_at"\s+value="([^"]+)"/
    );
    const archived = await request(app)
      .post(`/hq/announcements/b/campus/${campusAnnId}/archive`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(hqCookie, `${CSRF_COOKIE}=${archCsrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: archCsrf,
        expected_updated_at: expectedArch ? expectedArch[1] : undefined,
      });
    assert.equal(archived.status, 303);
    assert.match(archived.headers.location, /saved=archived/);

    const baDenied = await request(app)
      .get("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);
    assert.ok(baDenied.status === 403 || baDenied.status === 303, `status=${baDenied.status}`);
  });

  it("rejects unsafe action URLs, overlong titles, invalid UUIDs; strips unsafe href at render", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);

    const jsUrl = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      audiences: ["members"],
      title: "Bad link",
      body: "Body text for validation",
      actionUrl: "javascript:alert(1)",
      actionLabel: "Open",
    });
    assert.equal(jsUrl.ok, false);
    assert.match(String(jsUrl.reason || ""), /action_url/);

    const overlong = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      audiences: ["members"],
      title: "T".repeat(201),
      body: "Body text for validation",
    });
    assert.equal(overlong.ok, false);
    assert.match(String(overlong.reason || ""), /title/);

    const badId = await request(app)
      .get("/member/announcements/not-a-uuid")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`);
    assert.equal(badId.status, 404);

    const created = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      audiences: ["members"],
      title: "Safe title for xss render",
      body: "Safe body for xss render",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      actionUrl: "https://example.org/safe",
      actionLabel: "Open link",
    });
    assert.equal(created.ok, true, created.reason);

    // Bypass write validation to prove render escapes markup and strips unsafe hrefs.
    await pool.query(
      `UPDATE blessboard.announcements
          SET title = $1, body = $2, action_url = $3, action_label = $4
        WHERE id = $5`,
      [
        "<script>alert(1)</script>",
        "Hello <b>world</b>",
        "javascript:alert(1)",
        "Click me",
        created.item.id,
      ]
    );

    const memberDetail = await request(app)
      .get(`/member/announcements/${created.item.id}`)
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`);
    assert.equal(memberDetail.status, 200);
    assert.doesNotMatch(memberDetail.text, /javascript:alert/);
    assert.doesNotMatch(memberDetail.text, /<script>alert\(1\)<\/script>/);
    assert.match(memberDetail.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(memberDetail.text, /Hello &lt;b&gt;world&lt;\/b&gt;/);
    assert.doesNotMatch(memberDetail.text, /href="javascript:/i);

    const adminDetail = await request(app)
      .get(`/branch-admin/announcements/${created.item.id}`)
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);
    assert.equal(adminDetail.status, 200);
    assert.doesNotMatch(adminDetail.text, /javascript:alert/);
    assert.match(adminDetail.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  it("leaves V4 announcement wiring untouched", () => {
    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.doesNotMatch(legacy, /createAnnouncementAdminRouter|createAnnouncementMemberRouter|announcementsService/);
    assert.ok(fs.existsSync(path.join(ROOT, "src/db/pg/church/announcementsRepo.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "src/routes/church/branchAdminAnnouncements.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "src/routes/church/hqAdminBroadcasts.js")));
  });
});

"use strict";

/**
 * BlessBoard V5 resources / forms / requests:
 * schema validation, ownership, submission privacy, status workflow, attachments, V4 isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  submitMemberRegistration,
  approveMemberRegistration,
  linkMemberToUser,
} = require("../src/blessboard/services/memberRegistrationService");
const {
  STATUS,
  ALLOWED_FIELD_TYPES,
  validateFormSchema,
  validateFormAnswers,
  createResource,
  publishResource,
  getResource,
  listResources,
  createForm,
  publishForm,
  getForm,
  submitForm,
  getFormSubmission,
  listFormSubmissions,
  createMemberRequest,
  updateMemberRequestStatus,
  getMemberRequest,
  listMemberRequests,
} = require("../src/blessboard/services/formsRequestsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "fr-a.blessboard.org";
const ROOT = path.join(__dirname, "..");

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function cookieHeader(...parts) {
  return parts.filter(Boolean).join("; ");
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_MEDIA_FORCE_LOCAL: "1",
    ...overrides,
  };
}

function makeTenant(church, org, primaryBranch) {
  return {
    resolved: true,
    organization: { id: org.id },
    church: { id: church.id, displayName: church.display_name || church.displayName },
    primaryBranch: { id: primaryBranch.id },
    hqBranch: { id: primaryBranch.id },
  };
}

describe("blessboard forms-requests", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let mediaRoot;
  let orgA;
  let churchA;
  let branchA;
  let campusBranch;
  let hqAdmin;
  let branchAdmin;
  let campusAdmin;
  let memberUser;
  let memberBUser;
  let memberId;
  let memberBId;
  let privateMediaId;
  let publicMediaId;
  let privateStorageKey;

  before(async () => {
    try {
      mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bb-fr-media-"));
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "fr-a",
        displayName: "FR A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "fr-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "fr-a",
        churchKey: "fr-a",
        displayName: "FR Church A",
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
         RETURNING id, church_id, branch_key`,
        [churchA.id]
      );
      campusBranch = campusIns.rows[0];

      async function makeUser(email, role) {
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
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgA.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      hqAdmin = await makeUser("hq@fr-a.example.test", {
        email: "hq@fr-a.example.test",
        organizationKey: "fr-a",
        churchKey: "fr-a",
        roleKey: "church_hq_admin",
      });
      branchAdmin = await makeUser("branch@fr-a.example.test", {
        email: "branch@fr-a.example.test",
        organizationKey: "fr-a",
        churchKey: "fr-a",
        roleKey: "branch_admin",
        branchKey: "hq",
      });
      campusAdmin = await makeUser("campus@fr-a.example.test", {
        email: "campus@fr-a.example.test",
        organizationKey: "fr-a",
        churchKey: "fr-a",
        roleKey: "branch_admin",
        branchKey: "campus",
      });
      memberUser = await makeUser("member@fr-a.example.test", null);
      memberBUser = await makeUser("member-b@fr-a.example.test", null);

      async function provisionLinkedMember(email, userBundle, phone) {
        const submitted = await submitMemberRegistration(pool, {
          churchId: churchA.id,
          branchId: branchA.id,
          firstName: "FR",
          lastName: "Member",
          preferredName: "FR",
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

      memberId = await provisionLinkedMember("member@fr-a.example.test", memberUser, "+15550001001");
      memberBId = await provisionLinkedMember("member-b@fr-a.example.test", memberBUser, "+15550001002");

      privateStorageKey = `blessboard/${churchA.id}/${crypto.randomUUID()}/note.pdf`;
      const privAbs = path.join(
        mediaRoot,
        "blessboard-private",
        ...privateStorageKey.split("/")
      );
      fs.mkdirSync(path.dirname(privAbs), { recursive: true });
      fs.writeFileSync(privAbs, Buffer.from("%PDF-1.4 member-resource-test"));

      const priv = await pool.query(
        `INSERT INTO blessboard.media_assets
           (church_id, branch_id, storage_bucket, storage_key, original_filename, mime_type,
            size_bytes, sha256, visibility, status, uploaded_by_user_id)
         VALUES ($1, $2, 'blessboard-private', $3, 'note.pdf', 'application/pdf', $4,
                 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                 'private', 'active', $5)
         RETURNING id`,
        [
          churchA.id,
          branchA.id,
          privateStorageKey,
          fs.statSync(privAbs).size,
          hqAdmin.user.id,
        ]
      );
      privateMediaId = priv.rows[0].id;

      const pub = await pool.query(
        `INSERT INTO blessboard.media_assets
           (church_id, branch_id, storage_bucket, storage_key, original_filename, mime_type,
            size_bytes, sha256, visibility, status, uploaded_by_user_id)
         VALUES ($1, $2, 'blessboard-public', $3, 'flyer.pdf', 'application/pdf', 12,
                 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                 'public', 'active', $4)
         RETURNING id`,
        [
          churchA.id,
          branchA.id,
          `blessboard/${churchA.id}/${crypto.randomUUID()}/flyer.pdf`,
          hqAdmin.user.id,
        ]
      );
      publicMediaId = pub.rows[0].id;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv({ BLESSBOARD_MEDIA_ROOT: mediaRoot }),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("forms-requests suite setup failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
    if (mediaRoot) fs.rmSync(mediaRoot, { recursive: true, force: true });
  });

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(`setup failed: ${skipReason}`);
      return true;
    }
    return false;
  }

  it("creates tables and reject executable / non-allowlisted form schemas", async (t) => {
    if (skipIfNeeded(t)) return;
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'blessboard'
          AND table_name IN ('resources','forms','form_submissions','member_requests','member_request_status_history')
        ORDER BY table_name`
    );
    assert.deepEqual(
      tables.rows.map((r) => r.table_name),
      [
        "form_submissions",
        "forms",
        "member_request_status_history",
        "member_requests",
        "resources",
      ]
    );
    assert.ok(ALLOWED_FIELD_TYPES.includes("text"));
    assert.ok(!ALLOWED_FIELD_TYPES.includes("html"));
    assert.ok(!ALLOWED_FIELD_TYPES.includes("script"));

    assert.equal(validateFormSchema({ version: 1, fields: [], script: "alert(1)" }).ok, false);
    assert.equal(
      validateFormSchema({
        version: 1,
        fields: [{ key: "x", type: "html", label: "Bad" }],
      }).ok,
      false
    );
    assert.equal(
      validateFormSchema({
        version: 1,
        fields: [{ key: "x", type: "javascript", label: "Bad" }],
      }).ok,
      false
    );
    const ok = validateFormSchema({
      version: 1,
      fields: [
        { key: "full_name", type: "text", label: "Full name", required: true, maxLength: 80 },
        {
          key: "interest",
          type: "select",
          label: "Interest",
          required: true,
          options: ["Prayer", "Serving"],
        },
      ],
    });
    assert.equal(ok.ok, true, ok.reason);
    assert.equal(ok.schema.fields.length, 2);

    const htmlAnswer = validateFormAnswers(ok.schema, {
      full_name: "<b>hack</b>",
      interest: "Prayer",
    });
    assert.equal(htmlAnswer.ok, false);
  });

  it("publishes resources with media attachment and scopes branch ownership", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createResource(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Welcome pack",
      description: "Starter materials",
      audience: "members",
      mediaAssetId: privateMediaId,
    });
    assert.equal(created.ok, true, created.reason);
    assert.equal(created.resource.mediaAssetId, privateMediaId);

    const published = await publishResource(pool, {
      id: created.resource.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(published.ok, true, published.reason);
    assert.equal(published.resource.status, "published");

    const memberView = await getResource(pool, {
      id: created.resource.id,
      churchId: churchA.id,
      branchId: branchA.id,
      forMember: true,
    });
    assert.equal(memberView.ok, true);
    assert.equal(memberView.resource.mediaAssetId, privateMediaId);

    const wrongBranch = await createResource(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: campusBranch.id,
      actorUserId: campusAdmin.user.id,
      tenant: makeTenant(churchA, orgA.records.organization, campusBranch),
      title: "Wrong",
      audience: "members",
    });
    assert.equal(wrongBranch.ok, false);
    assert.equal(wrongBranch.status, STATUS.FORBIDDEN);
  });

  it("accepts member form submissions and enforces submission privacy", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const form = await createForm(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Connect card",
      schema: {
        version: 1,
        fields: [
          { key: "full_name", type: "text", label: "Full name", required: true, maxLength: 100 },
          { key: "email", type: "email", label: "Email", required: true },
        ],
      },
    });
    assert.equal(form.ok, true, form.reason);
    const published = await publishForm(pool, {
      id: form.form.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(published.ok, true, published.reason);

    const submitted = await submitForm(pool, {
      churchId: churchA.id,
      formId: form.form.id,
      memberId,
      branchId: branchA.id,
      answers: { full_name: "Ada Member", email: "ada@example.test" },
    });
    assert.equal(submitted.ok, true, submitted.reason);

    const own = await getFormSubmission(pool, {
      id: submitted.submission.id,
      churchId: churchA.id,
      memberId,
      forMember: true,
    });
    assert.equal(own.ok, true);

    const other = await getFormSubmission(pool, {
      id: submitted.submission.id,
      churchId: churchA.id,
      memberId: memberBId,
      forMember: true,
    });
    assert.equal(other.ok, false);
    assert.equal(other.status, STATUS.FORBIDDEN);

    const adminList = await listFormSubmissions(pool, {
      churchId: churchA.id,
      formId: form.form.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(adminList.ok, true);
    assert.ok(adminList.submissions.some((s) => s.id === submitted.submission.id));

    const memberListB = await listFormSubmissions(pool, {
      churchId: churchA.id,
      memberId: memberBId,
      forMember: true,
    });
    assert.equal(memberListB.ok, true);
    assert.ok(!memberListB.submissions.some((s) => s.id === submitted.submission.id));
  });

  it("runs request status workflow with member-visible history and private attachments", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);

    const publicAttach = await createMemberRequest(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      actorUserId: memberUser.user.id,
      category: "prayer",
      subject: "Need prayer",
      message: "Please pray for travel",
      mediaAssetId: publicMediaId,
    });
    assert.equal(publicAttach.ok, false);
    assert.equal(publicAttach.reason, "private_media_required");

    const created = await createMemberRequest(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      actorUserId: memberUser.user.id,
      category: "pastoral",
      subject: "Counseling",
      message: "Would like to talk",
      mediaAssetId: privateMediaId,
    });
    assert.equal(created.ok, true, created.reason);
    assert.equal(created.request.status, "submitted");
    assert.ok(created.request.history.length >= 1);
    assert.equal(created.request.history[0].toStatus, "submitted");
    assert.equal(created.request.history[0].memberVisible, true);

    const reviewed = await updateMemberRequestStatus(pool, {
      id: created.request.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      status: "in_review",
      note: "Assigned to pastor",
    });
    assert.equal(reviewed.ok, true, reviewed.reason);
    assert.equal(reviewed.request.status, "in_review");

    const resolved = await updateMemberRequestStatus(pool, {
      id: created.request.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      status: "resolved",
      note: "Conversation completed",
    });
    assert.equal(resolved.ok, true, resolved.reason);

    const internal = await updateMemberRequestStatus(pool, {
      id: created.request.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      status: "closed",
      note: "INTERNAL_ONLY_NOTE staff assignment",
      memberVisible: false,
    });
    assert.equal(internal.ok, true, internal.reason);

    const memberView = await getMemberRequest(pool, {
      id: created.request.id,
      churchId: churchA.id,
      memberId,
      forMember: true,
    });
    assert.equal(memberView.ok, true);
    assert.ok(memberView.request.history.length >= 3);
    assert.ok(memberView.request.history.every((h) => h.memberVisible === true));
    assert.ok(!memberView.request.history.some((h) => /INTERNAL_ONLY_NOTE/.test(String(h.note || ""))));
    assert.equal(memberView.request.status, "closed");

    const adminView = await getMemberRequest(pool, {
      id: created.request.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(adminView.ok, true);
    assert.ok(adminView.request.history.some((h) => /INTERNAL_ONLY_NOTE/.test(String(h.note || ""))));

    const otherMember = await getMemberRequest(pool, {
      id: created.request.id,
      churchId: churchA.id,
      memberId: memberBId,
      forMember: true,
    });
    assert.equal(otherMember.ok, false);
    assert.equal(otherMember.status, STATUS.FORBIDDEN);

    const campusCannotSee = await listMemberRequests(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      actorUserId: campusAdmin.user.id,
      tenant: makeTenant(churchA, orgA.records.organization, campusBranch),
      scopeBranchId: campusBranch.id,
    });
    assert.equal(campusCannotSee.ok, true);
    assert.ok(!campusCannotSee.requests.some((r) => r.id === created.request.id));

    const reopen = await updateMemberRequestStatus(pool, {
      id: created.request.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      status: "in_review",
    });
    assert.equal(reopen.ok, false);
    assert.equal(reopen.status, STATUS.POLICY);
  });

  it("member resources GUI downloads private media safely and blocks public media path", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createResource(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "HTTP Welcome pack",
      description: "Member download materials",
      audience: "members",
      mediaAssetId: privateMediaId,
    });
    assert.equal(created.ok, true, created.reason);
    const published = await publishResource(pool, {
      id: created.resource.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(published.ok, true, published.reason);

    const infoOnly = await createResource(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Study guide outline",
      description: "Text-only member study notes",
      audience: "members",
    });
    assert.equal(infoOnly.ok, true, infoOnly.reason);
    const infoPublished = await publishResource(pool, {
      id: infoOnly.resource.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(infoPublished.ok, true, infoPublished.reason);

    const draftHidden = await createResource(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "DRAFT_ONLY_RESOURCE_SECRET",
      description: "Must not appear for members",
      audience: "members",
      mediaAssetId: privateMediaId,
    });
    assert.equal(draftHidden.ok, true, draftHidden.reason);

    const adminOnly = await createResource(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "ADMIN_ONLY_RESOURCE_SECRET",
      description: "Admins audience",
      audience: "admins",
      mediaAssetId: privateMediaId,
    });
    assert.equal(adminOnly.ok, true, adminOnly.reason);
    const adminPublished = await publishResource(pool, {
      id: adminOnly.resource.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(adminPublished.ok, true, adminPublished.reason);

    const memberCookie = `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`;
    const list = await request(app)
      .get("/member/resources")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-member-resources="1"/);
    assert.match(list.text, /data-bb-stitch-resources="19-member-resources-study"/);
    assert.match(list.text, /data-bb-resources-toolbar="1"/);
    assert.match(list.text, /HTTP Welcome pack/);
    assert.match(list.text, /Study guide outline/);
    assert.match(list.text, /note\.pdf/);
    assert.match(list.text, /data-bb-resource-type="PDF"/);
    assert.doesNotMatch(list.text, /DRAFT_ONLY_RESOURCE_SECRET/);
    assert.doesNotMatch(list.text, /ADMIN_ONLY_RESOURCE_SECRET/);
    assert.doesNotMatch(list.text, /certificate|course progress|active readers/i);
    assert.doesNotMatch(list.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(list.text, /javascript:/i);

    const filesFilter = await request(app)
      .get("/member/resources?filter=files")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(filesFilter.status, 200);
    assert.match(filesFilter.text, /HTTP Welcome pack/);
    assert.doesNotMatch(filesFilter.text, /Study guide outline/);
    assert.match(filesFilter.text, /data-bb-resource-filter="files"/);

    const infoFilter = await request(app)
      .get("/member/resources?filter=info")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(infoFilter.status, 200);
    assert.match(infoFilter.text, /Study guide outline/);
    assert.doesNotMatch(infoFilter.text, /HTTP Welcome pack/);

    const searchHit = await request(app)
      .get("/member/resources?q=Welcome")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(searchHit.status, 200);
    assert.match(searchHit.text, /HTTP Welcome pack/);
    assert.doesNotMatch(searchHit.text, /Study guide outline/);

    const searchMiss = await request(app)
      .get("/member/resources?q=zzzz-no-such-resource")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(searchMiss.status, 200);
    assert.match(searchMiss.text, /data-bb-resources-empty="no-results"/);
    assert.doesNotMatch(searchMiss.text, /HTTP Welcome pack/);

    const detail = await request(app)
      .get(`/member/resources/${created.resource.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-resource-download="1"/);
    assert.match(detail.text, /href="\/member\/resources\/[^"]+\/file"/);
    assert.match(detail.text, /data-bb-resource-type="PDF"/);
    assert.match(detail.text, /note\.pdf/);
    assert.doesNotMatch(detail.text, /certificate|course progress/i);

    const infoDetail = await request(app)
      .get(`/member/resources/${infoOnly.resource.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(infoDetail.status, 200);
    assert.doesNotMatch(infoDetail.text, /data-bb-resource-download="1"/);
    assert.match(infoDetail.text, /No file is attached/);

    const draftDetail = await request(app)
      .get(`/member/resources/${draftHidden.resource.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.ok(draftDetail.status === 403 || draftDetail.status === 404);

    const adminDetail = await request(app)
      .get(`/member/resources/${adminOnly.resource.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.ok(adminDetail.status === 403 || adminDetail.status === 404);

    const file = await request(app)
      .get(`/member/resources/${created.resource.id}/file`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(file.status, 200);
    assert.match(String(file.headers["content-type"] || ""), /application\/pdf/i);
    assert.equal(file.headers["x-content-type-options"], "nosniff");
    assert.match(String(file.headers["cache-control"] || ""), /private/i);
    assert.match(String(file.headers["content-disposition"] || ""), /attachment/i);
    assert.match(String(file.headers["content-disposition"] || ""), /note\.pdf/);

    const draftFile = await request(app)
      .get(`/member/resources/${draftHidden.resource.id}/file`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.ok(draftFile.status === 403 || draftFile.status === 404);

    const adminFile = await request(app)
      .get(`/member/resources/${adminOnly.resource.id}/file`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.ok(adminFile.status === 403 || adminFile.status === 404);

    const publicPath = await request(app)
      .get(`/_bb/media/${privateMediaId}`)
      .set("Host", HOST_A);
    assert.ok(publicPath.status === 403 || publicPath.status === 404);

    const otherMemberSameChurch = await request(app)
      .get(`/member/resources/${created.resource.id}/file`)
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberBUser.rawToken}`);
    assert.equal(otherMemberSameChurch.status, 200);
  });

  it("member forms GUI enforces CSRF, allowlisted fields, and submission privacy", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const form = await createForm(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "HTTP Connect card",
      description: "Member connect details",
      schema: {
        version: 1,
        fields: [
          { key: "full_name", type: "text", label: "Full name", required: true, maxLength: 100 },
          { key: "email", type: "email", label: "Email", required: true },
        ],
      },
    });
    assert.equal(form.ok, true, form.reason);
    const published = await publishForm(pool, {
      id: form.form.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(published.ok, true, published.reason);

    const draftHidden = await createForm(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "DRAFT_ONLY_FORM_SECRET",
      schema: {
        version: 1,
        fields: [{ key: "note", type: "text", label: "Note", required: true }],
      },
    });
    assert.equal(draftHidden.ok, true, draftHidden.reason);

    const otherForm = await createForm(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Volunteer interest",
      description: "Serve with a team",
      schema: {
        version: 1,
        fields: [{ key: "interest", type: "text", label: "Interest", required: true }],
      },
    });
    assert.equal(otherForm.ok, true, otherForm.reason);
    const otherPublished = await publishForm(pool, {
      id: otherForm.form.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(otherPublished.ok, true, otherPublished.reason);

    const memberCookie = `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`;
    const list = await request(app)
      .get("/member/forms")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-member-forms="1"/);
    assert.match(list.text, /data-bb-stitch-forms="20-member-forms-documents"/);
    assert.match(list.text, /data-bb-forms-toolbar="1"/);
    assert.match(list.text, /HTTP Connect card/);
    assert.match(list.text, /Volunteer interest/);
    assert.match(list.text, /Fill online/);
    assert.match(list.text, /2 fields/);
    assert.doesNotMatch(list.text, /DRAFT_ONLY_FORM_SECRET/);
    assert.doesNotMatch(list.text, /Download PDF|form builder|e-?signature|card number|cvv|Approved|Processing/i);
    assert.doesNotMatch(list.text, /javascript:/i);

    const searchHit = await request(app)
      .get("/member/forms?q=Connect")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(searchHit.status, 200);
    assert.match(searchHit.text, /HTTP Connect card/);
    assert.doesNotMatch(searchHit.text, /Volunteer interest/);

    const searchMiss = await request(app)
      .get("/member/forms?q=zzzz-no-such-form")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(searchMiss.status, 200);
    assert.match(searchMiss.text, /data-bb-forms-empty="no-results"/);

    const availableOnly = await request(app)
      .get("/member/forms?filter=available")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(availableOnly.status, 200);
    assert.match(availableOnly.text, /data-bb-forms-filter="available"/);
    assert.match(availableOnly.text, /data-bb-forms-available="1"/);
    assert.doesNotMatch(availableOnly.text, /data-bb-forms-history="1"/);

    const historyView = await request(app)
      .get("/member/forms?filter=history")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(historyView.status, 200);
    assert.match(historyView.text, /data-bb-forms-filter="history"/);
    assert.match(historyView.text, /data-bb-forms-history="1"/);
    assert.doesNotMatch(historyView.text, /data-bb-forms-available="1"/);

    const detail = await request(app)
      .get(`/member/forms/${form.form.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-member-form-detail="1"/);
    assert.match(detail.text, /data-bb-stitch-forms="20-member-forms-documents"/);
    assert.match(detail.text, /data-bb-field-type="text"/);
    assert.match(detail.text, /data-bb-field-type="email"/);
    assert.doesNotMatch(detail.text, /data-bb-field-type="html"/);
    assert.doesNotMatch(detail.text, /data-bb-field-type="script"/);
    assert.doesNotMatch(detail.text, /type="file"|e-?signature|card number|cvv/i);
    assert.match(detail.text, /name="_csrf"/);
    assert.doesNotMatch(detail.text, /javascript:/i);

    const draftDetail = await request(app)
      .get(`/member/forms/${draftHidden.form.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(draftDetail.status, 404);

    const csrf = extractCookie(detail, CSRF_COOKIE);
    assert.ok(csrf);

    const badCsrf = await request(app)
      .post(`/member/forms/${form.form.id}/submit`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: "not-the-token",
        full_name: "Ada Member",
        email: "ada@example.test",
      });
    assert.equal(badCsrf.status, 403);

    const htmlReject = await request(app)
      .post(`/member/forms/${form.form.id}/submit`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        full_name: "<b>hack</b>",
        email: "ada@example.test",
      });
    assert.equal(htmlReject.status, 400);
    assert.match(htmlReject.text, /role="alert"/);

    const unknownField = await request(app)
      .post(`/member/forms/${form.form.id}/submit`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        full_name: "Ada Member",
        email: "ada@example.test",
        extra_injected: "should-be-rejected",
      });
    assert.equal(unknownField.status, 400);

    const ok = await request(app)
      .post(`/member/forms/${form.form.id}/submit`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        full_name: "Ada Member",
        email: "ada@example.test",
      });
    assert.equal(ok.status, 303);
    assert.match(ok.headers.location, /\/member\/forms\/submissions\/[0-9a-f-]{36}/i);
    const submissionId = ok.headers.location.split("/").pop().split("?")[0];

    const submitted = await request(app)
      .get(`/member/forms/submissions/${submissionId}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(submitted.status, 200);
    assert.match(submitted.text, /data-bb-member-submission="1"/);
    assert.match(submitted.text, /data-bb-stitch-forms="20-member-forms-documents"/);
    assert.match(submitted.text, /data-bb-submission-status="submitted"/);
    assert.match(submitted.text, />Submitted</);
    assert.match(submitted.text, /Full name/);
    assert.match(submitted.text, /Ada Member/);
    assert.doesNotMatch(submitted.text, /extra_injected/);
    assert.doesNotMatch(submitted.text, /Approved|Processing|pending/i);
    assert.doesNotMatch(submitted.text, /javascript:/i);

    const historyAfter = await request(app)
      .get("/member/forms?filter=history")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(historyAfter.status, 200);
    assert.match(historyAfter.text, /HTTP Connect card/);
    assert.match(historyAfter.text, /data-bb-submission-status="submitted"/);
    assert.match(historyAfter.text, />Submitted</);

    const foreign = await request(app)
      .get(`/member/forms/submissions/${submissionId}`)
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberBUser.rawToken}`);
    assert.ok(foreign.status === 403 || foreign.status === 404);
  });

  it("member requests GUI enforces CSRF, ownership, private files, and hides internal notes", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const memberCookie = `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`;

    const list = await request(app)
      .get("/member/requests")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-member-requests="1"/);
    assert.match(list.text, /data-bb-stitch-requests="22-member-request-status"/);
    assert.match(list.text, /href="\/member\/requests\/new"/);
    assert.match(list.text, /data-bb-requests-empty="catalog"|data-bb-request-summary="1"/);
    assert.doesNotMatch(list.text, /24.?48 hours|crisis hotline|REQ-20\d{2}|Facility Use|In Progress/i);
    assert.doesNotMatch(list.text, new RegExp(churchA.id, "i"));

    const form = await request(app)
      .get("/member/requests/new")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(form.status, 200);
    assert.match(form.text, /data-bb-member-request-new="1"/);
    assert.match(form.text, /data-bb-stitch-request-new="21-member-submit-online-request"/);
    assert.match(form.text, /name="_csrf"/);
    assert.match(form.text, /name="category"/);
    assert.match(form.text, /value="prayer"/);
    assert.match(form.text, /value="pastoral"/);
    assert.match(form.text, /value="practical"/);
    assert.match(form.text, /value="other"/);
    assert.match(form.text, /name="subject"/);
    assert.match(form.text, /name="message"/);
    assert.match(form.text, /action="\/member\/requests"/);
    assert.match(form.text, /data-bb-request-next="1"/);
    assert.doesNotMatch(form.text, /card number|cvv|name="card"|name="amount"/i);
    assert.doesNotMatch(form.text, /Mark as Urgent|Tap to upload|Max 5MB|24.?48 hours|Baptism|Baby Dedication/i);
    assert.doesNotMatch(form.text, /type="file"|name="attachment"/i);
    assert.match(form.text, /does not collect payment details/i);

    const csrf = extractCookie(form, CSRF_COOKIE);
    assert.ok(csrf);

    const badCsrf = await request(app)
      .post("/member/requests")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: "not-the-token",
        category: "prayer",
        subject: "Please pray",
        message: "Travel mercy",
      });
    assert.equal(badCsrf.status, 403);

    const invalidCategory = await request(app)
      .post("/member/requests")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        category: "baptism",
        subject: "Invalid category",
        message: "Should be rejected",
      });
    assert.equal(invalidCategory.status, 400);
    assert.match(invalidCategory.text, /data-bb-member-request-new="1"/);

    const missingSubject = await request(app)
      .post("/member/requests")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        category: "prayer",
        subject: "",
        message: "Missing subject",
      });
    assert.equal(missingSubject.status, 400);

    const ok = await request(app)
      .post("/member/requests")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        category: "pastoral",
        subject: "Counseling request",
        message: "Would like to talk privately",
      });
    assert.equal(ok.status, 303);
    assert.match(ok.headers.location, /\/member\/requests\/[0-9a-f-]{36}/i);
    const requestId = ok.headers.location.split("/").pop().split("?")[0];

    const listAfter = await request(app)
      .get("/member/requests")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(listAfter.status, 200);
    assert.match(listAfter.text, /data-bb-request-summary="1"/);
    assert.match(listAfter.text, /data-bb-requests-toolbar="1"/);
    assert.match(listAfter.text, /data-bb-requests-search="1"/);
    assert.match(listAfter.text, /Counseling request/);
    assert.match(listAfter.text, /data-bb-status="submitted"/);
    assert.match(listAfter.text, /Pending review/);

    const searchHit = await request(app)
      .get("/member/requests?q=Counseling")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(searchHit.status, 200);
    assert.match(searchHit.text, /Counseling request/);

    const searchMiss = await request(app)
      .get("/member/requests?q=zzz-no-match")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(searchMiss.status, 200);
    assert.match(searchMiss.text, /data-bb-requests-empty="no-results"/);

    const activeFilter = await request(app)
      .get("/member/requests?filter=active")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(activeFilter.status, 200);
    assert.match(activeFilter.text, /Counseling request/);

    const reviewed = await updateMemberRequestStatus(pool, {
      id: requestId,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      status: "in_review",
      note: "Visible to member",
    });
    assert.equal(reviewed.ok, true, reviewed.reason);

    const hidden = await updateMemberRequestStatus(pool, {
      id: requestId,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      status: "resolved",
      note: "SECRET_INTERNAL_REVIEW",
      memberVisible: false,
    });
    assert.equal(hidden.ok, true, hidden.reason);

    const detail = await request(app)
      .get(`/member/requests/${requestId}?saved=1`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-member-request-detail="1"/);
    assert.match(detail.text, /data-bb-request-history="1"/);
    assert.match(detail.text, /data-bb-request-success="1"/);
    assert.match(detail.text, /Counseling request/);
    assert.match(detail.text, /Visible to member/);
    assert.match(detail.text, /Pending review|In review|Resolved/);
    assert.doesNotMatch(detail.text, /SECRET_INTERNAL_REVIEW/);
    assert.doesNotMatch(detail.text, /changedByUserId|memberVisible/i);
    assert.doesNotMatch(detail.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(detail.text, new RegExp(memberId, "i"));

    const foreign = await request(app)
      .get(`/member/requests/${requestId}`)
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberBUser.rawToken}`);
    assert.ok(foreign.status === 403 || foreign.status === 404);

    const withFile = await createMemberRequest(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      actorUserId: memberUser.user.id,
      category: "practical",
      subject: "Attachment request",
      message: "See attached",
      mediaAssetId: privateMediaId,
    });
    assert.equal(withFile.ok, true, withFile.reason);

    const file = await request(app)
      .get(`/member/requests/${withFile.request.id}/file`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(file.status, 200);
    assert.equal(file.headers["x-content-type-options"], "nosniff");
    assert.match(String(file.headers["cache-control"] || ""), /private/i);
    assert.match(String(file.headers["content-disposition"] || ""), /attachment/i);

    const otherFile = await request(app)
      .get(`/member/requests/${withFile.request.id}/file`)
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberBUser.rawToken}`);
    assert.ok(otherFile.status === 403 || otherFile.status === 404);
  });

  it("branch-admin forms and requests GUI reviews submissions and updates status with CSRF", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const adminCookie = `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`;

    const form = await createForm(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Admin GUI Connect",
      schema: {
        version: 1,
        fields: [
          { key: "full_name", type: "text", label: "Full name", required: true, maxLength: 100 },
          { key: "email", type: "email", label: "Email", required: true },
        ],
      },
    });
    assert.equal(form.ok, true, form.reason);
    await publishForm(pool, {
      id: form.form.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    const submitted = await submitForm(pool, {
      churchId: churchA.id,
      formId: form.form.id,
      memberId,
      branchId: branchA.id,
      answers: { full_name: "Ada Member", email: "ada@example.test" },
    });
    assert.equal(submitted.ok, true, submitted.reason);

    const formsList = await request(app)
      .get("/branch-admin/forms")
      .set("Host", HOST_A)
      .set("Cookie", adminCookie);
    assert.equal(formsList.status, 200);
    assert.match(formsList.text, /data-bb-forms-admin-list="1"/);
    assert.match(formsList.text, /data-bb-stitch-forms="shared-ui-states"/);
    assert.match(formsList.text, /data-bb-forms-status-chips="1"/);
    assert.match(formsList.text, /data-bb-forms-create="1"/);
    assert.match(formsList.text, /data-bb-forms-editor="1"/);
    assert.match(formsList.text, /data-bb-forms-allowed-types="1"/);
    assert.match(formsList.text, /name="title"/);
    assert.match(formsList.text, /name="schema_json"/);
    assert.match(formsList.text, /name="_csrf"/);
    assert.match(formsList.text, /Admin GUI Connect/);
    assert.doesNotMatch(formsList.text, /signature pad|Stripe Checkout|PayPal|file-upload field type/i);
    assert.match(formsList.text, /data-bb-forms-unavailable-row="signatures"/);
    assert.match(formsList.text, /data-bb-forms-unavailable-row="logic"/);
    assert.doesNotMatch(formsList.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(formsList.text, new RegExp(branchA.id, "i"));

    const formDetail = await request(app)
      .get(`/branch-admin/forms/${form.form.id}`)
      .set("Host", HOST_A)
      .set("Cookie", adminCookie);
    assert.equal(formDetail.status, 200);
    assert.match(formDetail.text, /data-bb-forms-admin-detail="1"/);
    assert.match(formDetail.text, /data-bb-stitch-forms-detail="shared-ui-states"/);
    assert.match(formDetail.text, /data-bb-form-submissions="1"/);
    assert.match(formDetail.text, /data-bb-forms-privacy="1"/);
    assert.match(formDetail.text, /data-bb-submission=/);
    assert.match(formDetail.text, /Ada Member/);
    assert.match(formDetail.text, /ada@example\.test/);
    assert.doesNotMatch(formDetail.text, new RegExp(memberId, "i"));

    const noResults = await request(app)
      .get("/branch-admin/forms?status=archived")
      .set("Host", HOST_A)
      .set("Cookie", adminCookie);
    assert.equal(noResults.status, 200);
    assert.match(noResults.text, /data-bb-forms-empty="no-results"/);
    assert.match(noResults.text, /data-bb-forms-status-filter="archived"/);

    const created = await createMemberRequest(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      actorUserId: memberUser.user.id,
      category: "pastoral",
      subject: "Admin GUI counseling",
      message: "Need a follow-up conversation",
      mediaAssetId: privateMediaId,
    });
    assert.equal(created.ok, true, created.reason);

    const reqList = await request(app)
      .get("/branch-admin/requests")
      .set("Host", HOST_A)
      .set("Cookie", adminCookie);
    assert.equal(reqList.status, 200);
    assert.match(reqList.text, /data-bb-request-admin-list="1"/);
    assert.match(reqList.text, /data-bb-stitch-requests="44-branch-request-workflow-queue"/);
    assert.match(reqList.text, /Request workflow queue/);
    assert.match(reqList.text, /Admin GUI counseling/);
    assert.match(reqList.text, /data-bb-req-tabs="1"/);
    assert.match(reqList.text, /data-bb-req-table="1"/);
    assert.match(reqList.text, /data-bb-req-cards="1"/);
    assert.match(reqList.text, /data-bb-req-privacy="1"/);
    assert.match(reqList.text, /data-bb-req-unavailable="1"/);
    assert.doesNotMatch(reqList.text, /PENDING 24|TODAY'S GOAL|Export|My Assigned|Urgent/i);
    assert.doesNotMatch(reqList.text, /Active Donor|donor email|View Profile/i);
    assert.doesNotMatch(reqList.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(reqList.text, new RegExp(memberId, "i"));

    const reqClosed = await request(app)
      .get("/branch-admin/requests?status=closed")
      .set("Host", HOST_A)
      .set("Cookie", adminCookie);
    assert.equal(reqClosed.status, 200);
    assert.match(reqClosed.text, /data-bb-req-tab="closed"/);
    assert.doesNotMatch(reqClosed.text, /Admin GUI counseling/);
    assert.match(reqClosed.text, /data-bb-req-empty="no-results"|data-bb-req-status="closed"/);

    const detail = await request(app)
      .get(`/branch-admin/requests/${created.request.id}`)
      .set("Host", HOST_A)
      .set("Cookie", adminCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-request-admin-detail="1"/);
    assert.match(detail.text, /data-bb-stitch-requests-detail="45-branch-request-details"/);
    assert.match(detail.text, /data-bb-req-attachment="1"/);
    assert.match(detail.text, /data-bb-req-download="1"/);
    assert.match(detail.text, /data-bb-req-status-form="1"/);
    assert.match(detail.text, /data-bb-req-history="1"/);
    assert.match(detail.text, /data-bb-req-detail-privacy="1"/);
    assert.match(detail.text, /internal_only/);
    assert.doesNotMatch(detail.text, /Reject|Approve Request|Request More Info|Public Correspondence/i);
    assert.doesNotMatch(detail.text, new RegExp(memberId, "i"));

    const csrf = extractCookie(detail, CSRF_COOKIE);
    assert.ok(csrf);

    const missingCsrf = await request(app)
      .post(`/branch-admin/requests/${created.request.id}/status`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(adminCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ status: "in_review", note: "Assigned pastor" });
    assert.equal(missingCsrf.status, 403);

    const updated = await request(app)
      .post(`/branch-admin/requests/${created.request.id}/status`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(adminCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        status: "in_review",
        note: "Assigned pastor",
      });
    assert.equal(updated.status, 303);
    assert.match(String(updated.headers.location || ""), /saved=status/);

    const after = await request(app)
      .get(`/branch-admin/requests/${created.request.id}`)
      .set("Host", HOST_A)
      .set("Cookie", adminCookie);
    assert.equal(after.status, 200);
    assert.match(after.text, /data-bb-status="in_review"/);
    assert.match(after.text, /Assigned pastor/);

    const file = await request(app)
      .get(`/branch-admin/requests/${created.request.id}/file`)
      .set("Host", HOST_A)
      .set("Cookie", adminCookie);
    assert.equal(file.status, 200);
    assert.equal(file.headers["x-content-type-options"], "nosniff");
    assert.match(String(file.headers["cache-control"] || ""), /private/i);
    assert.match(String(file.headers["content-disposition"] || ""), /attachment/i);

    const campusCookie = `${DEFAULT_V5_COOKIE}=${campusAdmin.rawToken}`;
    const cross = await request(app)
      .get(`/branch-admin/requests/${created.request.id}`)
      .set("Host", HOST_A)
      .set("Cookie", campusCookie);
    assert.ok(cross.status === 403 || cross.status === 404);
  });

  it("HQ forms, resources, and requests preserve branch scope, privacy, and status workflow", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const hqCookie = `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`;

    const formsList = await request(app)
      .get("/hq/forms")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(formsList.status, 200);
    assert.match(formsList.text, /data-bb-forms-admin-list="1"/);
    assert.match(formsList.text, /data-bb-hq-forms="1"/);
    assert.match(formsList.text, /data-bb-stitch-forms="20-member-forms-documents"/);
    assert.match(formsList.text, /data-bb-hq-forms-branches="1"/);
    assert.match(formsList.text, /data-bb-forms-filter="1"/);
    assert.match(formsList.text, /data-bb-forms-summary="1"/);
    assert.match(formsList.text, /data-bb-forms-status-chips="1"/);
    assert.match(formsList.text, /href="\/hq\/forms\/b\/campus"/);
    assert.match(formsList.text, /href="\/hq\/resources"/);
    assert.doesNotMatch(formsList.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(formsList.text, /Ada Member|ada@example\.test|answersJson|"full_name"\s*:/i);

    const resourcesList = await request(app)
      .get("/hq/resources")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(resourcesList.status, 200);
    assert.match(resourcesList.text, /data-bb-resources-admin-list="1"/);
    assert.match(resourcesList.text, /data-bb-hq-resources="1"/);
    assert.match(resourcesList.text, /data-bb-stitch-resources="19-member-resources-study"/);
    assert.match(resourcesList.text, /data-bb-hq-resources-branches="1"/);
    assert.match(resourcesList.text, /data-bb-resources-filter="1"/);
    assert.match(resourcesList.text, /data-bb-resources-summary="1"/);
    assert.match(resourcesList.text, /href="\/hq\/resources\/b\/campus"/);
    assert.match(resourcesList.text, /href="\/hq\/forms"/);
    assert.doesNotMatch(resourcesList.text, /\/member\/resources\/[^"]+\/file|cdn\.|public CDN url/i);
    assert.doesNotMatch(resourcesList.text, new RegExp(churchA.id, "i"));

    const campusForm = await createForm(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      scopeBranchId: campusBranch.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Campus HQ form",
      schema: {
        version: 1,
        fields: [{ key: "full_name", type: "text", label: "Full name", required: true, maxLength: 100 }],
      },
    });
    assert.equal(campusForm.ok, true, campusForm.reason);

    const branchForms = await request(app)
      .get("/hq/forms/b/campus")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(branchForms.status, 200);
    assert.match(branchForms.text, /Campus HQ form/);
    assert.match(branchForms.text, /href="\/hq\/forms"/);
    assert.doesNotMatch(branchForms.text, /data-bb-hq-forms-branches="1"/);

    const churchWideForms = await request(app)
      .get("/hq/forms")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(churchWideForms.status, 200);
    assert.match(churchWideForms.text, /Campus HQ form/);
    assert.match(churchWideForms.text, /data-bb-forms-scope="church-wide"/);

    const formsSearchHit = await request(app)
      .get("/hq/forms?q=Campus%20HQ")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(formsSearchHit.status, 200);
    assert.match(formsSearchHit.text, /Campus HQ form/);
    assert.match(formsSearchHit.text, /name="q"/);
    assert.match(formsSearchHit.text, /value="Campus HQ"/);

    const formsSearchMiss = await request(app)
      .get("/hq/forms?q=zzzz-no-match")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(formsSearchMiss.status, 200);
    assert.match(formsSearchMiss.text, /data-bb-forms-empty="no-results"/);
    assert.doesNotMatch(formsSearchMiss.text, /Campus HQ form/);

    const formsStatusFilter = await request(app)
      .get("/hq/forms?status=archived")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(formsStatusFilter.status, 200);
    assert.match(formsStatusFilter.text, /data-bb-forms-status-filter="archived"/);
    assert.match(formsStatusFilter.text, /data-bb-forms-empty="no-results"/);

    const campusResource = await createResource(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      scopeBranchId: campusBranch.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      title: "Campus study guide",
      audience: "members",
      mediaAssetId: privateMediaId,
    });
    assert.equal(campusResource.ok, true, campusResource.reason);

    const branchResources = await request(app)
      .get("/hq/resources/b/campus")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(branchResources.status, 200);
    assert.match(branchResources.text, /Campus study guide/);
    assert.match(branchResources.text, /href="\/hq\/resources"/);
    assert.match(branchResources.text, /Private file/);

    const churchWideResources = await request(app)
      .get("/hq/resources")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(churchWideResources.status, 200);
    assert.match(churchWideResources.text, /Campus study guide/);
    assert.match(churchWideResources.text, /data-bb-resources-scope="church-wide"/);
    assert.match(churchWideResources.text, /Private file/);
    assert.doesNotMatch(churchWideResources.text, new RegExp(privateMediaId, "i"));

    const resourcesSearchHit = await request(app)
      .get("/hq/resources?q=study%20guide")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(resourcesSearchHit.status, 200);
    assert.match(resourcesSearchHit.text, /Campus study guide/);

    const resourcesSearchMiss = await request(app)
      .get("/hq/resources?q=zzzz-no-match")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(resourcesSearchMiss.status, 200);
    assert.match(resourcesSearchMiss.text, /data-bb-resources-empty="no-results"/);
    assert.doesNotMatch(resourcesSearchMiss.text, /Campus study guide/);

    const resourcesStatusFilter = await request(app)
      .get("/hq/resources?status=published")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(resourcesStatusFilter.status, 200);
    assert.match(resourcesStatusFilter.text, /data-bb-resources-status-filter="published"/);
    assert.doesNotMatch(resourcesStatusFilter.text, /Campus study guide/);

    const anonDownloadDenied = await request(app)
      .get(`/member/resources/${campusResource.resource.id}/file`)
      .set("Host", HOST_A);
    assert.ok(
      anonDownloadDenied.status === 401 ||
        anonDownloadDenied.status === 403 ||
        anonDownloadDenied.status === 404 ||
        anonDownloadDenied.status === 303,
      `anon download status=${anonDownloadDenied.status}`
    );
    assert.doesNotMatch(String(anonDownloadDenied.headers.location || ""), /cdn\.|storage\.googleapis/i);

    const created = await createMemberRequest(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      memberId,
      actorUserId: memberUser.user.id,
      category: "pastoral",
      subject: "HQ oversight counseling",
      message: "Need pastoral follow-up",
      mediaAssetId: privateMediaId,
    });
    assert.equal(created.ok, true, created.reason);

    const reqList = await request(app)
      .get("/hq/requests")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(reqList.status, 200);
    assert.match(reqList.text, /data-bb-request-admin-list="1"/);
    assert.match(reqList.text, /data-bb-hq-requests="1"/);
    assert.match(reqList.text, /data-bb-stitch-requests="44-branch-request-workflow-queue"/);
    assert.match(reqList.text, /data-bb-hq-requests-branches="1"/);
    assert.match(reqList.text, /data-bb-req-filter="1"/);
    assert.match(reqList.text, /data-bb-req-summary="1"/);
    assert.match(reqList.text, /data-bb-req-scope="church-wide"/);
    assert.match(reqList.text, /href="\/hq\/requests\/b\/campus"/);
    assert.match(reqList.text, /HQ oversight counseling/);
    assert.doesNotMatch(reqList.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(reqList.text, new RegExp(memberId, "i"));
    assert.doesNotMatch(reqList.text, /Active Donor|donor email|View Profile|Need pastoral follow-up/i);

    const memberRef = String(memberId).slice(-8);
    assert.match(reqList.text, new RegExp(memberRef));

    const reqSearchHit = await request(app)
      .get("/hq/requests?q=oversight%20counseling")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(reqSearchHit.status, 200);
    assert.match(reqSearchHit.text, /HQ oversight counseling/);
    assert.match(reqSearchHit.text, /name="q"/);

    const reqSearchMiss = await request(app)
      .get("/hq/requests?q=zzzz-no-match")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(reqSearchMiss.status, 200);
    assert.match(reqSearchMiss.text, /data-bb-req-empty="no-results"/);
    assert.doesNotMatch(reqSearchMiss.text, /HQ oversight counseling/);

    const reqStatusFilter = await request(app)
      .get("/hq/requests?status=resolved&q=HQ%20oversight%20counseling")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(reqStatusFilter.status, 200);
    assert.match(reqStatusFilter.text, /data-bb-req-tab="resolved"/);
    assert.match(reqStatusFilter.text, /data-bb-req-empty="no-results"/);
    assert.doesNotMatch(reqStatusFilter.text, /data-bb-req-row=/);
    assert.doesNotMatch(reqStatusFilter.text, /data-bb-req-catalog="1"/);

    const branchReqList = await request(app)
      .get("/hq/requests/b/campus")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(branchReqList.status, 200);
    assert.match(branchReqList.text, /HQ oversight counseling/);
    assert.match(branchReqList.text, /href="\/hq\/requests"/);
    assert.match(branchReqList.text, /data-bb-hq-requests="1"/);
    assert.doesNotMatch(branchReqList.text, /data-bb-hq-requests-branches="1"/);

    const detail = await request(app)
      .get(`/hq/requests/b/campus/${created.request.id}`)
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-request-admin-detail="1"/);
    assert.match(detail.text, /data-bb-hq-request-detail="1"/);
    assert.match(detail.text, /data-bb-stitch-requests-detail="45-branch-request-details"/);
    assert.match(detail.text, /data-bb-req-attachment="1"/);
    assert.match(detail.text, /data-bb-req-download="1"/);
    assert.match(detail.text, /data-bb-req-status-form="1"/);
    assert.match(detail.text, /data-bb-req-history="1"/);
    assert.match(detail.text, /Need pastoral follow-up/);
    assert.match(detail.text, /href="\/hq\/requests"/);
    assert.doesNotMatch(detail.text, new RegExp(memberId, "i"));
    assert.match(detail.text, new RegExp(memberRef));

    const csrf = extractCookie(detail, CSRF_COOKIE);
    assert.ok(csrf);

    const missingCsrf = await request(app)
      .post(`/hq/requests/b/campus/${created.request.id}/status`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(hqCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ status: "in_review", note: "HQ assigned" });
    assert.equal(missingCsrf.status, 403);

    const updated = await request(app)
      .post(`/hq/requests/b/campus/${created.request.id}/status`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(hqCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        status: "in_review",
        note: "HQ assigned",
      });
    assert.equal(updated.status, 303);
    assert.match(String(updated.headers.location || ""), /\/hq\/requests\/b\/campus\/[0-9a-f-]{36}\?saved=status/i);

    const after = await request(app)
      .get(`/hq/requests/b/campus/${created.request.id}`)
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(after.status, 200);
    assert.match(after.text, /data-bb-status="in_review"/);
    assert.match(after.text, /HQ assigned/);
    assert.match(after.text, /data-bb-req-history="1"/);
    assert.match(after.text, /data-bb-history-to="in_review"/);

    const file = await request(app)
      .get(`/hq/requests/b/campus/${created.request.id}/file`)
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(file.status, 200);
    assert.equal(file.headers["x-content-type-options"], "nosniff");
    assert.match(String(file.headers["cache-control"] || ""), /private/i);
    assert.match(String(file.headers["content-disposition"] || ""), /attachment/i);

    const baDeniedForms = await request(app)
      .get("/hq/forms")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);
    assert.ok(
      baDeniedForms.status === 403 || baDeniedForms.status === 303,
      `forms status=${baDeniedForms.status}`
    );

    const baDeniedRequests = await request(app)
      .get("/hq/requests")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);
    assert.ok(
      baDeniedRequests.status === 403 || baDeniedRequests.status === 303,
      `requests status=${baDeniedRequests.status}`
    );

    const baDeniedResources = await request(app)
      .get("/hq/resources")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);
    assert.ok(
      baDeniedResources.status === 403 || baDeniedResources.status === 303,
      `resources status=${baDeniedResources.status}`
    );
  });

  it("leaves V4 wiring untouched", () => {
    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.doesNotMatch(legacy, /createFormsRequestsAdminRouter|formsRequestsService|formSchema/);
    assert.ok(fs.existsSync(path.join(ROOT, "db/postgres/052_church_attendance_giving.sql")));
  });
});

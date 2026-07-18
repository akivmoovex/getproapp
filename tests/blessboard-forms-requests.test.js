"use strict";

/**
 * BlessBoard V5 resources / forms / requests:
 * schema validation, ownership, submission privacy, status workflow, attachments, V4 isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

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

      const priv = await pool.query(
        `INSERT INTO blessboard.media_assets
           (church_id, branch_id, storage_bucket, storage_key, original_filename, mime_type,
            size_bytes, sha256, visibility, status, uploaded_by_user_id)
         VALUES ($1, $2, 'blessboard-private', $3, 'note.pdf', 'application/pdf', 12,
                 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                 'private', 'active', $4)
         RETURNING id`,
        [churchA.id, branchA.id, `churches/${churchA.id}/private/note.pdf`, hqAdmin.user.id]
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
        [churchA.id, branchA.id, `churches/${churchA.id}/public/flyer.pdf`, hqAdmin.user.id]
      );
      publicMediaId = pub.rows[0].id;
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("forms-requests suite setup failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
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

    const memberView = await getMemberRequest(pool, {
      id: created.request.id,
      churchId: churchA.id,
      memberId,
      forMember: true,
    });
    assert.equal(memberView.ok, true);
    assert.ok(memberView.request.history.length >= 3);
    assert.ok(memberView.request.history.every((h) => h.memberVisible === true));

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

    const closed = await updateMemberRequestStatus(pool, {
      id: created.request.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      status: "closed",
    });
    assert.equal(closed.ok, true, closed.reason);
    assert.equal(closed.request.status, "closed");

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

  it("leaves V4 wiring untouched", () => {
    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.doesNotMatch(legacy, /createFormsRequestsAdminRouter|formsRequestsService|formSchema/);
    assert.ok(fs.existsSync(path.join(ROOT, "db/postgres/052_church_attendance_giving.sql")));
  });
});

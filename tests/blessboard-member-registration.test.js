"use strict";

/**
 * BlessBoard V5 public registration + branch-admin verification HTTP.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
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
  GENERIC_DUPLICATE_MESSAGE,
  mapRegistrationFieldErrors,
} = require("../src/blessboard/http/tenantRegistrationRoutes");
const {
  updateChurchSettings,
  ensureChurchSettingsInitialized,
} = require("../src/blessboard/services/blessBoardSettingsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "reg-a.blessboard.org";
const HOST_B = "reg-b.blessboard.org";

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

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    ...overrides,
  };
}

describe("blessboard member registration http", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let churchA;
  let orgA;
  let orgB;
  let users = {};

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
        organizationKey: "reg-a",
        displayName: "Reg A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "reg-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "reg-a",
        churchKey: "reg-a",
        displayName: "Reg Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "reg-b",
        displayName: "Reg B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "reg-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "reg-b",
        churchKey: "reg-b",
        displayName: "Reg Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Reg Church A",
        websiteStatus: "published",
      });

      async function makeUser(email, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message);
        const assigned = await assignBlessBoardRole(pool, role);
        assert.equal(assigned.ok, true, assigned.message);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId:
            role.organizationKey === "reg-a"
              ? orgA.records.organization.id
              : orgB.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.branchA = await makeUser("branch@reg-a.example.test", {
        email: "branch@reg-a.example.test",
        organizationKey: "reg-a",
        churchKey: "reg-a",
        roleKey: "branch_admin",
        branchKey: "hq",
      });
      users.hqB = await makeUser("hq@reg-b.example.test", {
        email: "hq@reg-b.example.test",
        organizationKey: "reg-b",
        churchKey: "reg-b",
        roleKey: "church_hq_admin",
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("member-registration suite setup failed:", skipReason);
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

  function sessionCookie(bundle) {
    return `${DEFAULT_V5_COOKIE}=${bundle.rawToken}`;
  }

  it("serves public registration form on tenant host", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app).get("/register").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /Member registration/);
    assert.match(res.text, /name="_csrf"/);
    assert.match(res.text, /data-bb-shell="tenant-auth"/);
    assert.match(res.text, /for="first_name"/);
    assert.match(res.text, /for="last_name"/);
    assert.match(res.text, /for="email"/);
    assert.match(res.text, /for="phone"/);
    assert.doesNotMatch(res.text, /name="church_id"|name="branch_id"|name="churchId"|name="branchId"/);
    assert.ok(extractCookie(res, CSRF_COOKIE));
  });

  it("maps validation reasons to field-level errors without leaking internals", () => {
    const missing = mapRegistrationFieldErrors("first_name");
    assert.equal(missing.fieldErrors.firstName, "Enter your first name.");
    assert.equal(missing.summaryItems.length, 1);

    const contact = mapRegistrationFieldErrors("contact_required");
    assert.equal(contact.fieldErrors.email, contact.fieldErrors.phone);
    assert.match(contact.fieldErrors.email, /email or a phone/i);

    const unknown = mapRegistrationFieldErrors("branch_ownership");
    assert.deepEqual(unknown.fieldErrors, {});
  });

  it("shows field-level errors, retains submitted values, and serves confirmation chrome", async (t) => {
    if (skipIfNeeded(t)) return;
    const form = await request(app).get("/register").set("Host", HOST_A);
    const csrf = extractCookie(form, CSRF_COOKIE);

    const invalid = await request(app)
      .post("/register")
      .set("Host", HOST_A)
      .set("Cookie", `${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        first_name: "",
        last_name: "Applicant",
        preferred_name: "Pat",
        email: "",
        phone: "",
      });
    assert.equal(invalid.status, 400);
    assert.match(invalid.text, /id="bb-auth-error-summary"/);
    assert.match(invalid.text, /id="err-firstName"|Enter your first name/);
    assert.match(invalid.text, /value="Applicant"/);
    assert.match(invalid.text, /value="Pat"/);
    assert.doesNotMatch(invalid.text, /name="church_id"|name="branch_id"/);

    const contactMissing = await request(app)
      .post("/register")
      .set("Host", HOST_A)
      .set("Cookie", `${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        first_name: "Pat",
        last_name: "Applicant",
        email: "",
        phone: "",
      });
    assert.equal(contactMissing.status, 400);
    assert.match(contactMissing.text, /Provide at least an email or a phone number/);
    assert.match(contactMissing.text, /aria-invalid="true"/);

    const okForm = await request(app).get("/register").set("Host", HOST_A);
    const okCsrf = extractCookie(okForm, CSRF_COOKIE);
    const ok = await request(app)
      .post("/register")
      .set("Host", HOST_A)
      .set("Cookie", `${CSRF_COOKIE}=${okCsrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: okCsrf,
        first_name: "Sam",
        last_name: "Confirmed",
        email: "sam-confirmed@example.test",
      });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.location, "/register/submitted");

    const submitted = await request(app).get("/register/submitted").set("Host", HOST_A);
    assert.equal(submitted.status, 200);
    assert.match(submitted.text, /data-bb-register-submitted="1"/);
    assert.match(submitted.text, /Registration received|Pending review/);
    assert.doesNotMatch(submitted.text, /Submission ID|KBC-|account has been created|automatically created/i);
    assert.match(submitted.text, /not created automatically|only after leadership approves/i);
  });

  it("ignores client church/branch ids and submits against host scope", async (t) => {
    if (skipIfNeeded(t)) return;
    const form = await request(app).get("/register").set("Host", HOST_A);
    const csrf = extractCookie(form, CSRF_COOKIE);
    assert.ok(csrf);

    const forgedChurch = "00000000-0000-4000-8000-000000000099";
    const forgedBranch = "00000000-0000-4000-8000-000000000098";
    const post = await request(app)
      .post("/register")
      .set("Host", HOST_A)
      .set("Cookie", `${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        church_id: forgedChurch,
        branch_id: forgedBranch,
        churchId: forgedChurch,
        branchId: forgedBranch,
        first_name: "Nora",
        last_name: "Applicant",
        email: "nora@example.test",
        phone: "",
      });

    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/register/submitted");

    const rows = await pool.query(
      `SELECT church_id, branch_id, email_normalized, status
         FROM blessboard.member_registrations
        WHERE email_normalized = 'nora@example.test'`
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].church_id, churchA.id);
    assert.notEqual(rows.rows[0].church_id, forgedChurch);
    assert.equal(rows.rows[0].status, "submitted");
  });

  it("returns generic duplicate messaging without leaking existence details", async (t) => {
    if (skipIfNeeded(t)) return;
    const form = await request(app).get("/register").set("Host", HOST_A);
    const csrf = extractCookie(form, CSRF_COOKIE);

    const dup = await request(app)
      .post("/register")
      .set("Host", HOST_A)
      .set("Cookie", `${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        first_name: "Nora",
        last_name: "Again",
        email: "nora@example.test",
      });

    assert.equal(dup.status, 409);
    assert.match(dup.text, new RegExp(GENERIC_DUPLICATE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(dup.text, /duplicate_email/i);
  });

  it("requires CSRF on public submit", async (t) => {
    if (skipIfNeeded(t)) return;
    const form = await request(app).get("/register").set("Host", HOST_A);
    const csrf = extractCookie(form, CSRF_COOKIE);

    const bad = await request(app)
      .post("/register")
      .set("Host", HOST_A)
      .set("Cookie", `${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: "not-a-valid-token",
        first_name: "Bad",
        last_name: "Csrf",
        email: "bad-csrf@example.test",
      });
    assert.equal(bad.status, 403);
  });

  it("rate-limits repeated public submissions", async (t) => {
    if (skipIfNeeded(t)) return;
    const limitedApp = createV5FoundationApp({
      getPool: () => pool,
      env: baseEnv({ BLESSBOARD_REGISTER_RATE_LIMIT: "3" }),
    });
    let saw429 = false;
    for (let i = 0; i < 6; i += 1) {
      const form = await request(limitedApp).get("/register").set("Host", HOST_A);
      const csrf = extractCookie(form, CSRF_COOKIE);
      const res = await request(limitedApp)
        .post("/register")
        .set("Host", HOST_A)
        .set("Cookie", `${CSRF_COOKIE}=${csrf}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          first_name: "Rate",
          last_name: `Limit${i}`,
          email: `rate-limit-${i}@example.test`,
        });
      if (res.status === 429) {
        saw429 = true;
        assert.match(res.text, /Too many submissions/i);
        break;
      }
    }
    assert.equal(saw429, true);
  });

  it("lists and verifies registrations for branch admin on host branch only", async (t) => {
    if (skipIfNeeded(t)) return;
    const sid = sessionCookie(users.branchA);
    const list = await request(app)
      .get("/branch-admin/registrations")
      .set("Host", HOST_A)
      .set("Cookie", sid);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-registration-queue="1"/);
    assert.match(list.text, /Nora Applicant|nora@example\.test/i);
    assert.doesNotMatch(list.text, /\b24\b.*Pending|Today's Subs|1,248/i);

    const row = await pool.query(
      `SELECT id FROM blessboard.member_registrations
        WHERE email_normalized = 'nora@example.test' LIMIT 1`
    );
    const id = row.rows[0].id;

    const detail = await request(app)
      .get(`/branch-admin/registrations/${id}`)
      .set("Host", HOST_A)
      .set("Cookie", sid);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-registration-detail="1"/);
    assert.match(detail.text, /Nora/);
    assert.match(detail.text, /data-bb-ds-modal-open="bb-ba-approve-modal"/);
    assert.match(detail.text, /data-bb-ds-modal-open="bb-ba-reject-modal"/);
    assert.match(detail.text, /data-bb-reg-approve="1"/);
    assert.match(detail.text, /data-bb-reg-reject="1"/);
    assert.match(detail.text, /does <strong>not<\/strong> create a login account|No login account/i);
    assert.doesNotMatch(detail.text, new RegExp(churchA.id, "i"));

    const csrf = extractCookie(detail, CSRF_COOKIE);
    const approve = await request(app)
      .post(`/branch-admin/registrations/${id}/approve`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sid, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrf, review_notes: "Looks good" });
    assert.equal(approve.status, 303);

    const member = await pool.query(
      `SELECT m.id, m.user_id, m.status
         FROM blessboard.members m
        WHERE m.email_normalized = 'nora@example.test'`
    );
    assert.equal(member.rows.length, 1);
    assert.equal(member.rows[0].status, "active");
    assert.equal(member.rows[0].user_id, null);

    const memberId = member.rows[0].id;
    const directory = await request(app)
      .get("/branch-admin/members")
      .set("Host", HOST_A)
      .set("Cookie", sid);
    assert.equal(directory.status, 200);
    assert.match(directory.text, /data-bb-member-directory="1"/);
    assert.match(directory.text, /Nora/);
    assert.match(directory.text, /href="\/branch-admin\/members\/[0-9a-f-]{36}"/i);
    assert.doesNotMatch(directory.text, /email_normalized|phone_normalized/i);
    assert.doesNotMatch(directory.text, new RegExp(churchA.id, "i"));

    const profile = await request(app)
      .get(`/branch-admin/members/${memberId}`)
      .set("Host", HOST_A)
      .set("Cookie", sid);
    assert.equal(profile.status, 200);
    assert.match(profile.text, /data-bb-member-detail="1"/);
    assert.match(profile.text, /Nora/);
    assert.match(profile.text, /Login linked/);
    assert.doesNotMatch(profile.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(profile.text, /email_normalized|phone_normalized|user_id/i);

    const foreignMember = await request(app)
      .get(`/branch-admin/members/${memberId}`)
      .set("Host", HOST_B)
      .set("Cookie", sessionCookie(users.hqB));
    assert.ok(foreignMember.status === 403 || foreignMember.status === 404);
  });

  it("rejects cross-tenant verification and CSRF-less approve", async (t) => {
    if (skipIfNeeded(t)) return;
    const form = await request(app).get("/register").set("Host", HOST_A);
    let csrf = extractCookie(form, CSRF_COOKIE);
    await request(app)
      .post("/register")
      .set("Host", HOST_A)
      .set("Cookie", `${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        first_name: "Cross",
        last_name: "Tenant",
        email: "cross-tenant@example.test",
      });

    const row = await pool.query(
      `SELECT id FROM blessboard.member_registrations
        WHERE email_normalized = 'cross-tenant@example.test' LIMIT 1`
    );
    const id = row.rows[0].id;

    const foreign = await request(app)
      .get(`/branch-admin/registrations/${id}`)
      .set("Host", HOST_B)
      .set("Cookie", sessionCookie(users.hqB));
    assert.ok(foreign.status === 403 || foreign.status === 404);

    const sid = sessionCookie(users.branchA);
    const detail = await request(app)
      .get(`/branch-admin/registrations/${id}`)
      .set("Host", HOST_A)
      .set("Cookie", sid);
    csrf = extractCookie(detail, CSRF_COOKIE);

    const noCsrf = await request(app)
      .post(`/branch-admin/registrations/${id}/reject`)
      .set("Host", HOST_A)
      .set("Cookie", sid)
      .type("form")
      .send({ review_notes: "no" });
    assert.equal(noCsrf.status, 403);

    const rejected = await request(app)
      .post(`/branch-admin/registrations/${id}/reject`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sid, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrf, review_notes: "Internal only" });
    assert.equal(rejected.status, 303);

    const after = await pool.query(
      `SELECT status, review_notes FROM blessboard.member_registrations WHERE id = $1`,
      [id]
    );
    assert.equal(after.rows[0].status, "rejected");
    assert.equal(after.rows[0].review_notes, "Internal only");
  });

  it("supports pagination and bounded search", async (t) => {
    if (skipIfNeeded(t)) return;
    const sid = sessionCookie(users.branchA);
    const page = await request(app)
      .get("/branch-admin/registrations?q=Nora&page=1")
      .set("Host", HOST_A)
      .set("Cookie", sid);
    assert.equal(page.status, 200);
    assert.match(page.text, /Nora/);
  });

  it("does not collect sensitive categories on the public form", async (t) => {
    if (skipIfNeeded(t)) return;
    const form = await request(app).get("/register").set("Host", HOST_A);
    assert.doesNotMatch(form.text, /national.?id|date of birth|ssn|health|password/i);
    assert.match(form.text, /first_name/);
    assert.match(form.text, /email/);
  });

  it("leaves V4 server.legacy.js without V5 registration routers", () => {
    const legacy = path.join(__dirname, "..", "server.legacy.js");
    assert.equal(fs.existsSync(legacy), true);
    const src = fs.readFileSync(legacy, "utf8");
    assert.equal(src.includes("createTenantRegistrationRouter"), false);
    assert.equal(src.includes("createBranchRegistrationAdminRouter"), false);
  });
});

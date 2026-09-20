"use strict";

/**
 * V8 shared forms end-to-end — public submit → confirm → admin review (SH08–SH15).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const tenantFormService = require("../src/platform/forms/tenantFormService");
const { REVIEW_STATUSES } = require("../src/platform/forms/formAccess");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  assignStaffRole,
  WEBSITE_EDITOR,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const bbFormSchema = require("../src/blessboard/services/formSchema");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "FormE2eQa99!";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "b".repeat(40),
});

let pool;
let skipReason = null;
let phoneSeq = 760000000;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function allow(actionFilter) {
  return async (action) => {
    if (actionFilter && !actionFilter(action)) return { ok: false, reason: "forbidden" };
    return { ok: true };
  };
}

const allowManage = () =>
  allow((action) => action === "manage" || action === "view");
const allowViewOnly = () => allow((action) => action === "view");
const allowPlatformAdmin = () => allow((action) => action === "platform_admin");

const SAMPLE_SCHEMA = {
  version: 1,
  fields: [
    { key: "full_name", type: "text", label: "Full name", required: true, maxLength: 120 },
    { key: "email", type: "email", label: "Email", required: true },
  ],
};

async function seedOrg() {
  const key = uniq("org").replace(/_/g, "-").slice(0, 40);
  const result = await pool.query(
    `INSERT INTO platform.organizations (
       organization_key, display_name, status, data_environment
     ) VALUES ($1, $2, 'active', 'testing')
     RETURNING id`,
    [key, `E2E Org ${key}`]
  );
  return { id: result.rows[0].id, key };
}

async function publishedForm(orgId, productCode, extras) {
  const created = await tenantFormService.createForm(pool, {
    organizationId: orgId,
    productCode,
    title: extras && extras.title ? extras.title : "Public survey",
    schemaJson: SAMPLE_SCHEMA,
    authz: allowManage(),
  });
  assert.equal(created.ok, true, created.reason);
  const published = await tenantFormService.publishForm(pool, {
    organizationId: orgId,
    productCode,
    formId: created.form.id,
    authz: allowManage(),
  });
  assert.equal(published.ok, true, published.reason);
  return published.form;
}

describe("v8 shared forms end-to-end", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl, direction: "up" });
      await ensureDatabaseIdentity(pool, { identityKey: IDENTITY_KEY });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("migration 040 adds review / idempotency / rate-limit tables", async () => {
    requireDb();
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'platform' AND table_name = 'tenant_form_submissions'
          AND column_name IN ('review_status','idempotency_key','internal_notes','consent_accepted_at')`
    );
    assert.equal(cols.rows.length, 4);
    const rate = await pool.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'platform' AND table_name = 'tenant_form_submission_rate_limits'`
    );
    assert.equal(rate.rows.length, 1);
  });

  it("rejects invalid data and requires consent", async () => {
    requireDb();
    const org = await seedOrg();
    const form = await publishedForm(org.id, "activeclinic");

    const noConsent = await tenantFormService.submitPublicForm(pool, {
      productCode: "activeclinic",
      publicToken: form.publicToken,
      answers: { full_name: "Ada", email: "ada@example.com" },
      consentAccepted: false,
    });
    assert.equal(noConsent.ok, false);
    assert.equal(noConsent.reason, "consent_required");

    const invalid = await tenantFormService.submitPublicForm(pool, {
      productCode: "activeclinic",
      publicToken: form.publicToken,
      answers: { full_name: "Ada", email: "not-an-email" },
      consentAccepted: true,
    });
    assert.equal(invalid.ok, false);
    assert.match(String(invalid.reason), /email_/);
  });

  it("persists submissions and replays idempotent retries", async () => {
    requireDb();
    const org = await seedOrg();
    const form = await publishedForm(org.id, "blessboard");
    const key = `idem-${crypto.randomBytes(8).toString("hex")}`;

    const first = await tenantFormService.submitPublicForm(pool, {
      productCode: "blessboard",
      publicToken: form.publicToken,
      answers: { full_name: "Pat Lee", email: "pat@example.com" },
      consentAccepted: true,
      idempotencyKey: key,
    });
    assert.equal(first.ok, true, first.reason);
    assert.equal(first.idempotentReplay, false);
    assert.equal(first.submission.reviewStatus, REVIEW_STATUSES.SUBMITTED);

    const replay = await tenantFormService.submitPublicForm(pool, {
      productCode: "blessboard",
      publicToken: form.publicToken,
      answers: { full_name: "Pat Lee", email: "pat@example.com" },
      consentAccepted: true,
      idempotencyKey: key,
    });
    assert.equal(replay.ok, true, replay.reason);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.submission.id, first.submission.id);

    const count = await pool.query(
      `SELECT count(*)::int AS n FROM platform.tenant_form_submissions WHERE form_id = $1`,
      [form.id]
    );
    assert.equal(count.rows[0].n, 1);
  });

  it("review status transitions, restricted notes, and tenant isolation", async () => {
    requireDb();
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const form = await publishedForm(orgA.id, "activeclinic");
    const submitted = await tenantFormService.submitPublicForm(pool, {
      productCode: "activeclinic",
      publicToken: form.publicToken,
      answers: { full_name: "Sam", email: "sam@example.com" },
      consentAccepted: true,
      idempotencyKey: `k-${crypto.randomBytes(6).toString("hex")}`,
    });
    assert.equal(submitted.ok, true);

    const viewed = await tenantFormService.getFormSubmission(pool, {
      organizationId: orgA.id,
      productCode: "activeclinic",
      formId: form.id,
      submissionId: submitted.submission.id,
      authz: allowViewOnly(),
    });
    assert.equal(viewed.ok, true);
    assert.equal(viewed.submission.internalNotes, undefined);
    assert.equal(viewed.canEditNotes, false);

    const reviewed = await tenantFormService.reviewFormSubmission(pool, {
      organizationId: orgA.id,
      productCode: "activeclinic",
      formId: form.id,
      submissionId: submitted.submission.id,
      reviewStatus: "in_review",
      internalNotes: "Needs follow-up",
      authz: allowManage(),
    });
    assert.equal(reviewed.ok, true, reviewed.reason);
    assert.equal(reviewed.submission.reviewStatus, "in_review");
    assert.equal(reviewed.submission.internalNotes, "Needs follow-up");

    const bad = await tenantFormService.reviewFormSubmission(pool, {
      organizationId: orgA.id,
      productCode: "activeclinic",
      formId: form.id,
      submissionId: submitted.submission.id,
      reviewStatus: "submitted",
      authz: allowManage(),
    });
    // in_review -> submitted is allowed
    assert.equal(bad.ok, true);

    const closed = await tenantFormService.reviewFormSubmission(pool, {
      organizationId: orgA.id,
      productCode: "activeclinic",
      formId: form.id,
      submissionId: submitted.submission.id,
      reviewStatus: "closed",
      authz: allowManage(),
    });
    assert.equal(closed.ok, true);

    const invalid = await tenantFormService.reviewFormSubmission(pool, {
      organizationId: orgA.id,
      productCode: "activeclinic",
      formId: form.id,
      submissionId: submitted.submission.id,
      reviewStatus: "accepted",
      authz: allowManage(),
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.reason, "invalid_transition");

    const cross = await tenantFormService.getFormSubmission(pool, {
      organizationId: orgB.id,
      productCode: "activeclinic",
      formId: form.id,
      submissionId: submitted.submission.id,
      authz: allowManage(),
    });
    assert.equal(cross.ok, false);
  });

  it("platform overview is platform-admin only", async () => {
    requireDb();
    const org = await seedOrg();
    await publishedForm(org.id, "blessboard", { title: "Overview form" });

    const denied = await tenantFormService.listPlatformFormsOverview(pool, {
      authz: allowManage(),
    });
    assert.equal(denied.ok, false);

    const ok = await tenantFormService.listPlatformFormsOverview(pool, {
      authz: allowPlatformAdmin(),
    });
    assert.equal(ok.ok, true);
    assert.ok(ok.forms.some((f) => f.title === "Overview form"));
  });

  it("rate limiting blocks burst submissions safely", async () => {
    requireDb();
    const org = await seedOrg();
    const form = await publishedForm(org.id, "activeclinic");
    const bucket = `burst-${crypto.randomBytes(4).toString("hex")}`;
    let limited = false;
    for (let i = 0; i < 6; i += 1) {
      const result = await tenantFormService.submitPublicForm(pool, {
        productCode: "activeclinic",
        publicToken: form.publicToken,
        answers: { full_name: `User ${i}`, email: `u${i}@example.com` },
        consentAccepted: true,
        idempotencyKey: `rl-${bucket}-${i}-${crypto.randomBytes(3).toString("hex")}`,
        rateBucket: bucket,
        rateLimitMax: 3,
        rateLimitWindowMs: 60 * 60 * 1000,
      });
      if (!result.ok && result.reason === "rate_limited") {
        limited = true;
        break;
      }
    }
    assert.equal(limited, true);
  });

  it("SH08–SH15 templates and mobile CSS exist", () => {
    const viewsDir = path.join(__dirname, "../views/platform/forms");
    for (const name of [
      "public-form",
      "public-thanks",
      "submissions",
      "submission-detail",
      "platform-overview",
      "access-denied",
    ]) {
      assert.ok(fs.existsSync(path.join(viewsDir, `${name}.ejs`)), name);
    }
    const css = fs.readFileSync(
      path.join(__dirname, "../public/platform/forms-builder.css"),
      "utf8"
    );
    assert.match(css, /mx-forms-input-error/);
    assert.match(css, /@media \(max-width: 799px\)/);
  });

  it("V7 BlessBoard formSchema still validates shared schemas", () => {
    const ok = bbFormSchema.validateFormSchema(SAMPLE_SCHEMA);
    assert.equal(ok.ok, true);
    const clinical = bbFormSchema.validateFormCategory
      ? bbFormSchema.validateFormCategory("clinical_intake")
      : { ok: false };
    assert.equal(clinical.ok, false);
  });

  it("ActiveClinic HTTP: public submit with consent then admin submissions list", async () => {
    requireDb();
    const stamp = uniq("e2e");
    const provisioned = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Forms E2E ${stamp}`,
      contactName: "Forms Admin",
      contactEmail: `${stamp}@example.invalid`,
      contactPhone: nextPhone(),
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: "forms-e2e",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    try {
      await assignStaffRole(pool, {
        organizationId: provisioned.organizationId,
        actorIdentityId: provisioned.identityId,
        staffMemberId: provisioned.staffMemberId,
        roleKey: WEBSITE_EDITOR,
      });
    } catch {
      /* already granted */
    }

    const form = await publishedForm(provisioned.organizationId, "activeclinic", {
      title: "Waiting room feedback",
    });

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    const getPage = await request(app)
      .get(`/f/${form.publicToken}`)
      .set("Host", "activeclinic.org");
    assert.equal(getPage.status, 200);
    assert.match(getPage.text, /Waiting room feedback/);
    assert.match(getPage.text, /consent|idempotency_key/i);
    assert.match(getPage.text, /data-stitch="SH08"/);

    function extractCsrf(html) {
      const field = String(html).match(
        new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
      );
      return (field && (field[1] || field[2])) || null;
    }
    function mergeCookies(...responses) {
      const map = Object.create(null);
      for (const res of responses) {
        const set = res && res.headers && res.headers["set-cookie"];
        const list = Array.isArray(set) ? set : set ? [set] : [];
        for (const line of list) {
          const first = String(line).split(";")[0];
          const eq = first.indexOf("=");
          if (eq > 0) map[first.slice(0, eq)] = first.slice(eq + 1);
        }
      }
      return Object.entries(map)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }

    const csrf = extractCsrf(getPage.text);
    const idem =
      (getPage.text.match(/name="idempotency_key"[^>]*value="([^"]+)"/) || [])[1];
    assert.ok(csrf, "csrf token");
    const cookieJar = mergeCookies(getPage);

    const bad = await request(app)
      .post(`/f/${form.publicToken}`)
      .set("Host", "activeclinic.org")
      .set("Cookie", cookieJar)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        idempotency_key: idem,
        full_name: "No Email",
        email: "bad",
        consent: "1",
      });
    assert.equal(bad.status, 200);
    assert.match(bad.text, /data-stitch="SH09"|check the highlighted|Please check/i);

    const csrf2 = extractCsrf(bad.text) || csrf;
    const cookieJar2 = mergeCookies(getPage, bad);
    const idem2 =
      (bad.text.match(/name="idempotency_key"[^>]*value="([^"]+)"/) || [])[1] || idem;

    const okSubmit = await request(app)
      .post(`/f/${form.publicToken}`)
      .set("Host", "activeclinic.org")
      .set("Cookie", cookieJar2)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        idempotency_key: idem2,
        full_name: "Good User",
        email: "good@example.com",
        consent: "1",
      });
    assert.equal(okSubmit.status, 200, okSubmit.text.slice(0, 500));
    assert.match(okSubmit.text, /Submission received|data-stitch="SH10"/);

    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: provisioned.identityId,
      organizationId: provisioned.organizationId,
    });
    assert.equal(session.ok, true);
    const adminCookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;

    const list = await request(app)
      .get(`/app/forms/${form.id}/submissions`)
      .set("Host", "activeclinic.org")
      .set("Cookie", adminCookie);
    assert.equal(list.status, 200, list.text.slice(0, 300));
    assert.match(list.text, /data-stitch="SH11"/);
    assert.match(list.text, /good@example.com|Good User|submitted/);
  });
});

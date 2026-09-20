"use strict";

/**
 * V8 shared form builder — CRUD, publication, validation, RBAC, isolation,
 * access controls, mobile markup, V7 schema compatibility.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const request = require("supertest");
const fs = require("fs");
const path = require("path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const tenantFormService = require("../src/platform/forms/tenantFormService");
const {
  validateFormSchema,
  validateFormCategory,
  ALLOWED_FIELD_TYPES,
} = require("../src/platform/forms/formSchema");
const bbFormSchema = require("../src/blessboard/services/formSchema");
const {
  buildPublicFormPath,
  buildPublicFormQrDataUrl,
} = require("../src/platform/forms/formShareService");
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
const {
  assignStaffRole,
  WEBSITE_EDITOR,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "FormBuilderQa99!";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let phoneSeq = 770000000;

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

function allowManage() {
  return async () => ({ ok: true });
}

function denyAll() {
  return async () => ({ ok: false, reason: "forbidden" });
}

const SAMPLE_SCHEMA = {
  version: 1,
  fields: [
    { key: "full_name", type: "text", label: "Full name", required: true, maxLength: 120 },
    { key: "email", type: "email", label: "Email", required: true },
    {
      key: "topic",
      type: "select",
      label: "Topic",
      required: false,
      options: ["General", "Feedback"],
    },
  ],
};

async function seedOrg() {
  const key = uniq("org").replace(/_/g, "-").slice(0, 40);
  const result = await pool.query(
    `INSERT INTO platform.organizations (
       organization_key, display_name, status, data_environment
     ) VALUES ($1, $2, 'active', 'testing')
     RETURNING id`,
    [key, `Form Org ${key}`]
  );
  return { id: result.rows[0].id, key };
}

describe("v8 shared form builder", () => {
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

  it("migration creates tenant form tables", async () => {
    requireDb();
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'platform'
          AND table_name IN (
            'tenant_forms',
            'tenant_form_versions',
            'tenant_form_submissions',
            'tenant_form_access_tokens'
          )
        ORDER BY table_name`
    );
    assert.equal(tables.rows.length, 4);
  });

  it("validates allowlisted field types and rejects clinical / executable rules", () => {
    assert.ok(ALLOWED_FIELD_TYPES.includes("text"));
    assert.ok(!ALLOWED_FIELD_TYPES.includes("html"));
    assert.equal(validateFormCategory("clinical_intake").ok, false);
    assert.equal(validateFormCategory("general").ok, true);

    const bad = validateFormSchema({
      version: 1,
      fields: [{ key: "x", type: "text", label: "X", required: false }],
      validationRules: [{ kind: "custom", expression: "1==1" }],
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "executable_validation_not_allowed");

    const ok = validateFormSchema(SAMPLE_SCHEMA);
    assert.equal(ok.ok, true);
    assert.equal(ok.schema.fields.length, 3);
  });

  it("BlessBoard formSchema re-exports shared platform schema (V7 compat)", () => {
    assert.equal(bbFormSchema.validateFormSchema, validateFormSchema);
    const ok = bbFormSchema.validateFormSchema(SAMPLE_SCHEMA);
    assert.equal(ok.ok, true);
  });

  it("CRUD + field order + required settings are tenant-scoped", async () => {
    requireDb();
    const orgA = await seedOrg();
    const orgB = await seedOrg();

    const created = await tenantFormService.createForm(pool, {
      organizationId: orgA.id,
      productCode: "activeclinic",
      title: "Visitor feedback",
      category: "feedback",
      schemaJson: SAMPLE_SCHEMA,
      authz: allowManage(),
    });
    assert.equal(created.ok, true, created.reason);
    assert.equal(created.form.status, "draft");

    const reordered = await tenantFormService.reorderFields(pool, {
      organizationId: orgA.id,
      productCode: "activeclinic",
      formId: created.form.id,
      fieldKeys: ["email", "topic", "full_name"],
      authz: allowManage(),
    });
    assert.equal(reordered.ok, true, reordered.reason);
    assert.deepEqual(
      reordered.form.schemaJson.fields.map((f) => f.key),
      ["email", "topic", "full_name"]
    );
    assert.equal(reordered.form.schemaJson.fields[2].required, true);

    const cross = await tenantFormService.getForm(pool, {
      organizationId: orgB.id,
      productCode: "activeclinic",
      formId: created.form.id,
      authz: allowManage(),
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.status, "not_found");
  });

  it("RBAC denies manage without authz", async () => {
    requireDb();
    const org = await seedOrg();
    const denied = await tenantFormService.createForm(pool, {
      organizationId: org.id,
      productCode: "blessboard",
      title: "Denied",
      authz: denyAll(),
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, "forbidden");
  });

  it("publish / unpublish / versioning and public URL access", async () => {
    requireDb();
    const org = await seedOrg();
    const created = await tenantFormService.createForm(pool, {
      organizationId: org.id,
      productCode: "activeclinic",
      title: "Event signup",
      category: "event",
      schemaJson: SAMPLE_SCHEMA,
      authz: allowManage(),
    });
    assert.equal(created.ok, true);

    const published = await tenantFormService.publishForm(pool, {
      organizationId: org.id,
      productCode: "activeclinic",
      formId: created.form.id,
      authz: allowManage(),
    });
    assert.equal(published.ok, true, published.reason);
    assert.equal(published.form.status, "published");

    const versions = await tenantFormService.listVersions(pool, {
      organizationId: org.id,
      productCode: "activeclinic",
      formId: created.form.id,
      authz: allowManage(),
    });
    assert.equal(versions.ok, true);
    assert.ok(versions.versions.length >= 1);

    const pathStr = buildPublicFormPath({
      productCode: "activeclinic",
      publicToken: published.form.publicToken,
    });
    assert.match(pathStr, /^\/f\//);

    const qr = await buildPublicFormQrDataUrl({
      productCode: "activeclinic",
      publicToken: published.form.publicToken,
      baseUrl: "https://example.test",
    });
    assert.equal(qr.ok, true);
    assert.match(qr.dataUrl, /^data:image\/png;base64,/);

    const openSubmit = await tenantFormService.submitPublicForm(pool, {
      productCode: "activeclinic",
      publicToken: published.form.publicToken,
      answers: {
        full_name: "Ada Lovelace",
        email: "ada@example.com",
        topic: "General",
      },
    });
    assert.equal(openSubmit.ok, true, openSubmit.reason);

    const unpublished = await tenantFormService.unpublishForm(pool, {
      organizationId: org.id,
      productCode: "activeclinic",
      formId: created.form.id,
      authz: allowManage(),
    });
    assert.equal(unpublished.ok, true);
    assert.equal(unpublished.form.status, "draft");

    const blocked = await tenantFormService.submitPublicForm(pool, {
      productCode: "activeclinic",
      publicToken: published.form.publicToken,
      answers: { full_name: "X", email: "x@example.com" },
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, "not_found");
  });

  it("email_token access actually enforces tokens (not discovery alone)", async () => {
    requireDb();
    const org = await seedOrg();
    const created = await tenantFormService.createForm(pool, {
      organizationId: org.id,
      productCode: "blessboard",
      title: "Members only survey",
      schemaJson: SAMPLE_SCHEMA,
      accessMode: "email_token",
      authz: allowManage(),
    });
    assert.equal(created.ok, true);

    await tenantFormService.updateSharing(pool, {
      organizationId: org.id,
      productCode: "blessboard",
      formId: created.form.id,
      accessMode: "email_token",
      discoverable: false,
      authz: allowManage(),
    });

    const published = await tenantFormService.publishForm(pool, {
      organizationId: org.id,
      productCode: "blessboard",
      formId: created.form.id,
      authz: allowManage(),
    });
    assert.equal(published.ok, true, published.reason);

    const noToken = await tenantFormService.submitPublicForm(pool, {
      productCode: "blessboard",
      publicToken: published.form.publicToken,
      answers: { full_name: "Pat", email: "pat@example.com" },
      email: "pat@example.com",
    });
    assert.equal(noToken.ok, false);
    assert.equal(noToken.status, "forbidden");

    const issued = await tenantFormService.issueEmailAccessToken(pool, {
      organizationId: org.id,
      productCode: "blessboard",
      formId: created.form.id,
      email: "pat@example.com",
      authz: allowManage(),
    });
    assert.equal(issued.ok, true, issued.reason);

    const wrongEmail = await tenantFormService.submitPublicForm(pool, {
      productCode: "blessboard",
      publicToken: published.form.publicToken,
      answers: { full_name: "Pat", email: "other@example.com" },
      email: "other@example.com",
      accessToken: issued.accessToken.token,
    });
    assert.equal(wrongEmail.ok, false);

    const ok = await tenantFormService.submitPublicForm(pool, {
      productCode: "blessboard",
      publicToken: published.form.publicToken,
      answers: { full_name: "Pat", email: "pat@example.com" },
      email: "pat@example.com",
      accessToken: issued.accessToken.token,
    });
    assert.equal(ok.ok, true, ok.reason);
  });

  it("product isolation: AC token does not resolve on BB product code", async () => {
    requireDb();
    const org = await seedOrg();
    const created = await tenantFormService.createForm(pool, {
      organizationId: org.id,
      productCode: "activeclinic",
      title: "AC only",
      schemaJson: SAMPLE_SCHEMA,
      authz: allowManage(),
    });
    await tenantFormService.publishForm(pool, {
      organizationId: org.id,
      productCode: "activeclinic",
      formId: created.form.id,
      authz: allowManage(),
    });
    const form = (
      await tenantFormService.getForm(pool, {
        organizationId: org.id,
        productCode: "activeclinic",
        formId: created.form.id,
        authz: allowManage(),
      })
    ).form;
    const crossProduct = await tenantFormService.getPublicForm(pool, {
      productCode: "blessboard",
      publicToken: form.publicToken,
    });
    assert.equal(crossProduct.ok, false);
  });

  it("SH01–SH07 view templates and mobile CSS exist", () => {
    const viewsDir = path.join(__dirname, "../views/platform/forms");
    for (const name of [
      "dashboard",
      "dashboard-empty",
      "studio",
      "preview",
      "publication",
      "sharing",
      "public-form",
      "public-thanks",
    ]) {
      assert.ok(fs.existsSync(path.join(viewsDir, `${name}.ejs`)), name);
    }
    const css = fs.readFileSync(
      path.join(__dirname, "../public/platform/forms-builder.css"),
      "utf8"
    );
    assert.match(css, /@media \(max-width: 799px\)/);
    assert.match(css, /mx-forms--blessboard/);
    assert.match(css, /mx-forms--activeclinic/);
  });

  it("ActiveClinic HTTP: website editor can open form studio", async () => {
    requireDb();
    const stamp = uniq("fb");
    const provisioned = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Forms ${stamp}`,
      contactName: "Forms Admin",
      contactEmail: `${stamp}@example.invalid`,
      contactPhone: nextPhone(),
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: "forms",
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
      /* role may already exist from provision */
    }

    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: provisioned.identityId,
      organizationId: provisioned.organizationId,
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    const dash = await request(app)
      .get("/app/forms")
      .set("Host", "activeclinic.org")
      .set("Cookie", cookie);
    assert.equal(dash.status, 200, dash.text.slice(0, 400));
    assert.match(dash.text, /Form Studio|Forms Management|No forms yet/);
    assert.match(dash.text, /mx-forms--activeclinic/);
    assert.match(dash.text, /data-stitch="SH0[12]"/);
    assert.match(dash.text, /mx-forms-mobile-only|@media|Create/);

    const publicCreate = await tenantFormService.createForm(pool, {
      organizationId: provisioned.organizationId,
      productCode: "activeclinic",
      title: "Walk-in survey",
      schemaJson: SAMPLE_SCHEMA,
      authz: allowManage(),
    });
    assert.equal(publicCreate.ok, true);
    const published = await tenantFormService.publishForm(pool, {
      organizationId: provisioned.organizationId,
      productCode: "activeclinic",
      formId: publicCreate.form.id,
      authz: allowManage(),
    });
    assert.equal(published.ok, true);

    const publicPage = await request(app)
      .get(`/f/${published.form.publicToken}`)
      .set("Host", "activeclinic.org");
    assert.equal(publicPage.status, 200);
    assert.match(publicPage.text, /Walk-in survey/);
    assert.match(publicPage.text, /mx-forms--mobile|mx-forms--activeclinic/);
  });
});

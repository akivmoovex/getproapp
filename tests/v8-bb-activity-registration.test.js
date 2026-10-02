"use strict";

/**
 * V8 BlessBoard activity registration — BB08–BB10.
 * Visitor / event / ministry via shared forms: capacity, consent, duplicates,
 * authorization, isolation, no auto roles, V7 category compat.
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
const {
  validateFormCategory,
  ALLOWED_FORM_CATEGORIES,
} = require("../src/platform/forms/formSchema");
const {
  publishActivityRegistrationForm,
  submitActivityRegistration,
  reviewActivityRegistration,
  closeActivityRegistration,
  getPublishedActivityForm,
  STATUS,
} = require("../src/blessboard/services/activityRegistrationService");

let pool;
let skipReason = null;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function allowManage() {
  return async (action) =>
    action === "manage" || action === "view" ? { ok: true } : { ok: false };
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
  return {
    organization: org.records.organization,
    church: church.records.church,
    branch: church.records.hqBranch,
  };
}

async function seedPublishedEvent(seed, { capacity }) {
  const { rows } = await pool.query(
    `INSERT INTO blessboard.events (
       church_id, branch_id, title, starts_at, timezone, status, capacity
     ) VALUES ($1, $2, $3, now() + interval '7 days', 'Africa/Lusaka', 'published', $4)
     RETURNING id, title, capacity, status`,
    [seed.church.id, seed.branch.id, `Event ${uniq("e")}`, capacity]
  );
  return rows[0];
}

async function seedPublishedMinistry(seed) {
  const key = uniq("min").replace(/-/g, "_").slice(0, 40);
  const { rows } = await pool.query(
    `INSERT INTO blessboard.ministries (
       church_id, branch_id, organization_id, name, ministry_key, ministry_type, status, join_policy
     ) VALUES ($1, $2, $3, $4, $5, 'other', 'published', 'request')
     RETURNING id, name, status`,
    [seed.church.id, seed.branch.id, seed.organization.id, `Ministry ${key}`, key]
  );
  return rows[0];
}

before(async () => {
  try {
    const databaseUrl = await resetFoundationDatabase();
    pool = createFoundationPool(databaseUrl);
    await migrate({ connectionString: databaseUrl });
  } catch (err) {
    skipReason = err && err.message ? err.message : String(err);
    pool = null;
  }
});

after(async () => {
  if (pool) await pool.end().catch(() => {});
});

describe("V8 BlessBoard activity registration (BB08–BB10)", () => {
  it("allows visitor/event/ministry categories and keeps V7 categories", () => {
    assert.ok(ALLOWED_FORM_CATEGORIES.includes("visitor"));
    assert.ok(ALLOWED_FORM_CATEGORIES.includes("ministry"));
    assert.ok(ALLOWED_FORM_CATEGORIES.includes("event"));
    assert.equal(validateFormCategory("general").ok, true);
    assert.equal(validateFormCategory("registration").ok, true);
    assert.equal(validateFormCategory("clinical_intake").ok, false);
  });

  it("publishes visitor form, submits with consent, blocks duplicate email", async () => {
    requireDb();
    const key = uniq("act-v");
    const seed = await seedChurch(key);
    const published = await publishActivityRegistrationForm(pool, {
      kind: "visitor",
      organizationId: seed.organization.id,
      churchId: seed.church.id,
      authz: allowManage(),
    });
    assert.equal(published.ok, true, published.reason);
    assert.equal(published.form.category, "visitor");
    assert.equal(published.form.requireConsent, true);
    assert.equal(published.stitchScreen, "BB08");

    const email = `visitor-${key}@example.test`;
    const first = await submitActivityRegistration(pool, {
      kind: "visitor",
      organizationId: seed.organization.id,
      publicToken: published.form.publicToken,
      email,
      answers: { full_name: "Visitor One", email },
      consentAccepted: true,
      idempotencyKey: `idem-${key}-1`,
    });
    assert.equal(first.ok, true, first.reason);
    assert.equal(first.loginCreated, false);
    assert.equal(first.ministryRoleGranted, false);

    const noConsent = await submitActivityRegistration(pool, {
      kind: "visitor",
      organizationId: seed.organization.id,
      publicToken: published.form.publicToken,
      email: `other-${key}@example.test`,
      answers: { full_name: "No Consent", email: `other-${key}@example.test` },
      consentAccepted: false,
    });
    assert.equal(noConsent.ok, false);
    assert.equal(noConsent.reason, "consent_required");

    const dup = await submitActivityRegistration(pool, {
      kind: "visitor",
      organizationId: seed.organization.id,
      publicToken: published.form.publicToken,
      email,
      answers: { full_name: "Visitor Dup", email },
      consentAccepted: true,
      idempotencyKey: `idem-${key}-2`,
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.reason, "duplicate_submission");
  });

  it("enforces event capacity and registration closure", async () => {
    requireDb();
    const key = uniq("act-e");
    const seed = await seedChurch(key);
    const event = await seedPublishedEvent(seed, { capacity: 1 });
    const published = await publishActivityRegistrationForm(pool, {
      kind: "event",
      organizationId: seed.organization.id,
      eventId: event.id,
      authz: allowManage(),
    });
    assert.equal(published.ok, true, published.reason);
    assert.equal(published.form.maxSubmissions, 1);
    assert.equal(published.stitchScreen, "BB09");

    const email1 = `e1-${key}@example.test`;
    const ok = await submitActivityRegistration(pool, {
      kind: "event",
      organizationId: seed.organization.id,
      eventId: event.id,
      publicToken: published.form.publicToken,
      email: email1,
      answers: { full_name: "Attendee", email: email1 },
      consentAccepted: true,
    });
    assert.equal(ok.ok, true, ok.reason);

    const email2 = `e2-${key}@example.test`;
    const full = await submitActivityRegistration(pool, {
      kind: "event",
      organizationId: seed.organization.id,
      eventId: event.id,
      publicToken: published.form.publicToken,
      email: email2,
      answers: { full_name: "Too Late", email: email2 },
      consentAccepted: true,
    });
    assert.equal(full.ok, false);
    assert.ok(
      full.reason === "capacity_full" || full.status === STATUS.CAPACITY_FULL,
      full.reason
    );

    const closed = await closeActivityRegistration(pool, {
      organizationId: seed.organization.id,
      formId: published.form.id,
    });
    assert.equal(closed.ok, true, closed.reason);
    const loaded = await getPublishedActivityForm(pool, {
      kind: "event",
      organizationId: seed.organization.id,
      eventId: event.id,
    });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.reason, "registration_closed");
  });

  it("ministry apply + review never grants roles; isolates churches", async () => {
    requireDb();
    const key = uniq("act-m");
    const seed = await seedChurch(key);
    const other = await seedChurch(uniq("act-x"));
    const ministry = await seedPublishedMinistry(seed);

    const cross = await publishActivityRegistrationForm(pool, {
      kind: "ministry",
      organizationId: other.organization.id,
      ministryId: ministry.id,
      authz: allowManage(),
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.reason, "church_isolation");

    const published = await publishActivityRegistrationForm(pool, {
      kind: "ministry",
      organizationId: seed.organization.id,
      ministryId: ministry.id,
      authz: allowManage(),
    });
    assert.equal(published.ok, true, published.reason);
    assert.equal(published.stitchScreen, "BB10");

    const email = `serve-${key}@example.test`;
    const submitted = await submitActivityRegistration(pool, {
      kind: "ministry",
      organizationId: seed.organization.id,
      publicToken: published.form.publicToken,
      email,
      answers: { full_name: "Server", email, interest: "Welcome team" },
      consentAccepted: true,
    });
    assert.equal(submitted.ok, true, submitted.reason);
    assert.equal(submitted.ministryRoleGranted, false);
    assert.equal(submitted.loginCreated, false);

    const toReview = await reviewActivityRegistration(pool, {
      organizationId: seed.organization.id,
      formId: published.form.id,
      submissionId: submitted.submission.id,
      reviewStatus: "in_review",
      authz: allowManage(),
    });
    assert.equal(toReview.ok, true, toReview.reason);

    const reviewed = await reviewActivityRegistration(pool, {
      organizationId: seed.organization.id,
      formId: published.form.id,
      submissionId: submitted.submission.id,
      reviewStatus: "accepted",
      internalNotes: "Welcome",
      authz: allowManage(),
    });
    assert.equal(reviewed.ok, true, reviewed.reason);
    assert.equal(reviewed.ministryRoleGranted, false);
    assert.equal(reviewed.loginCreated, false);

    const roles = await pool.query(
      `SELECT count(*)::int AS c FROM blessboard.user_role_assignments ura
         INNER JOIN blessboard.users u ON u.id = ura.user_id
        WHERE lower(u.email_normalized) = lower($1)`,
      [email]
    );
    assert.equal(roles.rows[0].c, 0);
  });

  it("ships stitch-marked BB08–BB10 views", () => {
    const files = [
      ["views/platform/forms/bb-activity-visitor.ejs", "BB08"],
      ["views/platform/forms/bb-activity-event.ejs", "BB09"],
      ["views/platform/forms/bb-activity-ministry.ejs", "BB10"],
      ["views/platform/forms/bb-activity-thanks.ejs", "thanks"],
      ["views/platform/forms/bb-activity-forms.ejs", "BB08"],
    ];
    for (const [rel, marker] of files) {
      const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
      assert.match(src, new RegExp(marker));
    }
  });
});

"use strict";

/**
 * BlessBoard V5 manual giving: money precision, scope, status, void, summaries, no donor PII, V4 isolation.
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
  STATUS,
  GIVING_POLICY,
  FORBIDDEN_ENTRY_COLUMNS,
  parseMoneyAmount,
  moneyToCents,
  centsToMoney,
  sumMoneyStrings,
  createGivingEntry,
  updateGivingEntry,
  submitGivingEntry,
  approveGivingEntry,
  voidGivingEntry,
  getGivingEntry,
  listGivingEntries,
  getMonthlyGivingSummary,
} = require("../src/blessboard/services/givingService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "giv-a.blessboard.org";
const HOST_B = "giv-b.blessboard.org";
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

function makeTenant(church, org, primaryBranch) {
  return {
    resolved: true,
    organization: { id: org.id },
    church: { id: church.id, displayName: church.display_name || church.displayName },
    primaryBranch: { id: primaryBranch.id },
    hqBranch: { id: primaryBranch.id },
  };
}

describe("blessboard giving", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let branchA;
  let campusBranch;
  let hqAdmin;
  let branchAdmin;
  let campusAdmin;
  let yearMonth;

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
        organizationKey: "giv-a",
        displayName: "Giv A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "giv-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "giv-a",
        churchKey: "giv-a",
        displayName: "Giv Church A",
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

      await provisionPlatformTenant(pool, {
        organizationKey: "giv-b",
        displayName: "Giv B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "giv-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: "giv-b",
        churchKey: "giv-b",
        displayName: "Giv Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });

      async function makeUser(email, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message);
        const assigned = await assignBlessBoardRole(pool, role);
        assert.equal(assigned.ok, true, assigned.message || assigned.reason);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgA.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      hqAdmin = await makeUser("hq@giv-a.example.test", {
        email: "hq@giv-a.example.test",
        organizationKey: "giv-a",
        churchKey: "giv-a",
        roleKey: "church_hq_admin",
      });
      branchAdmin = await makeUser("branch@giv-a.example.test", {
        email: "branch@giv-a.example.test",
        organizationKey: "giv-a",
        churchKey: "giv-a",
        roleKey: "branch_admin",
        branchKey: "hq",
      });
      campusAdmin = await makeUser("campus@giv-a.example.test", {
        email: "campus@giv-a.example.test",
        organizationKey: "giv-a",
        churchKey: "giv-a",
        roleKey: "branch_admin",
        branchKey: "campus",
      });

      const today = new Date();
      yearMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("giving suite setup failed:", skipReason);
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

  function givingDateInMonth(day) {
    return `${yearMonth}-${String(day).padStart(2, "0")}`;
  }

  it("creates giving tables with NUMERIC amounts and no donor PII columns", async (t) => {
    if (skipIfNeeded(t)) return;
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'blessboard'
          AND table_name LIKE 'giving_%'
        ORDER BY table_name`
    );
    assert.deepEqual(
      tables.rows.map((r) => r.table_name),
      ["giving_categories", "giving_entries", "giving_methods"]
    );

    const amountCol = await pool.query(
      `SELECT data_type, numeric_precision, numeric_scale
         FROM information_schema.columns
        WHERE table_schema = 'blessboard'
          AND table_name = 'giving_entries'
          AND column_name = 'amount'`
    );
    assert.equal(amountCol.rows[0].data_type, "numeric");
    assert.equal(Number(amountCol.rows[0].numeric_precision), 14);
    assert.equal(Number(amountCol.rows[0].numeric_scale), 2);

    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'blessboard' AND table_name = 'giving_entries'`
    );
    const names = new Set(cols.rows.map((r) => r.column_name));
    for (const forbidden of FORBIDDEN_ENTRY_COLUMNS) {
      assert.equal(names.has(forbidden), false, `unexpected column ${forbidden}`);
    }
    assert.equal(GIVING_POLICY.storesDonorPii, false);
    assert.equal(GIVING_POLICY.acceptsCardOrBankDetails, false);
    assert.equal(GIVING_POLICY.usesPaymentGateway, false);
  });

  it("enforces money precision: decimal strings, never float", async (t) => {
    if (skipIfNeeded(t)) return;
    assert.equal(parseMoneyAmount(0.1 + 0.2).ok, false);
    assert.equal(parseMoneyAmount("10.125").ok, false);
    assert.equal(parseMoneyAmount("-1.00").ok, false);
    assert.equal(parseMoneyAmount("1e2").ok, false);
    const ok = parseMoneyAmount("10.5");
    assert.equal(ok.ok, true);
    assert.equal(ok.value, "10.50");
    assert.equal(centsToMoney(moneyToCents("0.10") + moneyToCents("0.20")), "0.30");
    assert.equal(sumMoneyStrings(["0.10", "0.20", "10.00"]), "10.30");

    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const floatReject = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      categoryKey: "tithes",
      givingDate: givingDateInMonth(1),
      amount: 12.34,
      currency: "USD",
    });
    assert.equal(floatReject.ok, false);
    assert.equal(floatReject.reason, "amount_must_be_decimal_string");

    const created = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      categoryKey: "tithes",
      givingDate: givingDateInMonth(1),
      amount: "12.34",
      currency: "usd",
    });
    assert.equal(created.ok, true, created.reason);
    assert.equal(created.entry.amount, "12.34");
    assert.equal(created.entry.currency, "USD");
    assert.equal(typeof created.entry.amount, "string");
  });

  it("runs draft→submit→approve workflow and locks edits after submit", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      categoryKey: "offerings",
      givingDate: givingDateInMonth(2),
      amount: "100.00",
      currency: "USD",
      reference: "batch-2",
    });
    assert.equal(created.ok, true, created.reason);
    assert.equal(created.entry.status, "draft");

    const edited = await updateGivingEntry(pool, {
      id: created.entry.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      amount: "110.00",
    });
    assert.equal(edited.ok, true, edited.reason);
    assert.equal(edited.entry.amount, "110.00");

    const submitted = await submitGivingEntry(pool, {
      id: created.entry.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(submitted.ok, true, submitted.reason);
    assert.equal(submitted.entry.status, "submitted");

    const locked = await updateGivingEntry(pool, {
      id: created.entry.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      amount: "999.00",
    });
    assert.equal(locked.ok, false);
    assert.equal(locked.status, STATUS.POLICY);

    const approved = await approveGivingEntry(pool, {
      id: created.entry.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
    });
    assert.equal(approved.ok, true, approved.reason);
    assert.equal(approved.entry.status, "approved");
  });

  it("voids instead of deleting; prevents reactivation", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      categoryKey: "missions",
      givingDate: givingDateInMonth(3),
      amount: "50.00",
      currency: "USD",
    });
    assert.equal(created.ok, true, created.reason);

    const voided = await voidGivingEntry(pool, {
      id: created.entry.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      voidReason: "Entered twice",
    });
    assert.equal(voided.ok, true, voided.reason);
    assert.equal(voided.entry.status, "void");
    assert.equal(voided.entry.voidReason, "Entered twice");

    const stillThere = await pool.query(
      `SELECT id, status FROM blessboard.giving_entries WHERE id = $1`,
      [created.entry.id]
    );
    assert.equal(stillThere.rows.length, 1);
    assert.equal(stillThere.rows[0].status, "void");

    await assert.rejects(
      () =>
        pool.query(
          `UPDATE blessboard.giving_entries SET status = 'draft' WHERE id = $1`,
          [created.entry.id]
        ),
      /reactivat/i
    );

    const submitted = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      categoryKey: "building",
      givingDate: givingDateInMonth(3),
      amount: "75.00",
      currency: "USD",
    });
    await submitGivingEntry(pool, {
      id: submitted.entry.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    const branchCannotVoidSubmitted = await voidGivingEntry(pool, {
      id: submitted.entry.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      voidReason: "mistake",
    });
    assert.equal(branchCannotVoidSubmitted.ok, false);
    assert.equal(branchCannotVoidSubmitted.status, STATUS.POLICY);

    const hqVoid = await voidGivingEntry(pool, {
      id: submitted.entry.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      voidReason: "HQ correction",
    });
    assert.equal(hqVoid.ok, true, hqVoid.reason);
    assert.equal(hqVoid.entry.status, "void");
  });

  it("scopes branch admin to assigned branch only", async (t) => {
    if (skipIfNeeded(t)) return;
    const campusTenant = makeTenant(churchA, orgA.records.organization, campusBranch);
    const hqTenant = makeTenant(churchA, orgA.records.organization, branchA);

    const wrong = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: campusAdmin.user.id,
      tenant: campusTenant,
      scopeBranchId: campusBranch.id,
      categoryKey: "tithes",
      givingDate: givingDateInMonth(4),
      amount: "10.00",
      currency: "USD",
    });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.status, STATUS.FORBIDDEN);

    const campus = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      actorUserId: campusAdmin.user.id,
      tenant: campusTenant,
      scopeBranchId: campusBranch.id,
      categoryKey: "tithes",
      givingDate: givingDateInMonth(4),
      amount: "20.00",
      currency: "USD",
    });
    assert.equal(campus.ok, true, campus.reason);

    const branchList = await listGivingEntries(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant: hqTenant,
    });
    assert.equal(branchList.ok, true);
    assert.ok(!branchList.entries.some((e) => e.id === campus.entry.id));

    const churchWideDenied = await listGivingEntries(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: branchAdmin.user.id,
      tenant: hqTenant,
    });
    assert.equal(churchWideDenied.ok, false);
  });

  it("builds monthly summaries from submitted/approved only; excludes draft and void", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);

    const draft = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      categoryKey: "special",
      givingDate: givingDateInMonth(5),
      amount: "1000.00",
      currency: "USD",
    });
    assert.equal(draft.ok, true, draft.reason);

    const voided = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      categoryKey: "other",
      givingDate: givingDateInMonth(5),
      amount: "500.00",
      currency: "USD",
    });
    await voidGivingEntry(pool, {
      id: voided.entry.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      voidReason: "test void",
    });

    // Use EUR so precision assertions are isolated from other USD fixtures in this suite.
    const live = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      categoryKey: "tithes",
      givingDate: givingDateInMonth(5),
      amount: "0.10",
      currency: "EUR",
    });
    await submitGivingEntry(pool, {
      id: live.entry.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });

    const live2 = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      categoryKey: "tithes",
      givingDate: givingDateInMonth(5),
      amount: "0.20",
      currency: "EUR",
    });
    await submitGivingEntry(pool, {
      id: live2.entry.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    await approveGivingEntry(pool, {
      id: live2.entry.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
    });

    const summary = await getMonthlyGivingSummary(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      yearMonth,
      actorUserId: branchAdmin.user.id,
      tenant,
    });
    assert.equal(summary.ok, true, summary.reason);
    assert.deepEqual(summary.summary.sourceStatuses, ["submitted", "approved"]);
    const eur = summary.summary.grandTotalsByCurrency.find((g) => g.currency === "EUR");
    assert.ok(eur);
    // Precision: 0.10 + 0.20 = 0.30 (not float 0.3000000004)
    assert.equal(eur.totalAmount, "0.30");
    assert.ok(!summary.summary.byBranch.some((r) => r.totalAmount === "1000.00"));
    assert.ok(!summary.summary.byBranch.some((r) => r.totalAmount === "500.00"));
    assert.equal(Object.prototype.hasOwnProperty.call(summary.summary, "projectedGrowth"), false);

    const hqSummary = await getMonthlyGivingSummary(pool, {
      churchId: churchA.id,
      branchId: null,
      yearMonth,
      actorUserId: hqAdmin.user.id,
      tenant,
    });
    assert.equal(hqSummary.ok, true, hqSummary.reason);
    assert.ok(hqSummary.summary.churchTotals);
  });

  it("HTTP CSRF-protected create and submit without leaking church UUID", async (t) => {
    if (skipIfNeeded(t)) return;
    const cookie = `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`;
    const list = await request(app)
      .get("/branch-admin/giving")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /Giving/);
    assert.doesNotMatch(list.text, new RegExp(churchA.id, "i"));

    const form = await request(app)
      .get("/branch-admin/giving/new")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(form.status, 200);
    const csrf = extractCookie(form, CSRF_COOKIE);

    const missingCsrf = await request(app)
      .post("/branch-admin/giving")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(cookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        category_key: "tithes",
        giving_date: givingDateInMonth(6),
        amount: "25.00",
        currency: "USD",
      });
    assert.equal(missingCsrf.status, 403);

    const created = await request(app)
      .post("/branch-admin/giving")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(cookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        category_key: "tithes",
        giving_date: givingDateInMonth(6),
        amount: "25.00",
        currency: "USD",
        reference: "http-batch",
      });
    assert.equal(created.status, 303);
    assert.match(created.headers.location, /\/branch-admin\/giving\/[0-9a-f-]{36}/i);
    const entryId = created.headers.location.split("/").pop().split("?")[0];

    const detail = await request(app)
      .get(`/branch-admin/giving/${entryId}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    const csrf2 = extractCookie(detail, CSRF_COOKIE);
    const submitted = await request(app)
      .post(`/branch-admin/giving/${entryId}/submit`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(cookie, `${CSRF_COOKIE}=${csrf2}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrf2 });
    assert.equal(submitted.status, 303);

    const loaded = await getGivingEntry(pool, {
      id: entryId,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant: makeTenant(churchA, orgA.records.organization, branchA),
      scopeBranchId: branchA.id,
    });
    assert.equal(loaded.entry.status, "submitted");

    const hq = await request(app)
      .get("/hq/giving")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`);
    assert.equal(hq.status, 200);
    assert.match(hq.text, /Monthly summary/);
    assert.doesNotMatch(hq.text, new RegExp(churchA.id, "i"));
  });

  it("leaves V4 giving wiring untouched", () => {
    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.doesNotMatch(legacy, /createGivingAdminRouter|givingService/);
    assert.ok(fs.existsSync(path.join(ROOT, "db/postgres/052_church_attendance_giving.sql")));
  });
});

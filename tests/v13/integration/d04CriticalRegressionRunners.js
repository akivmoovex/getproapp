"use strict";

/**
 * D04 critical regression bodies. Callers must skip before invoking these
 * unless disposable database writes are authorized. Each runner checks the
 * disposable URL itself before issuing a query.
 *
 * Host headers below are in-process Supertest routing keys. They do not open
 * a network connection to a production site.
 */

const assert = require("node:assert/strict");
const crypto = require("crypto");
const request = require("supertest");

const {
  assertV13CiDatabaseUrl,
  assertV13CiEnvironmentIdentity,
} = require("../helpers/v13CiDatabaseGuard");
const { cleanupBlessBoardFixtures } = require("../fixtures/v13SyntheticFixtures");
const { CSRF_FIELD } = require("../../../src/platform/http/v5Csrf");
const { createV5FoundationApp } = require("../../../src/platform/http/v5FoundationServer");
const { createV5Session } = require("../../../src/platform/session/createV5Session");
const { DEFAULT_V5_COOKIE } = require("../../../src/platform/session/v5SessionCookie");
const { provisionPlatformTenant } = require("../../../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../../../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../../../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../../../src/blessboard/services/assignBlessBoardRole");
const { peekTestCode } = require("../../../src/blessboard/services/otp/blessBoardOtpService");
const { normalizeRegistrationPhone } = require("../../../src/blessboard/services/normalizeRegistrationPhone");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../../../src/platform/http/moovexPlatformRuntimeServer");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../../../src/platform/config/deploymentProfiles");
const {
  lookupTestingPasswordResetDelivery,
} = require("../../../src/activeclinic/services/activeClinicPasswordRecoveryService");
const {
  clearTestingDeliveries,
} = require("../../../src/platform/auth/passwordRecoveryTestingDelivery");

const BB_DEPLOYMENT = "blessboard-org-staging";
const AC_HOST = "activeclinic.pronline.org";
const CHURCH_HOST = "blessboard.org";
const SESSION_SECRET = "test-session-secret-at-least-32-chars!!";
const MEMBER_OLD_PASSWORD = "V13-Member-Old-9!";
const MEMBER_NEW_PASSWORD = "V13-Member-Recover-9!";
const CLINIC_PASSWORD = "clinic-admin-pass-12";
const CLINIC_NEW_PASSWORD = "Clinic-Recover-13!";

function assertDisposable(connectionString, env) {
  assertV13CiDatabaseUrl(connectionString);
  assertV13CiEnvironmentIdentity(env);
}

function stamp() {
  return `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
}

function absorbCookies(jar, res) {
  const raw = res && res.headers ? res.headers["set-cookie"] : [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    const part = String(line).split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function hidden(html, name) {
  const match = String(html || "").match(new RegExp(`name="${name}" value="([^"]*)"`));
  return match ? match[1] : "";
}

function pathOf(location) {
  const value = String(location || "");
  if (!value) return "";
  if (/^https?:/i.test(value)) {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  }
  return value;
}

function testingEnv(extra) {
  const env = { ...extra };
  delete env.BLESSBOARD_OTP_EXPOSE_TEST_CODE;
  delete env.RESEND_API_KEY;
  delete env.TWILIO_AUTH_TOKEN;
  delete env.TWILIO_ACCOUNT_SID;
  delete env.INFOBIP_API_KEY;
  env.NODE_ENV = "test";
  env.DEPLOYMENT_ENV = "testing";
  env.DATABASE_IDENTITY_ENV = "testing";
  env.BLESSBOARD_OTP_PROVIDER = "test";
  env.SESSION_SECRET = SESSION_SECRET;
  return env;
}

function blessBoardAppEnv() {
  return testingEnv({
    PLATFORM_DEPLOYMENT_CODE: BB_DEPLOYMENT,
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    BLESSBOARD_TENANT_HOST_ALLOWLIST: "*",
    BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED: "0",
  });
}

function clinicAppEnv() {
  return testingEnv({
    PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
  });
}

async function countRows(db, sql, params) {
  const result = await db.query(sql, params);
  return Number(result.rows[0].n);
}

async function provisionChurch(pool, id, host) {
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: id,
    displayName: `D04 ${id}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: id,
    hostname: host,
    domainType: "canonical",
    deploymentCode: BB_DEPLOYMENT,
    isPrimary: true,
  });
  assert.equal(tenant.ok, true, tenant.message || tenant.status);
  const created = await provisionBlessBoardChurch(pool, {
    organizationKey: id,
    churchKey: id,
    displayName: `D04 ${id}`,
    legalName: null,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "Headquarters",
  });
  assert.equal(created.ok, true, created.message || created.status);
  const admin = await createBlessBoardUser(pool, {
    email: `admin.${id}@example.invalid`,
    displayName: "D04 Admin",
    password: MEMBER_OLD_PASSWORD,
  });
  assert.equal(admin.ok, true, admin.message);
  const role = await assignBlessBoardRole(pool, {
    email: admin.user.email,
    organizationKey: id,
    roleKey: "church_hq_admin",
    churchKey: id,
  });
  assert.equal(role.ok, true, role.message || role.status);
  return {
    key: id,
    host,
    organizationId: tenant.records.organization.id,
    churchId: created.records.church.id,
    branchId: created.records.hqBranch.id,
    adminUserId: admin.user.id,
    adminEmail: admin.user.email,
  };
}

async function adminCookie(pool, church) {
  const session = await createV5Session(pool, {
    deploymentCode: BB_DEPLOYMENT,
    userId: church.adminUserId,
    organizationId: church.organizationId,
    churchId: church.churchId,
  });
  assert.equal(session.ok, true, session.message);
  return `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
}

async function withProcessDeployment(code, fn) {
  const previous = process.env.PLATFORM_DEPLOYMENT_CODE;
  process.env.PLATFORM_DEPLOYMENT_CODE = code;
  try {
    return await fn();
  } finally {
    if (previous == null) delete process.env.PLATFORM_DEPLOYMENT_CODE;
    else process.env.PLATFORM_DEPLOYMENT_CODE = previous;
  }
}

async function withChurches(pool, connectionString, env, count, fn) {
  assertDisposable(connectionString, env);
  return withProcessDeployment(BB_DEPLOYMENT, async () => {
  const idBase = `d04${stamp()}`.slice(0, 40);
  const churches = [];
  const app = createV5FoundationApp({
    getPool: () => pool,
    enableDiagnosticHostContext: false,
    env: blessBoardAppEnv(),
  });
  try {
    for (let index = 0; index < count; index += 1) {
      const id = `${idBase}${index}`.slice(0, 48);
      const host = `${id}.local.test`;
      churches.push(await provisionChurch(pool, id, host));
    }
    await fn({ app, churches });
  } finally {
    const ids = churches.map((church) => church.organizationId).filter(Boolean);
    if (ids.length) {
      await pool.query(`DELETE FROM platform.domains WHERE organization_id = ANY($1::uuid[])`, [ids]);
      await pool.query(
        `DELETE FROM blessboard.member_branch_memberships
          WHERE member_id IN (SELECT id FROM blessboard.members WHERE church_id = ANY($1::uuid[]))`,
        [churches.map((church) => church.churchId)]
      ).catch(() => {});
      await pool.query(
        `DELETE FROM blessboard.phone_otp_verifications WHERE organization_id = ANY($1::uuid[])`,
        [ids]
      ).catch(() => {});
    }
    await cleanupBlessBoardFixtures(pool, connectionString, churches, env);
  }
  });
}

function issuedCsrf(res) {
  const jar = absorbCookies({}, res);
  const token = hidden(res.text, CSRF_FIELD);
  const cookieName = Object.keys(jar).find((name) => /csrf/i.test(name));
  const cookieToken = cookieName ? decodeURIComponent(jar[cookieName]) : "";
  assert.ok(cookieToken, "response must set a CSRF cookie");
  assert.ok(token, "response must render a CSRF field");
  assert.equal(cookieToken, token, "CSRF cookie and form field must be the same token");
  return { jar, token, cookieName };
}

async function postMemberForm(app, host, cookie, fields) {
  return request(app)
    .post("/hq/members/new")
    .set("Host", host)
    .set("Cookie", cookie)
    .type("form")
    .send({
      address_line_1: "1 Synthetic Road",
      marital_status: "single",
      next_of_kin_name: "Synthetic Kin",
      next_of_kin_relationship: "sibling",
      next_of_kin_phone: "+260977000199",
      ...fields,
    });
}

async function memberShell(app, host, sessionCookie) {
  const page = await request(app)
    .get("/hq/members/new")
    .set("Host", host)
    .set("Cookie", sessionCookie)
    .set("Accept", "text/html");
  assert.equal(page.status, 200, page.text.slice(0, 240));
  assert.match(page.text, /data-bb-hq-add-member-form="1"/);
  const csrf = issuedCsrf(page);
  const jar = { ...csrf.jar };
  const sessionName = sessionCookie.slice(0, sessionCookie.indexOf("="));
  jar[sessionName] = sessionCookie.slice(sessionName.length + 1);
  return { page, csrf, cookie: cookieHeader(jar) };
}

function assertMandatoryMemberFields(html) {
  assert.match(html, /name="full_name"[^>]*required/);
  assert.match(html, /name="phone"[^>]*required/);
  assert.match(html, /name="branch_id"[^>]*required/);
  assert.match(html, /Portal activation remains pending after creation/);
  const email = html.match(/<input[^>]*name="email"[^>]*>/i);
  assert.ok(email, "email field must be displayed");
  assert.doesNotMatch(email[0], /\brequired\b/);
}

async function confirmMember(app, host, review, sessionCookie) {
  assert.equal(review.status, 200, review.text.slice(0, 240));
  assert.match(review.text, /Review new member/);
  const draft = hidden(review.text, "draft_token");
  assert.ok(draft, "review page must include the draft token");
  const csrf = issuedCsrf(review);
  const sessionName = sessionCookie.slice(0, sessionCookie.indexOf("="));
  csrf.jar[sessionName] = sessionCookie.slice(sessionName.length + 1);
  const confirmed = await request(app)
    .post("/hq/members/new/review")
    .set("Host", host)
    .set("Cookie", cookieHeader(csrf.jar))
    .redirects(0)
    .type("form")
    .send({
      draft_token: draft,
      action: "confirm_create",
      [CSRF_FIELD]: csrf.token,
    });
  assert.equal(confirmed.status, 303, confirmed.text.slice(0, 240));
  assert.match(confirmed.headers.location, /^\/hq\/members\/[0-9a-f-]+\/created$/i);
  return confirmed.headers.location;
}

async function runBbMem01(pool, connectionString, env) {
  await withChurches(pool, connectionString, env, 1, async ({ app, churches }) => {
    const church = churches[0];
    const session = await adminCookie(pool, church);
    const shell = await memberShell(app, church.host, session);
    assertMandatoryMemberFields(shell.page.text);
    const email = `member.${stamp()}@example.invalid`;
    const name = `D04 Member ${stamp()}`;
    const review = await postMemberForm(app, church.host, shell.cookie, {
      full_name: name,
      email,
      phone: `+260977${String(Date.now()).slice(-7)}`,
      branch_id: church.branchId,
      [CSRF_FIELD]: shell.csrf.token,
    });
    const location = await confirmMember(app, church.host, review, session);
    const created = await request(app)
      .get(location)
      .set("Host", church.host)
      .set("Cookie", session)
      .set("Accept", "text/html");
    assert.equal(created.status, 200);
    assert.match(created.text, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(created.text, /not_activated/);
    const directory = await request(app)
      .get("/hq/members")
      .set("Host", church.host)
      .set("Cookie", session)
      .set("Accept", "text/html");
    assert.equal(directory.status, 200);
    assert.match(directory.text, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const memberId = location.match(/\/members\/([^/]+)\/created/)[1];
    const rows = await countRows(
      pool,
      `SELECT count(*)::int AS n FROM blessboard.members WHERE id = $1 AND church_id = $2`,
      [memberId, church.churchId]
    );
    assert.equal(rows, 1);
  });
}

async function runBbMem02(pool, connectionString, env) {
  await withChurches(pool, connectionString, env, 1, async ({ app, churches }) => {
    const church = churches[0];
    const session = await adminCookie(pool, church);
    const shell = await memberShell(app, church.host, session);
    const phone = `+260977${String(Date.now()).slice(-7)}`;
    const deniedEmail = `denied.${stamp()}@example.invalid`;
    const absent = await postMemberForm(app, church.host, session, {
      full_name: "D04 Absent Token",
      email: deniedEmail,
      phone,
      branch_id: church.branchId,
    });
    assert.equal(absent.status, 403);
    assert.match(absent.text, /Invalid or missing CSRF token/);
    const mismatched = await postMemberForm(app, church.host, shell.cookie, {
      full_name: "D04 Invalid Token",
      email: deniedEmail,
      phone,
      branch_id: church.branchId,
      [CSRF_FIELD]: `${shell.csrf.token.slice(0, 12)}mismatch`,
    });
    assert.equal(mismatched.status, 403);
    assert.match(mismatched.text, /Invalid or missing CSRF token/);
    const deniedRows = await countRows(
      pool,
      `SELECT count(*)::int AS n FROM blessboard.members WHERE email_normalized = $1`,
      [deniedEmail.toLowerCase()]
    );
    assert.equal(deniedRows, 0);

    const email = `paired.${stamp()}@example.invalid`;
    const name = `D04 Paired ${stamp()}`;
    const review = await postMemberForm(app, church.host, shell.cookie, {
      full_name: name,
      email,
      phone,
      branch_id: church.branchId,
      [CSRF_FIELD]: shell.csrf.token,
    });
    const location = await confirmMember(app, church.host, review, session);
    const created = await request(app)
      .get(location)
      .set("Host", church.host)
      .set("Cookie", session);
    assert.equal(created.status, 200);
    assert.match(created.text, /not_activated/);
    const pairedRows = await countRows(
      pool,
      `SELECT count(*)::int AS n FROM blessboard.members WHERE email_normalized = $1 AND church_id = $2`,
      [email.toLowerCase(), church.churchId]
    );
    assert.equal(pairedRows, 1);
  });
}

async function recoveryForm(app, host) {
  const page = await request(app)
    .get("/member/forgot-password")
    .set("Host", host)
    .set("Accept", "text/html");
  assert.equal(page.status, 200, page.text.slice(0, 180));
  const csrf = issuedCsrf(page);
  return { page, csrf };
}

async function submitRecovery(app, host, memberNumber) {
  const form = await recoveryForm(app, host);
  const posted = await request(app)
    .post("/member/forgot-password")
    .set("Host", host)
    .set("Cookie", cookieHeader(form.csrf.jar))
    .type("form")
    .send({
      member_number: memberNumber,
      [CSRF_FIELD]: form.csrf.token,
    });
  return posted;
}

async function submitRecoveryCode(app, host, html, code, password) {
  const page = await request(app).get("/member/forgot-password").set("Host", host);
  const csrf = issuedCsrf(page);
  return request(app)
    .post("/member/forgot-password/verify")
    .set("Host", host)
    .set("Cookie", cookieHeader(csrf.jar))
    .type("form")
    .send({
      draft_token: hidden(html, "draft_token"),
      verification_id: hidden(html, "verification_id"),
      code,
      password,
      password_confirm: password,
      [CSRF_FIELD]: csrf.token,
    });
}

async function memberLogin(app, host, memberNumber, password) {
  const page = await request(app).get("/member/login").set("Host", host);
  assert.equal(page.status, 200);
  const csrf = issuedCsrf(page);
  return request(app)
    .post("/member/login")
    .set("Host", host)
    .set("Cookie", cookieHeader(csrf.jar))
    .redirects(0)
    .type("form")
    .send({
      member_number: memberNumber,
      password,
      [CSRF_FIELD]: csrf.token,
    });
}

async function runBbAuth04(pool, connectionString, env) {
  await withChurches(pool, connectionString, env, 1, async ({ app, churches }) => {
    const church = churches[0];
    const session = await adminCookie(pool, church);
    const shell = await memberShell(app, church.host, session);
    const phone = `+260977${String(Date.now()).slice(-7)}`;
    const email = `recover.${stamp()}@example.invalid`;
    const name = `D04 Recover ${stamp()}`;
    const review = await postMemberForm(app, church.host, shell.cookie, {
      full_name: name,
      email,
      phone,
      branch_id: church.branchId,
      [CSRF_FIELD]: shell.csrf.token,
    });
    const location = await confirmMember(app, church.host, review, session);
    const memberId = location.match(/\/members\/([^/]+)\/created/)[1];
    const user = await createBlessBoardUser(pool, {
      email,
      displayName: name,
      password: MEMBER_OLD_PASSWORD,
      phoneNormalized: phone,
    });
    assert.equal(user.ok, true, user.message);
    const linked = await pool.query(
      `UPDATE blessboard.members
          SET user_id = $2,
              portal_access_status = 'active',
              phone_normalized = $3,
              updated_at = now()
        WHERE id = $1
        RETURNING member_number, phone_normalized`,
      [memberId, user.user.id, phone]
    );
    const memberNumber = linked.rows[0] && linked.rows[0].member_number;
    assert.ok(memberNumber, "activated member must have a Church ID");
    assert.equal(linked.rows[0].phone_normalized, phone);

    const wrongCodePage = await submitRecovery(app, church.host, memberNumber);
    assert.equal(wrongCodePage.status, 200);
    const wrongVerification = hidden(wrongCodePage.text, "verification_id");
    const wrongCode = peekTestCode(wrongVerification);
    assert.ok(wrongCode, "testing OTP store must capture the recovery code");
    assert.doesNotMatch(wrongCodePage.text, /data-bb-test-otp/);
    assert.doesNotMatch(wrongCodePage.text, /Test code:/);
    assert.equal(wrongCodePage.text.includes(wrongCode), false);
    const wrong = wrongCode === "000000" ? "111111" : "000000";
    const denied = await submitRecoveryCode(app, church.host, wrongCodePage.text, wrong, MEMBER_NEW_PASSWORD);
    assert.equal(denied.status, 400);
    assert.match(denied.text, /Recovery unsuccessful/);
    assert.doesNotMatch(denied.text, /Password updated/);

    const expiredPage = await submitRecovery(app, church.host, memberNumber);
    const expiredVerification = hidden(expiredPage.text, "verification_id");
    const expiredCode = peekTestCode(expiredVerification);
    assert.ok(expiredCode);
    assert.equal(expiredPage.text.includes(expiredCode), false);
    await pool.query(
      `UPDATE blessboard.phone_otp_verifications
          SET expires_at = now() - interval '5 minutes'
        WHERE id = $1`,
      [expiredVerification]
    );
    const expired = await submitRecoveryCode(
      app,
      church.host,
      expiredPage.text,
      expiredCode,
      MEMBER_NEW_PASSWORD
    );
    assert.equal(expired.status, 400);
    assert.doesNotMatch(expired.text, /Password updated/);
    const unchanged = await memberLogin(app, church.host, memberNumber, MEMBER_NEW_PASSWORD);
    assert.equal(unchanged.status, 401);
    assert.match(unchanged.text, /Member login/);

    const successPage = await submitRecovery(app, church.host, memberNumber);
    const verificationId = hidden(successPage.text, "verification_id");
    const code = peekTestCode(verificationId);
    assert.ok(code);
    assert.equal(successPage.text.includes(code), false);
    assert.doesNotMatch(successPage.text, /data-bb-test-otp/);
    const reset = await submitRecoveryCode(app, church.host, successPage.text, code, MEMBER_NEW_PASSWORD);
    assert.equal(reset.status, 200);
    assert.match(reset.text, /Password updated/);
    const replay = await submitRecoveryCode(app, church.host, successPage.text, code, "V13-Replay-Other-9!");
    assert.equal(replay.status, 400);
    assert.doesNotMatch(replay.text, /Password updated/);

    const loggedIn = await memberLogin(app, church.host, memberNumber, MEMBER_NEW_PASSWORD);
    assert.equal(loggedIn.status, 303);
    assert.equal(pathOf(loggedIn.headers.location), "/member");
    const home = await request(app)
      .get("/member")
      .set("Host", church.host)
      .set("Cookie", cookieHeader(absorbCookies({}, loggedIn)));
    assert.equal(home.status, 200);
    assert.match(home.text, /data-bb-member-dashboard="1"/);
    const oldLogin = await memberLogin(app, church.host, memberNumber, MEMBER_OLD_PASSWORD);
    assert.equal(oldLogin.status, 401);
    assert.doesNotMatch(oldLogin.text, /data-bb-member-dashboard="1"/);
  });
}

async function runBbAnn01(pool, connectionString, env) {
  await withChurches(pool, connectionString, env, 2, async ({ app, churches }) => {
    const [church, other] = churches;
    const session = await adminCookie(pool, church);
    const idPart = stamp();
    const publishedTitle = `D04 public ${idPart}`;
    const draftTitle = `D04 draft ${idPart}`;
    async function createAnnouncement(title, status) {
      const form = await request(app)
        .get("/hq/announcements/new")
        .set("Host", church.host)
        .set("Cookie", session);
      assert.equal(form.status, 200, form.text.slice(0, 200));
      const csrf = issuedCsrf(form);
      const jar = { ...csrf.jar, [DEFAULT_V5_COOKIE]: session.split("=")[1] };
      const created = await request(app)
        .post("/hq/announcements")
        .set("Host", church.host)
        .set("Cookie", cookieHeader(jar))
        .redirects(0)
        .type("form")
        .send({
          title,
          body: "D04 announcement body",
          status,
          audience_public: "1",
          [CSRF_FIELD]: csrf.token,
        });
      assert.equal(created.status, 303, created.text.slice(0, 240));
      const match = String(created.headers.location || "").match(/\/hq\/announcements\/([^/?]+)/);
      assert.ok(match, "create must redirect to the announcement");
      return match[1];
    }
    const draftId = await createAnnouncement(draftTitle, "draft");
    const publishedId = await createAnnouncement(publishedTitle, "draft");
    const before = await request(app).get("/announcements").set("Host", church.host);
    assert.equal(before.status, 200, before.text.slice(0, 200));
    assert.match(before.text, /data-bb-announcements="1"/);
    assert.equal(before.text.includes(publishedTitle), false);
    assert.equal(before.text.includes(draftTitle), false);
    const row = await pool.query(
      `SELECT updated_at FROM blessboard.announcements WHERE id = $1 AND church_id = $2`,
      [publishedId, church.churchId]
    );
    assert.equal(row.rowCount, 1);
    const publishPage = await request(app)
      .get(`/hq/announcements/${publishedId}/publish`)
      .set("Host", church.host)
      .set("Cookie", session);
    assert.equal(publishPage.status, 200);
    const publishCsrf = issuedCsrf(publishPage);
    const publishJar = { ...publishCsrf.jar, [DEFAULT_V5_COOKIE]: session.split("=")[1] };
    const published = await request(app)
      .post(`/hq/announcements/${publishedId}/publish`)
      .set("Host", church.host)
      .set("Cookie", cookieHeader(publishJar))
      .redirects(0)
      .type("form")
      .send({
        confirm_publish: "1",
        publish_mode: "now",
        expected_updated_at: new Date(row.rows[0].updated_at).toISOString(),
        [CSRF_FIELD]: publishCsrf.token,
      });
    assert.equal(published.status, 303);
    assert.match(String(published.headers.location), /saved=published/);
    const after = await request(app).get("/announcements").set("Host", church.host);
    assert.equal(after.status, 200);
    assert.match(after.text, /data-bb-announcements="1"/);
    assert.equal(after.text.includes(publishedTitle), true);
    assert.equal(after.text.includes(draftTitle), false);
    const foreign = await request(app).get("/announcements").set("Host", other.host);
    assert.equal(foreign.status, 200, foreign.text.slice(0, 200));
    assert.equal(foreign.text.includes(publishedTitle), false);
    assert.equal(foreign.text.includes(draftTitle), false);
    const draftStill = await countRows(
      pool,
      `SELECT count(*)::int AS n FROM blessboard.announcements WHERE id = $1 AND status = 'draft'`,
      [draftId]
    );
    assert.equal(draftStill, 1);
  });
}

async function churchRegistrationApp(pool) {
  return createV5FoundationApp({
    getPool: () => pool,
    enableDiagnosticHostContext: false,
    env: testingEnv({
      PLATFORM_DEPLOYMENT_CODE: BB_DEPLOYMENT,
      BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED: "0",
    }),
  });
}

async function postChurch(app, fields) {
  const page = await request(app).get("/register-church").set("Host", CHURCH_HOST);
  assert.equal(page.status, 200, page.text.slice(0, 180));
  const csrf = issuedCsrf(page);
  return request(app)
    .post("/register-church")
    .set("Host", CHURCH_HOST)
    .set("Cookie", cookieHeader(csrf.jar))
    .redirects(0)
    .type("form")
    .send({
      branch_name: "Main Campus",
      country: "Zambia",
      city: "Lusaka",
      role_in_church: "Pastor",
      selected_plan: "growth",
      consent_contact: "on",
      registration_consent: "on",
      [CSRF_FIELD]: csrf.token,
      ...fields,
    });
}

async function runBbReg07(pool, connectionString, env) {
  assertDisposable(connectionString, env);
  return withProcessDeployment(BB_DEPLOYMENT, async () => {
  const app = await churchRegistrationApp(pool);
  const digits = String(Date.now()).slice(-7);
  const compact = `+26097${digits}`;
  const spaced = `+260 97 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  const normalized = normalizeRegistrationPhone(compact);
  assert.equal(normalized.ok, true, normalized.reason || "phone");
  assert.equal(normalizeRegistrationPhone(spaced).normalized, normalized.normalized);
  const storedPhone = normalized.normalized;
  const firstEmail = `d04-church-a-${stamp()}@example.invalid`;
  const secondEmail = `d04-church-b-${stamp()}@example.invalid`;
  const first = await postChurch(app, {
    church_name: "D04 Phone First",
    contact_name: "First",
    phone: compact,
    email: firstEmail,
  });
  assert.equal(first.status, 303, first.text.slice(0, 240));
  const second = await postChurch(app, {
    church_name: "D04 Phone Second",
    contact_name: "Second",
    phone: spaced,
    email: secondEmail,
  });
  assert.equal(second.status, 400, second.text.slice(0, 240));
  assert.match(second.text, /already linked to a BlessBoard church registration/i);
  assert.doesNotMatch(second.text, /23505|contact_phone_normalized|platform_church_reg_apps/i);
  const phoneRows = await countRows(
    pool,
    `SELECT count(*)::int AS n
       FROM blessboard.platform_church_registration_applications
      WHERE contact_phone_normalized = $1`,
    [storedPhone]
  );
  const secondRows = await countRows(
    pool,
    `SELECT count(*)::int AS n
       FROM blessboard.platform_church_registration_applications
      WHERE lower(contact_email) = lower($1)`,
    [secondEmail]
  );
  assert.equal(phoneRows, 1);
  assert.equal(secondRows, 0);
  });
}

async function bootClinicApp(pool) {
  resetDeploymentProfileWarningsForTests();
  const env = clinicAppEnv();
  await pool.query(
    `INSERT INTO platform.deployments (
       deployment_code, application_code, release_version, canonical_domain,
       environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
     ) VALUES (
       $1, 'platform', 'v7', 'local.test',
       'testing', 'active', false, 'read_write', 'moovex_platform_testing_sid'
     )
     ON CONFLICT (deployment_code) DO UPDATE SET
       status = 'active',
       application_code = 'platform',
       session_cookie_name = EXCLUDED.session_cookie_name,
       updated_at = now()`,
    [CODE_MOOVEX_PLATFORM_TESTING]
  );
  const productApps = buildDefaultProductApps({ env, getPool: () => pool });
  return {
    env,
    app: createMoovexPlatformRuntimeApp({ env, getPool: () => pool, productApps }),
  };
}

async function submitClinic(app, payload) {
  const page = await request(app).get("/register-clinic").set("Host", AC_HOST);
  assert.equal(page.status, 200, page.text.slice(0, 180));
  const csrf = issuedCsrf(page);
  const confirm = await request(app)
    .post("/register-clinic")
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(csrf.jar))
    .redirects(0)
    .type("form")
    .send({
      action: "confirm",
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Cairo Road",
      countryCode: "ZM",
      acceptTerms: "on",
      registration_consent: "on",
      [CSRF_FIELD]: csrf.token,
      ...payload,
    });
  return confirm;
}

async function clinicPhoneCount(pool, phone) {
  const digits = String(phone).replace(/\D/g, "");
  return countRows(
    pool,
    `SELECT count(*)::int AS n
       FROM activeclinic.clinic_registration_applications
      WHERE regexp_replace(coalesce(contact_phone_normalized, ''), '[^0-9]', '', 'g') = $1`,
    [digits]
  );
}

async function runAcReg01(pool, connectionString, env) {
  assertDisposable(connectionString, env);
  return withProcessDeployment(CODE_MOOVEX_PLATFORM_TESTING, async () => {
  const { app } = await bootClinicApp(pool);
  const id = stamp();
  const phone = `+26097${String(Date.now()).slice(-7)}`;
  const originalEmail = `d04-clinic-${id}@example.invalid`;
  const deniedEmail = `d04-denied-${id}@example.invalid`;
  const reusedEmail = `d04-reused-${id}@example.invalid`;
  const first = await submitClinic(app, {
    clinicName: `D04 Clinic ${id}`,
    contactName: "D04 Admin",
    contactEmail: originalEmail,
    contactPhone: phone,
    password: CLINIC_PASSWORD,
    passwordConfirm: CLINIC_PASSWORD,
  });
  assert.equal(first.status, 303, first.text.slice(0, 240));
  assert.equal(await clinicPhoneCount(pool, phone), 1);

  const denied = await submitClinic(app, {
    clinicName: `D04 Clinic Denied ${id}`,
    contactName: "D04 Denied",
    contactEmail: deniedEmail,
    contactPhone: phone,
    password: "wrong-password-not-matching",
    passwordConfirm: "wrong-password-not-matching",
  });
  assert.equal(denied.status, 400, denied.text.slice(0, 240));
  assert.match(denied.text, /already registered|already exists|password does not match|email or phone/i);
  assert.equal(await clinicPhoneCount(pool, phone), 1);
  const deniedRows = await countRows(
    pool,
    `SELECT count(*)::int AS n
       FROM activeclinic.clinic_registration_applications
      WHERE lower(contact_email_normalized) = lower($1)`,
    [deniedEmail]
  );
  assert.equal(deniedRows, 0);

  const reused = await submitClinic(app, {
    clinicName: `D04 Clinic Reused ${id}`,
    contactName: "D04 Reused",
    contactEmail: reusedEmail,
    contactPhone: phone,
    password: CLINIC_PASSWORD,
    passwordConfirm: CLINIC_PASSWORD,
  });
  assert.equal(reused.status, 303, reused.text.slice(0, 240));
  assert.match(String(reused.headers.location || ""), /\/app|submitted|status/i);
  assert.equal(await clinicPhoneCount(pool, phone), 2);
  const reusedRows = await countRows(
    pool,
    `SELECT count(*)::int AS n
       FROM activeclinic.clinic_registration_applications
      WHERE lower(contact_email_normalized) = lower($1)`,
    [reusedEmail]
  );
  assert.equal(reusedRows, 1);
  });
}

function resetTokenFrom(url) {
  const match = String(url || "").match(/\/reset-password\/([^/?#]+)/);
  assert.ok(match, "testing outbox must include a reset path");
  return decodeURIComponent(match[1]);
}

async function clinicCsrf(app, route) {
  const page = await request(app).get(route).set("Host", AC_HOST);
  const csrf = issuedCsrf(page);
  return { page, csrf };
}

async function runAcAuth04(pool, connectionString, env) {
  assertDisposable(connectionString, env);
  return withProcessDeployment(CODE_MOOVEX_PLATFORM_TESTING, async () => {
  const { app, env: appEnv } = await bootClinicApp(pool);
  const id = stamp();
  const email = `d04-auth-${id}@example.invalid`;
  const phone = `+26097${String(Date.now()).slice(-7)}`;
  const registered = await submitClinic(app, {
    clinicName: `D04 Auth Clinic ${id}`,
    contactName: "D04 Auth",
    contactEmail: email,
    contactPhone: phone,
    password: CLINIC_PASSWORD,
    passwordConfirm: CLINIC_PASSWORD,
  });
  assert.equal(registered.status, 303, registered.text.slice(0, 240));

  async function login(password) {
    const form = await clinicCsrf(app, "/login");
    return request(app)
      .post("/login")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader(form.csrf.jar))
      .redirects(0)
      .type("form")
      .send({
        identifier: email,
        password,
        [CSRF_FIELD]: form.csrf.token,
      });
  }

  const original = await login(CLINIC_PASSWORD);
  assert.equal(original.status, 303, original.text.slice(0, 200));
  clearTestingDeliveries();
  const forgot = await clinicCsrf(app, "/forgot-password");
  const requested = await request(app)
    .post("/forgot-password")
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(forgot.csrf.jar))
    .redirects(0)
    .type("form")
    .send({
      identifier: email,
      [CSRF_FIELD]: forgot.csrf.token,
    });
  assert.equal(requested.status, 303);
  assert.equal(pathOf(requested.headers.location), "/forgot-password/check");
  const check = await request(app).get("/forgot-password/check").set("Host", AC_HOST);
  assert.equal(check.status, 200);
  assert.match(check.text, /If an eligible ActiveClinic account exists/i);
  const delivery = await lookupTestingPasswordResetDelivery(pool, {
    identifier: email,
    env: appEnv,
    deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
  });
  assert.equal(delivery.ok, true, delivery.code || "outbox missing");
  const token = resetTokenFrom(delivery.resetUrl);
  assert.equal(check.text.includes(token), false);
  assert.equal(check.text.includes("/reset-password/"), false);
  const diagnostic = await request(app)
    .get("/__platform/qa/activeclinic-password-reset-delivery")
    .query({ identifier: email })
    .set("Host", AC_HOST);
  assert.equal(diagnostic.status, 200, JSON.stringify(diagnostic.body));
  assert.equal(String(diagnostic.body.resetUrl || "").includes(token), true);
  assert.equal(check.text.includes(diagnostic.body.resetUrl), false);

  const invalid = await request(app).get("/reset-password/not-a-valid-token").set("Host", AC_HOST);
  assert.doesNotMatch(invalid.text, /Your password has been updated/);
  assert.match(invalid.text, /invalid|expired|unavailable/i);

  const resetForm = await request(app).get(`/reset-password/${encodeURIComponent(token)}`).set("Host", AC_HOST);
  assert.equal(resetForm.status, 200);
  assert.match(resetForm.text, /Reset Password/);
  const resetCsrf = issuedCsrf(resetForm);
  const mismatch = await request(app)
    .post(`/reset-password/${encodeURIComponent(token)}`)
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(resetCsrf.jar))
    .type("form")
    .send({
      password: CLINIC_NEW_PASSWORD,
      password_confirm: "Clinic-Different-13!",
      [CSRF_FIELD]: resetCsrf.token,
    });
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.text, /do not match/);
  assert.equal((await login(CLINIC_NEW_PASSWORD)).status, 401);

  await pool.query(
    `UPDATE platform.identity_action_tokens
        SET created_at = now() - interval '10 minutes',
            expires_at = now() - interval '2 minutes'
      WHERE id = $1`,
    [delivery.tokenId]
  );
  const expiredForm = await request(app).get(`/reset-password/${encodeURIComponent(token)}`).set("Host", AC_HOST);
  assert.equal(expiredForm.status, 400);
  assert.doesNotMatch(expiredForm.text, /Your password has been updated/);
  assert.doesNotMatch(expiredForm.text, /name="password"/);
  assert.equal((await login(CLINIC_NEW_PASSWORD)).status, 401);
  assert.equal((await login(CLINIC_PASSWORD)).status, 303);

  clearTestingDeliveries();
  const again = await clinicCsrf(app, "/forgot-password");
  const requestedAgain = await request(app)
    .post("/forgot-password")
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(again.csrf.jar))
    .redirects(0)
    .type("form")
    .send({ identifier: email, [CSRF_FIELD]: again.csrf.token });
  assert.equal(requestedAgain.status, 303);
  const fresh = await lookupTestingPasswordResetDelivery(pool, {
    identifier: email,
    env: appEnv,
    deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
  });
  assert.equal(fresh.ok, true, fresh.code || "fresh outbox missing");
  const freshToken = resetTokenFrom(fresh.resetUrl);
  const freshForm = await request(app)
    .get(`/reset-password/${encodeURIComponent(freshToken)}`)
    .set("Host", AC_HOST);
  const freshCsrf = issuedCsrf(freshForm);
  const completed = await request(app)
    .post(`/reset-password/${encodeURIComponent(freshToken)}`)
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(freshCsrf.jar))
    .redirects(0)
    .type("form")
    .send({
      password: CLINIC_NEW_PASSWORD,
      password_confirm: CLINIC_NEW_PASSWORD,
      [CSRF_FIELD]: freshCsrf.token,
    });
  assert.equal(completed.status, 303);
  assert.match(pathOf(completed.headers.location), /\/reset-password\/success/);
  const success = await request(app).get("/reset-password/success").set("Host", AC_HOST);
  assert.match(success.text, /Your password has been updated/);
  const replayForm = await request(app)
    .get(`/reset-password/${encodeURIComponent(freshToken)}`)
    .set("Host", AC_HOST);
  assert.equal(replayForm.status, 400);
  assert.doesNotMatch(replayForm.text, /Your password has been updated/);
  assert.doesNotMatch(replayForm.text, /name="password"/);
  assert.equal((await login("Clinic-Replay-Other-13!")).status, 401);

  const loggedIn = await login(CLINIC_NEW_PASSWORD);
  assert.equal(loggedIn.status, 303, loggedIn.text.slice(0, 200));
  const destination = pathOf(loggedIn.headers.location) || "/app";
  const appPage = await request(app)
    .get(destination)
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(absorbCookies({}, loggedIn)));
  assert.equal(appPage.status, 200, appPage.text.slice(0, 200));
  assert.match(appPage.text, /data-ac-shell="staff-app"/);
  assert.doesNotMatch(appPage.text, /data-ac-auth-screen="forgot-password"/);
  const oldLogin = await login(CLINIC_PASSWORD);
  assert.equal(oldLogin.status, 401);
  });
}

module.exports = {
  runAcAuth04,
  runBbAuth04,
  runBbMem02,
  runAcReg01,
  runBbReg07,
  runBbMem01,
  runBbAnn01,
};

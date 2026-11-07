"use strict";

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { expect } = require("@playwright/test");

const STATE_PATH = path.join(__dirname, ".foundation-e2e-state.json");

const TENANT_ZM = 1;
const DOMAIN = "local.test";
const PLATFORM_HOST = process.env.E2E_PLATFORM_HOST || "admin.local.test";
function lifecycleEvent(name, details = {}) {
  const target = process.env.BB_LIFECYCLE_REPORT;
  if (!target) return;
  fs.appendFileSync(
    target,
    `${new Date().toISOString()} ${name} ${JSON.stringify(details)}\n`
  );
}

function safeNavigationUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = parsed.search ? "?[REDACTED]" : "";
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

function tenantHost(hostSlug) {
  return `${hostSlug}.${DOMAIN}`;
}

function foundationFixtureSlug(slugPrefix, retry, fixtureName) {
  const safeFixtureName = String(fixtureName || "fixture")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const suffix = `-r${Number(retry) || 0}-${safeFixtureName}`;
  const prefixLimit = Math.max(1, 40 - suffix.length);
  return `${String(slugPrefix).toLowerCase().slice(0, prefixLimit)}${suffix}`
    .replace(/[^a-z0-9-]/gi, "-")
    .slice(0, 40);
}

function foundationAttemptSlug(slugPrefix, retry) {
  return foundationFixtureSlug(slugPrefix, retry, "main");
}

function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error("Foundation E2E state is missing; global setup did not complete.");
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function writeState(patch) {
  const current = fs.existsSync(STATE_PATH) ? readState() : {};
  const next = { ...current, ...patch };
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
  return next;
}

function uniquePhone(seed) {
  const n = String(Math.abs(Number(seed) || Date.now()) % 1e8).padStart(8, "0");
  return `097${n.slice(0, 7)}`;
}

async function fillAndSubmit(page, submitName) {
  await page.getByRole("button", { name: submitName }).click();
}

async function platformLogin(page, username, password) {
  page.on("request", (request) => {
    lifecycleEvent("BROWSER_REQUEST", {
      method: request.method(),
      url: safeNavigationUrl(request.url()),
    });
  });
  page.on("response", (response) => {
    lifecycleEvent("BROWSER_RESPONSE", {
      status: response.status(),
      url: safeNavigationUrl(response.url()),
      location: response.headers().location || "UNSET",
    });
  });
  page.on("requestfailed", (request) => {
    lifecycleEvent("BROWSER_REQUEST_FAILED", {
      url: safeNavigationUrl(request.url()),
      failure: request.failure()?.errorText || "UNSET",
    });
  });
  lifecycleEvent("T10_ADMIN_LOGIN_NAVIGATION", { url: "/admin/login" });
  await page.goto("/admin/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL(/\/admin\/(dashboard|church|churches)/),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function portalLogin(page, loginPath, identifier, password, expectedPath, options = {}) {
  const diagnostic = options && options.diagnosticLabel ? String(options.diagnosticLabel) : "";
  const observed = [];
  let loginPostPath = loginPath;
  let renderedLoginPath = loginPath;
  const record = (event, details) => {
    if (diagnostic) lifecycleEvent(`${diagnostic}_${event}`, details);
  };
  const onRequest = (request) => {
    const requestPath = new URL(request.url()).pathname;
    if (request.method() === "POST" && requestPath === loginPostPath) {
      observed.push("post-request");
      record("POST_REQUEST", { observed: true, method: "POST", path: loginPostPath });
    }
    if (requestPath === expectedPath) {
      observed.push("dashboard-request");
      record("DASHBOARD_REQUEST", { observed: true, method: request.method(), path: expectedPath });
    }
  };
  const onResponse = (response) => {
    const url = new URL(response.url());
    if (
      diagnostic &&
      (url.pathname === loginPath ||
        url.pathname === renderedLoginPath ||
        url.pathname === loginPostPath ||
        url.pathname === expectedPath)
    ) {
      record("NAV_RESPONSE", {
        method: response.request().method(),
        path: url.pathname,
        status: response.status(),
        location: response.headers().location || "UNSET",
      });
    }
    if (url.pathname === loginPostPath && response.request().method() === "POST") {
      observed.push("post-response");
      record("POST_RESPONSE", {
        observed: true,
        status: response.status(),
        location: response.headers().location || "UNSET",
      });
    }
  };
  if (diagnostic) {
    page.on("request", onRequest);
    page.on("response", onResponse);
  }
  const removeDiagnosticListeners = () => {
    if (!diagnostic) return;
    try {
      page.off("request", onRequest);
      page.off("response", onResponse);
    } catch {
      // Preserve the original Playwright failure if the page is already closed.
    }
  };
  const currentPath = () => {
    try {
      return new URL(page.url()).pathname;
    } catch {
      return "UNAVAILABLE";
    }
  };
  await page.goto(loginPath);
  renderedLoginPath = currentPath();
  const formAction = await page.locator("form").first().getAttribute("action");
  loginPostPath = new URL(formAction || renderedLoginPath, page.url()).pathname;
  record("FORM", {
    pagePath: renderedLoginPath,
    postPath: loginPostPath,
  });
  await page.locator("#identifier").fill(identifier);
  await page.locator("#password").fill(password);
  try {
    await Promise.all([
      page.waitForURL(new RegExp(expectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
      page.getByRole("button", { name: /^(Sign in|Login)$/i }).click(),
    ]);
  } catch (error) {
    if (diagnostic) {
      const alertVisible = await page.getByRole("alert").isVisible().catch(() => false);
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const errorCategory =
        /csrf|token|form token/i.test(bodyText)
          ? "csrf"
          : /incorrect|invalid|unable|sign in/i.test(bodyText)
            ? "login-error"
            : "not-visible";
      record("SUMMARY", {
        postRequestObserved: observed.includes("post-request"),
        postResponseObserved: observed.includes("post-response"),
        finalPath: currentPath(),
        loginErrorVisible: alertVisible,
        loginErrorCategory: alertVisible ? errorCategory : "none",
        dashboardRequested: observed.includes("dashboard-request"),
        redirectedBackToLogin: currentPath() === renderedLoginPath,
      });
    }
    removeDiagnosticListeners();
    throw error;
  }
  if (diagnostic) {
    record("SUMMARY", {
      postRequestObserved: observed.includes("post-request"),
      postResponseObserved: observed.includes("post-response"),
      finalPath: currentPath(),
      loginErrorVisible: false,
      loginErrorCategory: "none",
      dashboardRequested: new URL(page.url()).pathname === expectedPath,
      redirectedBackToLogin: false,
    });
  }
  removeDiagnosticListeners();
}

async function expectDeniedOrGone(response) {
  const status = response.status();
  expect([403, 404]).toContain(status);
}

async function seedSiblingBranchAndLeader(pool, shared, slugPrefix, retry = 0) {
  const suffix = foundationFixtureSlug(slugPrefix, retry, "b2");
  const password = "SiblingBranch_pw_2026!";
  const passwordHash = await bcrypt.hash(password, 12);

  const branchRes = await pool.query(
    `INSERT INTO public.church_branches
       (organization_id, slug, host_slug, name, status, lifecycle_phase, member_registration_enabled)
     VALUES ($1, $2, $3, $4, 'active', 'active', true)
     RETURNING *`,
    [shared.organizationId, `${suffix}-sl`, suffix, `Sibling Branch ${suffix}`]
  );
  const branch = branchRes.rows[0];

  const adminRes = await pool.query(
    `INSERT INTO public.church_branch_admins
       (organization_id, branch_id, full_name, email, username, phone_normalized, password_hash, status, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'branch_admin')
     RETURNING *`,
    [
      shared.organizationId,
      branch.id,
      "Sibling Branch Admin",
      `sib_ba_${suffix}@example.com`,
      `sib_ba_${suffix}`.slice(0, 64),
      uniquePhone(branch.id),
      passwordHash,
    ]
  );

  const ministryRes = await pool.query(
    `INSERT INTO public.church_ministries
       (organization_id, branch_id, name, slug, visibility, status)
     VALUES ($1, $2, $3, $4, 'leaders', 'published')
     RETURNING id`,
    [shared.organizationId, shared.branchId, `E2E Ministry ${suffix}`, `e2e-${suffix}`.slice(0, 40)]
  );

  const leaderRes = await pool.query(
    `INSERT INTO public.church_ministry_leaders
       (organization_id, branch_id, ministry_id, full_name, email, phone, phone_normalized, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ministry_leader', 'active')
     RETURNING *`,
    [
      shared.organizationId,
      shared.branchId,
      ministryRes.rows[0].id,
      "Primary Ministry Leader",
      `leader_${suffix}@example.com`,
      uniquePhone(shared.branchId + 9),
      uniquePhone(shared.branchId + 9),
      passwordHash,
    ]
  );

  return {
    siblingBranch: branch,
    siblingBranchAdmin: { ...adminRes.rows[0], password },
    ministryLeader: { ...leaderRes.rows[0], password },
  };
}

async function seedUnrelatedTenant(pool, slugPrefix, retry = 0) {
  const slug = foundationFixtureSlug(slugPrefix, retry, "other");
  const password = "UnrelatedTenant_pw_2026!";
  const passwordHash = await bcrypt.hash(password, 12);

  const orgRes = await pool.query(
    `INSERT INTO public.church_organizations
       (platform_tenant_id, name, slug, status, plan_code, data_environment)
     VALUES ($1, $2, $3, 'active', 'foundation', 'test')
     RETURNING *`,
    [TENANT_ZM, `Unrelated E2E ${slug}`, slug]
  );
  const org = orgRes.rows[0];
  const branchRes = await pool.query(
    `INSERT INTO public.church_branches
       (organization_id, slug, host_slug, name, status, lifecycle_phase, member_registration_enabled)
     VALUES ($1, $2, $3, $4, 'active', 'active', true)
     RETURNING *`,
    [org.id, "main", slug, "Unrelated Main"]
  );
  const branch = branchRes.rows[0];
  const baRes = await pool.query(
    `INSERT INTO public.church_branch_admins
       (organization_id, branch_id, full_name, email, username, phone_normalized, password_hash, status, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'branch_admin')
     RETURNING *`,
    [
      org.id,
      branch.id,
      "Unrelated BA",
      `other_ba_${slug}@example.com`,
      `other_ba_${slug}`.slice(0, 64),
      uniquePhone(org.id),
      passwordHash,
    ]
  );
  return {
    organization: org,
    branch,
    branchAdmin: { ...baRes.rows[0], password },
    host: tenantHost(slug),
  };
}

async function seedForeignIdorFixtures(pool, slugPrefix, retry = 0) {
  const slug = foundationFixtureSlug(slugPrefix, retry, "fx");
  const passwordHash = await bcrypt.hash("ForeignFixture_pw_2026!", 12);

  const orgRes = await pool.query(
    `INSERT INTO public.church_organizations
       (platform_tenant_id, name, slug, status, plan_code, data_environment)
     VALUES ($1, $2, $3, 'active', 'foundation', 'test')
     RETURNING *`,
    [TENANT_ZM, `Foreign E2E ${slug}`, slug]
  );
  const org = orgRes.rows[0];
  const branchRes = await pool.query(
    `INSERT INTO public.church_branches
       (organization_id, slug, host_slug, name, status, lifecycle_phase, member_registration_enabled)
     VALUES ($1, $2, $3, $4, 'active', 'active', true)
     RETURNING *`,
    [org.id, "main", slug, "Foreign Main"]
  );
  const branch = branchRes.rows[0];

  const memberRes = await pool.query(
    `INSERT INTO public.church_members
       (organization_id, branch_id, platform_tenant_id, full_name, email, phone, phone_normalized,
        password_hash, status, age_group, gender)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7, 'verified', 'Adult (36-60)', 'male')
     RETURNING *`,
    [
      org.id,
      branch.id,
      TENANT_ZM,
      "Foreign Member Secret",
      `foreign_m_${slug}@example.com`,
      uniquePhone(branch.id + 3),
      passwordHash,
    ]
  );

  const annRes = await pool.query(
    `INSERT INTO public.church_announcements
       (organization_id, branch_id, title, body, category, audience, source_type, status, publish_at, published_at)
     VALUES ($1, $2, $3, $4, 'General', 'members', 'branch', 'published', now(), now())
     RETURNING *`,
    [org.id, branch.id, "Foreign Announcement Secret", "Do not leak this foreign body."]
  );

  const attRes = await pool.query(
    `INSERT INTO public.church_announcement_attachments
       (organization_id, branch_id, announcement_id, original_filename, stored_filename, mime_type, file_size)
     VALUES ($1, $2, $3, $4, $5, 'application/pdf', 12)
     RETURNING *`,
    [org.id, branch.id, annRes.rows[0].id, "foreign-secret.pdf", `foreign-${slug}.pdf`]
  );

  const sessionRes = await pool.query(
    `INSERT INTO public.church_attendance_service_sessions
       (organization_id, branch_id, attendance_type, service_name, session_date, status)
     VALUES ($1, $2, 'Sunday service', 'Foreign Service', CURRENT_DATE, 'open')
     RETURNING *`,
    [org.id, branch.id]
  );

  const recordRes = await pool.query(
    `INSERT INTO public.church_attendance_records
       (organization_id, branch_id, service_date, service_label, attendance_type, service_name,
        adults_count, youth_count, children_count, first_time_visitors_count, new_members_count,
        volunteers_count, headcount, notes, status)
     VALUES ($1, $2, CURRENT_DATE, 'Foreign Record', 'Sunday service', 'Foreign Record',
             10, 0, 0, 0, 0, 0, 10, 'foreign-record-secret', 'submitted')
     RETURNING *`,
    [org.id, branch.id]
  );

  const reportRes = await pool.query(
    `INSERT INTO public.church_monthly_reports
       (organization_id, branch_id, period_year, period_month, status, starting_members, ending_members)
     VALUES ($1, $2, 2026, 6, 'submitted', 1, 1)
     RETURNING *`,
    [org.id, branch.id]
  );

  return {
    organization: org,
    branch,
    member: memberRes.rows[0],
    announcement: annRes.rows[0],
    attachment: attRes.rows[0],
    attendanceSession: sessionRes.rows[0],
    attendanceRecord: recordRes.rows[0],
    monthlyReport: reportRes.rows[0],
    secretMarkers: [
      "Foreign Member Secret",
      "Foreign Announcement Secret",
      "Do not leak this foreign body",
      "foreign-record-secret",
      "foreign-secret.pdf",
    ],
  };
}

module.exports = {
  lifecycleEvent,
  STATE_PATH,
  DOMAIN,
  PLATFORM_HOST,
  TENANT_ZM,
  tenantHost,
  foundationFixtureSlug,
  foundationAttemptSlug,
  readState,
  writeState,
  uniquePhone,
  fillAndSubmit,
  platformLogin,
  portalLogin,
  expectDeniedOrGone,
  seedSiblingBranchAndLeader,
  seedUnrelatedTenant,
  seedForeignIdorFixtures,
};

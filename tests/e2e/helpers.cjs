"use strict";

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { expect } = require("@playwright/test");

const STATE_PATH = path.join(__dirname, ".foundation-e2e-state.json");

const TENANT_ZM = 1;
const DOMAIN = "local.test";
const PLATFORM_HOST = process.env.E2E_PLATFORM_HOST || "admin.local.test";

function tenantHost(hostSlug) {
  return `${hostSlug}.${DOMAIN}`;
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
  await page.goto("/admin/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL(/\/admin\/(dashboard|church|churches)/),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function portalLogin(page, loginPath, identifier, password, expectedPath) {
  await page.goto(loginPath);
  await page.locator("#identifier").fill(identifier);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL(new RegExp(expectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
    page.getByRole("button", { name: /^(Sign in|Login)$/i }).click(),
  ]);
}

async function expectDeniedOrGone(response) {
  const status = response.status();
  expect([403, 404]).toContain(status);
}

async function seedSiblingBranchAndLeader(pool, shared, slugPrefix) {
  const suffix = `${slugPrefix}-b2`.replace(/[^a-z0-9-]/gi, "-").slice(0, 40);
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

  const leaderRes = await pool.query(
    `INSERT INTO public.church_ministry_leaders
       (organization_id, branch_id, full_name, email, phone, phone_normalized, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ministry_leader', 'active')
     RETURNING *`,
    [
      shared.organizationId,
      shared.branchId,
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

async function seedUnrelatedTenant(pool, slugPrefix) {
  const slug = `${slugPrefix}-other`.replace(/[^a-z0-9-]/gi, "-").slice(0, 40);
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

async function seedForeignIdorFixtures(pool, slugPrefix) {
  const slug = `${slugPrefix}-fx`.replace(/[^a-z0-9-]/gi, "-").slice(0, 40);
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
  STATE_PATH,
  DOMAIN,
  PLATFORM_HOST,
  TENANT_ZM,
  tenantHost,
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

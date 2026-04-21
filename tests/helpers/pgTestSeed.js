"use strict";

/**
 * PostgreSQL test seed helpers for field-agent / CRM / company flows.
 * Requires a configured pool (see GETPRO_TEST_DB + TEST_DATABASE_URL or DATABASE_URL) and canonical tenants.
 */

const fieldAgentsRepo = require("../../src/db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../../src/db/pg/fieldAgentSubmissionsRepo");
const companiesRepo = require("../../src/db/pg/companiesRepo");
const categoriesRepo = require("../../src/db/pg/categoriesRepo");
const crmTasksRepo = require("../../src/db/pg/crmTasksRepo");
const tenantsRepo = require("../../src/db/pg/tenantsRepo");
const { WEBSITE_LISTING_CRM_SOURCE } = require("../../src/fieldAgent/fieldAgentCrm");
const { TENANT_ZM } = require("../../src/tenants/tenantIds");

function makeSuffix(prefix = "seed") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Idempotent tenant rows (ids 1–8). Required before inserting field agents or companies with tenant FKs.
 * @param {import("pg").Pool} pool
 */
async function ensureCanonicalTenantsForTests(pool) {
  return tenantsRepo.ensureCanonicalTenantsIfMissing(pool);
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} [opts]
 * @param {number} [opts.tenantId]
 * @param {string} [opts.username]
 */
async function seedFieldAgent(pool, opts = {}) {
  const tenantId = opts.tenantId != null ? Number(opts.tenantId) : TENANT_ZM;
  const suffix = opts.suffix || makeSuffix("fa");
  const username = opts.username || `fa_${suffix}`;
  const id = await fieldAgentsRepo.insertAgent(pool, {
    tenantId,
    username,
    passwordHash: opts.passwordHash != null ? String(opts.passwordHash) : "test_hash",
    displayName: opts.displayName != null ? String(opts.displayName) : "",
    phone: opts.phone != null ? String(opts.phone) : "",
  });
  return { id, tenantId, username, suffix };
}

function defaultSubmissionPayload(overrides = {}) {
  const tail = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const phoneNorm = overrides.phoneNorm || `26097${tail}`;
  return {
    phoneRaw: overrides.phoneRaw || phoneNorm,
    phoneNorm,
    whatsappRaw: overrides.whatsappRaw || "",
    whatsappNorm: overrides.whatsappNorm || "",
    firstName: overrides.firstName || "Test",
    lastName: overrides.lastName || "Provider",
    profession: overrides.profession || "Trade",
    city: overrides.city || "Lusaka",
    pacra: overrides.pacra || "",
    addressStreet: overrides.addressStreet || "",
    addressLandmarks: overrides.addressLandmarks || "",
    addressNeighbourhood: overrides.addressNeighbourhood || "",
    addressCity: overrides.addressCity || "Lusaka",
    nrcNumber: overrides.nrcNumber || "NRC",
    photoProfileUrl: overrides.photoProfileUrl || "",
    workPhotosJson: overrides.workPhotosJson || "[]",
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, fieldAgentId: number }} ids
 * @param {object} [payloadOverrides]
 */
async function seedProviderSubmission(pool, ids, payloadOverrides = {}) {
  const p = defaultSubmissionPayload(payloadOverrides);
  const submissionId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
    tenantId: ids.tenantId,
    fieldAgentId: ids.fieldAgentId,
    ...p,
  });
  return { submissionId };
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, submissionId: number, commissionAmount?: number }} p
 */
async function approveSubmission(pool, p) {
  await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
    tenantId: p.tenantId,
    submissionId: p.submissionId,
    commissionAmount: p.commissionAmount != null ? Number(p.commissionAmount) : 0,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, fieldAgentId: number }} ids
 * @param {object} [payloadOverrides]
 */
async function seedApprovedProviderSubmission(pool, ids, payloadOverrides = {}) {
  const { submissionId } = await seedProviderSubmission(pool, ids, payloadOverrides);
  await approveSubmission(pool, { tenantId: ids.tenantId, submissionId });
  return { submissionId };
}

/**
 * Minimal company row for linkage / publish tests. Uses first category for tenant when present.
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   subdomain: string,
 *   name: string,
 *   accountManagerFieldAgentId?: number | null,
 *   sourceFieldAgentSubmissionId?: number | null,
 * }} p
 */
async function seedCompanyMinimal(pool, p) {
  const cats = await categoriesRepo.listByTenantId(pool, p.tenantId);
  const categoryId = cats && cats[0] ? cats[0].id : null;
  const row = await companiesRepo.insertFull(pool, {
    tenantId: p.tenantId,
    subdomain: String(p.subdomain).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40),
    name: p.name,
    categoryId,
    headline: "",
    about: "",
    services: "",
    phone: "",
    email: "",
    location: "",
    featuredCtaLabel: "Call us",
    featuredCtaPhone: "",
    yearsExperience: null,
    serviceAreas: "",
    hoursText: "",
    galleryJson: "[]",
    logoUrl: "",
    accountManagerFieldAgentId: p.accountManagerFieldAgentId != null ? Number(p.accountManagerFieldAgentId) : null,
    sourceFieldAgentSubmissionId:
      p.sourceFieldAgentSubmissionId != null ? Number(p.sourceFieldAgentSubmissionId) : null,
  });
  return row;
}

/**
 * Inbound-style CRM task (same path as provider/callback auto-tasks).
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, title?: string, description?: string, sourceType: string, sourceRefId: number }} p
 */
async function seedCrmInboundTask(pool, p) {
  const id = await crmTasksRepo.insertFromInboundEvent(pool, {
    tenantId: p.tenantId,
    title: p.title || "Test task",
    description: p.description || "",
    sourceType: p.sourceType,
    sourceRefId: p.sourceRefId,
  });
  return { taskId: id };
}

/**
 * Website listing review task (matches fieldAgentCrm source type).
 */
async function seedWebsiteListingReviewTask(pool, { tenantId, submissionId, title, description }) {
  return seedCrmInboundTask(pool, {
    tenantId,
    title: title || "Website listing review",
    description: description || "",
    sourceType: WEBSITE_LISTING_CRM_SOURCE,
    sourceRefId: submissionId,
  });
}

module.exports = {
  makeSuffix,
  ensureCanonicalTenantsForTests,
  seedFieldAgent,
  seedProviderSubmission,
  approveSubmission,
  seedApprovedProviderSubmission,
  seedCompanyMinimal,
  seedCrmInboundTask,
  seedWebsiteListingReviewTask,
  TENANT_ZM,
  WEBSITE_LISTING_CRM_SOURCE,
};

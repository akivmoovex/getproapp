"use strict";

const bcrypt = require("bcryptjs");
const { requireSuperAdmin } = require("../../auth");
const { getPgPool } = require("../../db/pg");
const { TENANT_ZM } = require("../../tenants/tenantIds");
const platformProvisioningRepo = require("../../db/pg/church/platformProvisioningRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const {
  validateProvisioningBody,
  formFromBody,
  churchPublicHost,
  PLAN_CODES,
  validateAddBranchBody,
  addBranchFormFromBody,
  validateUpdateBranchBody,
  updateBranchFormFromBody,
  branchToUpdateForm,
  validateUpdateOrganizationBody,
  updateOrganizationFormFromBody,
  organizationToUpdateForm,
} = require("../../church/platformProvisioningValidation");
const { buildProvisionWelcomePack } = require("../../services/church/provisionWelcomeService");
const { validatePlanUpdateBody } = require("../../church/churchPlanValidation");
const { PLAN_CODES: CHURCH_PLAN_CODES, getPlanDisplay } = require("../../church/churchPlans");
const {
  validateSuspendBody,
  validateArchiveBody,
  validateReactivateBody,
  assertCanSuspendOrganization,
  assertCanArchiveOrganization,
  assertCanReactivateOrganization,
  assertCanSuspendBranch,
  assertCanArchiveBranch,
  assertCanReactivateBranch,
  parseOrganizationStatusFilter,
  parseBranchStatusFilter,
  ORG_BRANCH_STATUSES,
} = require("../../church/platformStatusValidation");
const { statusBadgeClass, statusLabel } = require("../../church/churchStatusAccess");
const {
  BRANCH_ADMIN_ROLES,
  createFormFromBody,
  editFormFromBody,
  adminToEditForm,
  validateCreateBranchAdminBody,
  validateUpdateBranchAdminBody,
  validateResetBranchAdminPasswordBody,
} = require("../../church/platformBranchAdminValidation");
const {
  HQ_ADMIN_ROLES,
  createFormFromBody: hqCreateFormFromBody,
  editFormFromBody: hqEditFormFromBody,
  adminToEditForm: hqAdminToEditForm,
  validateCreateHqAdminBody,
  validateUpdateHqAdminBody,
  validateResetHqAdminPasswordBody,
} = require("../../church/platformHqAdminValidation");
const platformSupportSearchRepo = require("../../db/pg/church/platformSupportSearchRepo");
const {
  parseSupportSearchQuery,
  SEARCH_TYPES,
  SEARCH_STATUSES,
  MIN_SEARCH_LENGTH,
} = require("../../church/platformSupportSearchValidation");
const platformMemberSupportRepo = require("../../db/pg/church/platformMemberSupportRepo");
const platformSupportNotesRepo = require("../../db/pg/church/platformSupportNotesRepo");
const { parseMemberSupportParams } = require("../../church/platformMemberSupportValidation");
const { validateCreateSupportNoteBody } = require("../../church/platformSupportNotesValidation");
const {
  parseSupportNotesSearchQuery,
  ENTITY_TYPES: SUPPORT_NOTE_ENTITY_TYPES,
  MIN_QUERY_LENGTH: SUPPORT_NOTE_MIN_QUERY_LENGTH,
} = require("../../church/platformSupportNotesSearchValidation");
const {
  validateResetMemberPasswordBody,
  validateSuspendMemberBody,
  validateReactivateMemberBody,
  validateVerifyMemberBody,
} = require("../../church/platformMemberSupportActionsValidation");
const { memberStatusLabel } = require("../../church/memberDirectoryValidation");
const { memberRequestStatusLabel } = require("../../church/requestProcessingValidation");
const { joinRequestStatusLabel } = require("../../church/ministryJoinRequestValidation");
const { actionLabel } = require("../../church/auditLogFormatting");
const { getLoginProtectionSummaryForAccount } = require("../../db/pg/church/loginAttemptsRepo");
const platformSecurityRepo = require("../../db/pg/church/platformSecurityRepo");
const branchAdminPasswordResetRequestsRepo = require("../../db/pg/church/branchAdminPasswordResetRequestsRepo");
const hqAdminPasswordResetRequestsRepo = require("../../db/pg/church/hqAdminPasswordResetRequestsRepo");
const platformResetRequestsInboxRepo = require("../../db/pg/church/platformResetRequestsInboxRepo");
const {
  parseSecurityFiltersQuery,
  validateUnlockAccountBody,
  ACCOUNT_TYPES,
  SUCCESS_FILTERS,
  FAILURE_REASONS,
} = require("../../church/platformSecurityValidation");
const { gatherChurchProductionDiagnostics } = require("../../services/church/churchProductionDiagnostics");

function formatDate(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { hour12: false });
}

function securityNotice(req) {
  const notice = String(req.query.notice || "").trim();
  const map = {
    account_unlocked: "Account unlocked successfully.",
  };
  return map[notice] || null;
}

function buildSecurityReturnQuery(filters, notice) {
  const params = new URLSearchParams();
  if (filters.account_type && filters.account_type !== "all") params.set("account_type", filters.account_type);
  if (filters.organization_id) params.set("organization_id", String(filters.organization_id));
  if (filters.branch_id) params.set("branch_id", String(filters.branch_id));
  if (filters.success && filters.success !== "all") params.set("success", filters.success);
  if (filters.failure_reason) params.set("failure_reason", filters.failure_reason);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.limit && filters.limit !== 50) params.set("limit", String(filters.limit));
  if (notice) params.set("notice", notice);
  const qs = params.toString();
  return qs ? `/admin/church/security?${qs}` : "/admin/church/security";
}

function platformAdminId(req) {
  return req.session.adminUser && req.session.adminUser.id ? req.session.adminUser.id : null;
}

function organizationStatusNotice(req) {
  const notice = String(req.query.notice || "").trim();
  const map = {
    suspended: "Organization suspended successfully.",
    reactivated: "Organization reactivated successfully.",
    archived: "Organization archived successfully.",
    updated: "Organization updated successfully.",
    slug_changed:
      "Organization updated. Organization slug changed — internal identity and display links are updated. Branch public URLs use branch host slugs and are unchanged.",
  };
  return map[notice] || null;
}

function branchStatusNotice(req) {
  const notice = String(req.query.notice || "").trim();
  const map = {
    suspended: "Branch suspended successfully.",
    reactivated: "Branch reactivated successfully.",
    archived: "Branch archived successfully.",
    updated: "Branch updated successfully.",
    host_slug_changed:
      "Branch updated. Host slug changed — the public URL has changed. Old links will not redirect automatically.",
  };
  return map[notice] || null;
}

function branchAdminNotice(req) {
  const notice = String(req.query.notice || "").trim();
  const map = {
    created: "Branch admin created. Temporary password was set as entered. Share it securely.",
    updated: "Branch admin updated successfully.",
    activated: "Branch admin activated successfully.",
    deactivated: "Branch admin deactivated successfully.",
    password_reset: "Branch admin password reset successfully.",
  };
  return map[notice] || null;
}

function hqAdminNotice(req) {
  const notice = String(req.query.notice || "").trim();
  const map = {
    created: "HQ admin created. Temporary password was set as entered. Share it securely.",
    updated: "HQ admin updated successfully.",
    activated: "HQ admin activated successfully.",
    deactivated: "HQ admin deactivated successfully.",
    password_reset: "HQ admin password reset successfully.",
  };
  return map[notice] || null;
}

function memberSupportNotice(req) {
  const notice = String(req.query.notice || "").trim();
  const map = {
    password_reset: "Member password reset successfully.",
    suspended: "Member suspended successfully.",
    reactivated: "Member reactivated successfully.",
    verified: "Member verified successfully.",
    already_verified: "Member is already verified.",
    support_note_added: "Platform support note added.",
  };
  return map[notice] || null;
}

function supportNoteNotice(req) {
  if (String(req.query.notice || "").trim() === "support_note_added") {
    return "Platform support note added.";
  }
  return null;
}

function supportNoteError(req, extra) {
  if (extra && extra.supportNoteError) return extra.supportNoteError;
  const raw = String(req.query.support_note_error || "").trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).slice(0, 500);
  } catch {
    return raw.slice(0, 500);
  }
}

async function supportNotesPanelData(pool, entityType, entityId, returnTo) {
  const supportNotes = await platformSupportNotesRepo.listSupportNotesForEntity(pool, entityType, entityId, {
    limit: 20,
  });
  return {
    supportNotes,
    supportNoteEntityType: entityType,
    supportNoteEntityId: entityId,
    supportNoteReturnTo: returnTo,
  };
}

function buildSupportNotesPaginationHref(filters, page) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.entity_type && filters.entity_type !== "all") params.set("entity_type", filters.entity_type);
  if (filters.organization_id) params.set("organization_id", String(filters.organization_id));
  if (filters.branch_id) params.set("branch_id", String(filters.branch_id));
  if (filters.created_by_platform_admin_id) {
    params.set("created_by_platform_admin_id", String(filters.created_by_platform_admin_id));
  }
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.limit) params.set("limit", String(filters.limit));
  params.set("page", String(page));
  return `/admin/church/support-notes?${params.toString()}`;
}

async function enrichSearchWithNoteCounts(pool, search) {
  if (!search.searchRan) return search;
  const entities = [];
  const add = (type, items) => {
    for (const item of items || []) {
      entities.push({ entity_type: type, entity_id: item.id });
    }
  };
  add("organization", search.results.organizations?.items);
  add("branch", search.results.branches?.items);
  add("hq_admin", search.results.hq_admins?.items);
  add("branch_admin", search.results.branch_admins?.items);
  add("member", search.results.members?.items);
  add("ministry_leader", search.results.ministry_leaders?.items);
  const counts = await platformSupportNotesRepo.countSupportNotesByEntity(pool, entities);
  const attach = (type, group) => {
    if (!group || !group.items) return group;
    return {
      ...group,
      items: group.items.map((item) => ({
        ...item,
        support_note_count: counts[`${type}:${item.id}`] || 0,
      })),
    };
  };
  return {
    ...search,
    results: {
      organizations: attach("organization", search.results.organizations),
      branches: attach("branch", search.results.branches),
      hq_admins: attach("hq_admin", search.results.hq_admins),
      branch_admins: attach("branch_admin", search.results.branch_admins),
      members: attach("member", search.results.members),
      ministry_leaders: attach("ministry_leader", search.results.ministry_leaders),
    },
  };
}

async function renderMemberSupportDetail(req, res, extra = {}) {
  const parsed = parseMemberSupportParams(req.params, req.query);
  if (!parsed.ok) {
    return res.status(404).type("text").send("Member not found.");
  }
  const pool = getPgPool();
  const detail = await platformMemberSupportRepo.findMemberSupportDetailById(pool, parsed.data.memberId);
  if (!detail) {
    return res.status(404).type("text").send("Member not found.");
  }
  const hostSlug = branchesRepo.branchHostSlug(detail.branch);
  const memberReturnTo =
    parsed.data.returnTo || `/admin/church/members/${parsed.data.memberId}`;
  const notesPanel = await supportNotesPanelData(pool, "member", parsed.data.memberId, memberReturnTo);
  return res.status(extra.statusCode || 200).render("admin/church/member_support_detail", {
    detail,
    member: detail.member,
    organization: detail.organization,
    branch: detail.branch,
    summary: detail.summary,
    loginContext: detail.loginContext,
    loginProtection: getLoginProtectionSummaryForAccount(detail.member),
    auditLogs: detail.auditLogs || [],
    branchHostSlug: hostSlug,
    returnTo: parsed.data.returnTo,
    flashNotice: memberSupportNotice(req) || extra.flashNotice || null,
    resetError: extra.resetError || null,
    statusActionError: extra.statusActionError || null,
    supportNoteNotice: supportNoteNotice(req) || extra.supportNoteNotice || null,
    supportNoteError: supportNoteError(req, extra),
    ...notesPanel,
    formatDate,
    churchPublicHost,
    getPlanDisplay,
    statusBadgeClass,
    statusLabel,
    memberStatusLabel,
    memberRequestStatusLabel,
    joinRequestStatusLabel,
    actionLabel,
    activeNav: "church_platform_search",
  });
}

async function renderOrganizationDetail(req, res, extra) {
  const organizationId = Number(req.params.organizationId);
  const pool = getPgPool();
  const detail = await platformProvisioningRepo.getOrganizationDetail(pool, organizationId);
  if (!detail) {
    return res.status(404).type("text").send("Organization not found.");
  }
  const planSummary = await platformProvisioningRepo.getOrganizationPlanSummary(pool, organizationId);
  const activeHqAdminCount = await platformProvisioningRepo.countActiveHqAdminsForOrganization(pool, organizationId);
  const hqLoginHostSlug = await platformProvisioningRepo.getExampleBranchHostSlugForOrganization(pool, organizationId);
  const primaryHqAdmin =
    detail.hqAdmins && detail.hqAdmins.length > 0
      ? detail.hqAdmins.find((a) => a.status === "active") || detail.hqAdmins[0]
      : null;
  const orgReturnTo = `/admin/church/organizations/${organizationId}`;
  const notesPanel = await supportNotesPanelData(pool, "organization", organizationId, orgReturnTo);
  let welcomePack = null;
  const provisioned = String(req.query.provisioned || "") === "1";
  if (
    provisioned &&
    req.session &&
    req.session.churchProvisionWelcome &&
    Number(req.session.churchProvisionWelcome.organizationId) === organizationId
  ) {
    welcomePack = req.session.churchProvisionWelcome.pack;
    delete req.session.churchProvisionWelcome;
  }
  return res.status(extra && extra.statusCode ? extra.statusCode : 200).render("admin/church/organization_detail", {
    organization: detail.organization,
    branches: detail.branches,
    hqAdmins: detail.hqAdmins,
    primaryHqAdmin,
    activeHqAdminCount,
    hqLoginHostSlug,
    planSummary,
    formatDate,
    churchPublicHost,
    getPlanDisplay,
    provisioned,
    welcomePack,
    statusNotice: organizationStatusNotice(req),
    statusError: (extra && extra.statusError) || null,
    supportNoteNotice: supportNoteNotice(req) || (extra && extra.supportNoteNotice) || null,
    supportNoteError: supportNoteError(req, extra),
    ...notesPanel,
    statusBadgeClass,
    statusLabel,
    orgBranchStatuses: ORG_BRANCH_STATUSES,
    activeNav: "church_platform_orgs",
  });
}

async function renderBranchDetail(req, res, extra) {
  const branchId = Number(req.params.branchId);
  const pool = getPgPool();
  const detail = await platformProvisioningRepo.getBranchPlatformDetail(pool, branchId);
  if (!detail) {
    return res.status(404).type("text").send("Branch not found.");
  }
  const planSummary = await platformProvisioningRepo.getOrganizationPlanSummary(pool, detail.branch.organization_id);
  const branchReturnTo = `/admin/church/branches/${branchId}`;
  const notesPanel = await supportNotesPanelData(pool, "branch", branchId, branchReturnTo);
  return res.status(extra && extra.statusCode ? extra.statusCode : 200).render("admin/church/branch_detail", {
    branch: detail.branch,
    branchAdmin: detail.branchAdmin,
    usage: detail.usage,
    planSummary,
    branchHostSlug: detail.branchHostSlug,
    activeAdminCount: detail.activeAdminCount,
    formatDate,
    churchPublicHost,
    created: String(req.query.created || "") === "1",
    flashNotice: branchStatusNotice(req),
    statusError: (extra && extra.statusError) || null,
    supportNoteNotice: supportNoteNotice(req) || (extra && extra.supportNoteNotice) || null,
    supportNoteError: supportNoteError(req, extra),
    ...notesPanel,
    statusBadgeClass,
    statusLabel,
    orgBranchStatuses: ORG_BRANCH_STATUSES,
    activeNav: "church_platform_branches",
  });
}

async function renderBranchEdit(req, res, extra) {
  const branchId = Number(req.params.branchId);
  const pool = getPgPool();
  const branch = await platformProvisioningRepo.findBranchByIdForPlatform(pool, branchId);
  if (!branch) {
    return res.status(404).type("text").send("Branch not found.");
  }
  const organizationId = Number(req.params.organizationId);
  if (Number.isFinite(organizationId) && organizationId > 0 && branch.organization_id !== organizationId) {
    return res.status(404).type("text").send("Branch not found.");
  }
  const hostSlug = branchesRepo.branchHostSlug(branch);
  return res.status(extra && extra.statusCode ? extra.statusCode : 200).render("admin/church/branch_edit", {
    branch,
    form: (extra && extra.form) || branchToUpdateForm(branch),
    error: (extra && extra.error) || null,
    currentHostSlug: hostSlug,
    formatDate,
    churchPublicHost,
    statusBadgeClass,
    statusLabel,
    activeNav: "church_platform_branches",
  });
}

async function loadBranchForAdminRoutes(pool, branchId) {
  const id = Number(branchId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return platformProvisioningRepo.findChurchBranchById(pool, id);
}

async function renderBranchAdminsList(req, res, extra) {
  const branchId = Number(req.params.branchId);
  const pool = getPgPool();
  const branch = await loadBranchForAdminRoutes(pool, branchId);
  if (!branch) {
    return res.status(404).type("text").send("Branch not found.");
  }
  const admins = await platformProvisioningRepo.listBranchAdminsForBranch(pool, branchId);
  const activeAdminCount = await platformProvisioningRepo.countActiveBranchAdminsForBranch(pool, branchId);
  const hostSlug = branchesRepo.branchHostSlug(branch);
  return res.status(extra && extra.statusCode ? extra.statusCode : 200).render("admin/church/branch_admins", {
    branch,
    admins,
    activeAdminCount,
    branchHostSlug: hostSlug,
    flashNotice: branchAdminNotice(req),
    error: (extra && extra.error) || null,
    formatDate,
    churchPublicHost,
    statusBadgeClass,
    statusLabel,
    activeNav: "church_platform_branches",
  });
}

async function renderBranchAdminForm(req, res, extra) {
  const branchId = Number(req.params.branchId);
  const pool = getPgPool();
  const branch = await loadBranchForAdminRoutes(pool, branchId);
  if (!branch) {
    return res.status(404).type("text").send("Branch not found.");
  }
  const mode = extra && extra.mode ? extra.mode : "create";
  const admin = extra && extra.admin ? extra.admin : null;
  return res.status(extra && extra.statusCode ? extra.statusCode : 200).render("admin/church/branch_admin_form", {
    branch,
    mode,
    admin,
    form: (extra && extra.form) || (mode === "edit" && admin ? adminToEditForm(admin) : createFormFromBody({})),
    error: (extra && extra.error) || null,
    branchAdminRoles: BRANCH_ADMIN_ROLES,
    formatDate,
    activeNav: "church_platform_branches",
  });
}

async function renderBranchAdminDetail(req, res, extra) {
  const branchId = Number(req.params.branchId);
  const adminId = Number(req.params.adminId);
  const pool = getPgPool();
  const admin = await platformProvisioningRepo.findBranchAdminByIdForPlatform(pool, adminId, branchId);
  if (!admin) {
    return res.status(404).type("text").send("Branch admin not found.");
  }
  const hostSlug = branchesRepo.branchHostSlug(admin);
  const adminReturnTo = `/admin/church/branches/${branchId}/admins/${adminId}`;
  const notesPanel = await supportNotesPanelData(pool, "branch_admin", adminId, adminReturnTo);
  return res.status(extra && extra.statusCode ? extra.statusCode : 200).render("admin/church/branch_admin_detail", {
    branch: {
      id: admin.branch_id,
      name: admin.branch_name,
      organization_id: admin.organization_id,
      organization_name: admin.organization_name,
    },
    admin,
    loginProtection: getLoginProtectionSummaryForAccount(admin),
    branchHostSlug: hostSlug,
    flashNotice: branchAdminNotice(req),
    resetError: (extra && extra.resetError) || null,
    supportNoteNotice: supportNoteNotice(req) || (extra && extra.supportNoteNotice) || null,
    supportNoteError: supportNoteError(req, extra),
    ...notesPanel,
    formatDate,
    churchPublicHost,
    statusBadgeClass,
    statusLabel,
    activeNav: "church_platform_branches",
  });
}

async function renderOrganizationEdit(req, res, extra) {
  const organizationId = Number(req.params.organizationId);
  const pool = getPgPool();
  const organization = await platformProvisioningRepo.findOrganizationByIdForPlatform(pool, organizationId);
  if (!organization) {
    return res.status(404).type("text").send("Organization not found.");
  }
  const planSummary = await platformProvisioningRepo.getOrganizationPlanSummary(pool, organizationId);
  const currentSlug = String(organization.slug || "").trim().toLowerCase();
  return res.status(extra && extra.statusCode ? extra.statusCode : 200).render("admin/church/organization_edit", {
    organization,
    planSummary,
    form: (extra && extra.form) || organizationToUpdateForm(organization),
    error: (extra && extra.error) || null,
    currentSlug,
    formatDate,
    churchPublicHost,
    getPlanDisplay,
    statusBadgeClass,
    statusLabel,
    activeNav: "church_platform_orgs",
  });
}

async function loadOrganizationForAdminRoutes(pool, organizationId) {
  const id = Number(organizationId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return platformProvisioningRepo.findChurchOrganizationById(pool, id);
}

async function renderHqAdminsList(req, res, extra) {
  const organizationId = Number(req.params.organizationId);
  const pool = getPgPool();
  const organization = await loadOrganizationForAdminRoutes(pool, organizationId);
  if (!organization) {
    return res.status(404).type("text").send("Organization not found.");
  }
  const admins = await platformProvisioningRepo.listHqAdminsForOrganization(pool, organizationId);
  const activeHqAdminCount = await platformProvisioningRepo.countActiveHqAdminsForOrganization(pool, organizationId);
  const hqLoginHostSlug = await platformProvisioningRepo.getExampleBranchHostSlugForOrganization(pool, organizationId);
  return res.status(extra && extra.statusCode ? extra.statusCode : 200).render("admin/church/hq_admins", {
    organization,
    admins,
    activeHqAdminCount,
    hqLoginHostSlug,
    flashNotice: hqAdminNotice(req),
    error: (extra && extra.error) || null,
    formatDate,
    churchPublicHost,
    statusBadgeClass,
    statusLabel,
    activeNav: "church_platform_orgs",
  });
}

async function renderHqAdminForm(req, res, extra) {
  const organizationId = Number(req.params.organizationId);
  const pool = getPgPool();
  const organization = await loadOrganizationForAdminRoutes(pool, organizationId);
  if (!organization) {
    return res.status(404).type("text").send("Organization not found.");
  }
  const mode = extra && extra.mode ? extra.mode : "create";
  const admin = extra && extra.admin ? extra.admin : null;
  return res.status(extra && extra.statusCode ? extra.statusCode : 200).render("admin/church/hq_admin_form", {
    organization,
    mode,
    admin,
    form:
      (extra && extra.form) ||
      (mode === "edit" && admin ? hqAdminToEditForm(admin) : hqCreateFormFromBody({})),
    error: (extra && extra.error) || null,
    hqAdminRoles: HQ_ADMIN_ROLES,
    formatDate,
    activeNav: "church_platform_orgs",
  });
}

async function renderHqAdminDetail(req, res, extra) {
  const organizationId = Number(req.params.organizationId);
  const adminId = Number(req.params.adminId);
  const pool = getPgPool();
  const admin = await platformProvisioningRepo.findHqAdminByIdForPlatform(pool, adminId, organizationId);
  if (!admin) {
    return res.status(404).type("text").send("HQ admin not found.");
  }
  const hqLoginHostSlug = await platformProvisioningRepo.getExampleBranchHostSlugForOrganization(pool, organizationId);
  const hqReturnTo = `/admin/church/organizations/${organizationId}/hq-admins/${adminId}`;
  const notesPanel = await supportNotesPanelData(pool, "hq_admin", adminId, hqReturnTo);
  return res.status(extra && extra.statusCode ? extra.statusCode : 200).render("admin/church/hq_admin_detail", {
    organization: {
      id: admin.organization_id,
      name: admin.organization_name,
      status: admin.organization_status,
    },
    admin,
    loginProtection: getLoginProtectionSummaryForAccount(admin),
    hqLoginHostSlug,
    flashNotice: hqAdminNotice(req),
    resetError: (extra && extra.resetError) || null,
    supportNoteNotice: supportNoteNotice(req) || (extra && extra.supportNoteNotice) || null,
    supportNoteError: supportNoteError(req, extra),
    ...notesPanel,
    formatDate,
    churchPublicHost,
    statusBadgeClass,
    statusLabel,
    activeNav: "church_platform_orgs",
  });
}

module.exports = function registerAdminChurchPlatformRoutes(router) {
  /**
   * Platform church provisioning — super admin only (`requireSuperAdmin` → `canAccessSuperConsole`).
   * Not exposed on branch church hosts, member portal, branch admin, or HQ portal.
   */
  router.get("/church", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const [summary, recentSupportNotes, securitySummary, branchAdminPasswordResetCounts, hqAdminPasswordResetCounts, unifiedResetSummary] =
        await Promise.all([
        platformProvisioningRepo.getProvisioningSummary(pool),
        platformSupportNotesRepo.listRecentSupportNotes(pool, { limit: 5 }),
        platformSecurityRepo.getSecuritySummary(pool),
        branchAdminPasswordResetRequestsRepo.countBranchAdminPasswordResetRequestsByStatus(pool),
        hqAdminPasswordResetRequestsRepo.countHqAdminPasswordResetRequestsByStatus(pool),
        platformResetRequestsInboxRepo.getUnifiedResetRequestSummary(pool),
      ]);
      res.render("admin/church/dashboard", {
        summary,
        recentSupportNotes,
        securitySummary,
        branchAdminPasswordResetCounts,
        hqAdminPasswordResetCounts,
        unifiedResetSummary,
        formatDate,
        getPlanDisplay,
        activeNav: "church_platform",
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/diagnostics", requireSuperAdmin, async (req, res, next) => {
    try {
      const diagnostics = await gatherChurchProductionDiagnostics();
      res.render("admin/church/diagnostics", {
        diagnostics,
        activeNav: "church_platform_diagnostics",
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/search", requireSuperAdmin, async (req, res, next) => {
    try {
      const parsed = parseSupportSearchQuery(req.query);
      const pool = getPgPool();
      const filters = parsed.ok
        ? parsed.data
        : { q: String(req.query.q || "").trim().slice(0, 100), type: "all", status: "all", limit: 10 };
      const searchRaw = await platformSupportSearchRepo.searchChurchPlatformSupport(pool, filters);
      const search = await enrichSearchWithNoteCounts(pool, searchRaw);
      res.render("admin/church/search", {
        search,
        filters,
        validationErrors: parsed.ok ? [] : parsed.errors,
        searchTypes: SEARCH_TYPES,
        searchStatuses: SEARCH_STATUSES,
        minSearchLength: MIN_SEARCH_LENGTH,
        formatDate,
        churchPublicHost,
        getPlanDisplay,
        statusBadgeClass,
        statusLabel,
        activeNav: "church_platform_search",
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/members/:memberId", requireSuperAdmin, async (req, res, next) => {
    try {
      return renderMemberSupportDetail(req, res);
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/support-notes", requireSuperAdmin, async (req, res, next) => {
    try {
      const parsed = parseSupportNotesSearchQuery(req.query);
      const pool = getPgPool();
      const filters = parsed.ok
        ? parsed.data
        : {
            q: String(req.query.q || "").trim().slice(0, 100),
            entity_type: "all",
            organization_id: null,
            branch_id: null,
            created_by_platform_admin_id: null,
            date_from: null,
            date_to: null,
            page: 1,
            limit: 50,
          };
      const results = parsed.ok
        ? await platformSupportNotesRepo.searchSupportNotes(pool, filters)
        : { items: [], total: 0, page: filters.page, limit: filters.limit, totalPages: 0 };

      return res.render("admin/church/support_notes", {
        filters,
        results,
        validationErrors: parsed.ok ? [] : parsed.errors,
        entityTypes: SUPPORT_NOTE_ENTITY_TYPES,
        minQueryLength: SUPPORT_NOTE_MIN_QUERY_LENGTH,
        formatDate,
        paginationPrevHref: buildSupportNotesPaginationHref(filters, Math.max(1, results.page - 1)),
        paginationNextHref: buildSupportNotesPaginationHref(filters, results.page + 1),
        activeNav: "church_platform_support_notes",
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/support-notes", requireSuperAdmin, async (req, res, next) => {
    try {
      const validation = validateCreateSupportNoteBody(req.body);
      const pool = getPgPool();

      if (!validation.ok) {
        const resolved =
          validation.data && validation.data.entity_type && validation.data.entity_id
            ? await platformSupportNotesRepo.resolveSupportNoteEntity(
                pool,
                validation.data.entity_type,
                validation.data.entity_id
              )
            : null;
        const defaultTo = resolved
          ? platformSupportNotesRepo.defaultReturnToForEntity(resolved)
          : "/admin/church";
        const returnTo = (validation.data && validation.data.return_to) || defaultTo;
        const sep = returnTo.includes("?") ? "&" : "?";
        return res.redirect(`${returnTo}${sep}support_note_error=${encodeURIComponent(validation.errors.join(" "))}`);
      }

      let created;
      try {
        created = await platformSupportNotesRepo.createSupportNote(pool, validation.data, platformAdminId(req));
      } catch (err) {
        if (err.code === "NOT_FOUND") {
          return res.status(404).type("text").send("Entity not found.");
        }
        throw err;
      }

      const redirectTo =
        validation.data.return_to || platformSupportNotesRepo.defaultReturnToForEntity(created.resolved);
      const sep = redirectTo.includes("?") ? "&" : "?";
      return res.redirect(`${redirectTo}${sep}notice=support_note_added`);
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/security", requireSuperAdmin, async (req, res, next) => {
    try {
      const parsed = parseSecurityFiltersQuery(req.query);
      const pool = getPgPool();
      const filters = parsed.ok
        ? parsed.data
        : {
            account_type: "all",
            organization_id: null,
            branch_id: null,
            success: "all",
            failure_reason: null,
            date_from: null,
            date_to: null,
            page: 1,
            limit: 50,
          };

      const [securitySummary, lockedAccounts, loginAttempts] = await Promise.all([
        platformSecurityRepo.getSecuritySummary(pool),
        platformSecurityRepo.listLockedAccounts(pool, filters),
        platformSecurityRepo.listRecentLoginAttempts(pool, filters),
      ]);

      return res.render("admin/church/security", {
        securitySummary,
        lockedAccounts,
        loginAttempts,
        filters,
        validationErrors: parsed.ok ? [] : parsed.errors,
        accountTypes: ACCOUNT_TYPES,
        successFilters: SUCCESS_FILTERS,
        failureReasons: FAILURE_REASONS,
        flashNotice: securityNotice(req),
        formatDate,
        formatDateTime,
        buildSecurityReturnQuery,
        activeNav: "church_platform_security",
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/security/unlock", requireSuperAdmin, async (req, res, next) => {
    try {
      const parsedFilters = parseSecurityFiltersQuery(req.query);
      const filters = parsedFilters.ok
        ? parsedFilters.data
        : {
            account_type: "all",
            organization_id: null,
            branch_id: null,
            success: "all",
            failure_reason: null,
            date_from: null,
            date_to: null,
            page: 1,
            limit: 50,
          };
      const validation = validateUnlockAccountBody(req.body);
      if (!validation.ok) {
        return res.status(400).render("admin/church/security", {
          securitySummary: await platformSecurityRepo.getSecuritySummary(getPgPool()),
          lockedAccounts: await platformSecurityRepo.listLockedAccounts(getPgPool(), filters),
          loginAttempts: await platformSecurityRepo.listRecentLoginAttempts(getPgPool(), filters),
          filters,
          validationErrors: validation.errors,
          accountTypes: ACCOUNT_TYPES,
          successFilters: SUCCESS_FILTERS,
          failureReasons: FAILURE_REASONS,
          flashNotice: null,
          formatDate,
          formatDateTime,
          buildSecurityReturnQuery,
          activeNav: "church_platform_security",
        });
      }

      const pool = getPgPool();
      try {
        await platformSecurityRepo.unlockAccountForPlatform(
          pool,
          validation.data.account_type,
          validation.data.account_id,
          platformAdminId(req),
          validation.data.reason
        );
      } catch (err) {
        if (err.code === "NOT_FOUND") {
          return res.status(404).type("text").send("Account not found.");
        }
        if (err.code === "INVALID_ACCOUNT_TYPE") {
          return res.status(400).type("text").send("Invalid account type.");
        }
        throw err;
      }

      return res.redirect(buildSecurityReturnQuery(filters, "account_unlocked"));
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/members/:memberId/reset-password", requireSuperAdmin, async (req, res, next) => {
    try {
      const memberId = Number(req.params.memberId);
      if (!Number.isFinite(memberId) || memberId <= 0) {
        return res.status(404).type("text").send("Member not found.");
      }
      const pool = getPgPool();
      const member = await platformMemberSupportRepo.findMemberForPlatformAction(pool, memberId);
      if (!member) {
        return res.status(404).type("text").send("Member not found.");
      }

      const validation = validateResetMemberPasswordBody(req.body);
      if (!validation.ok) {
        return renderMemberSupportDetail(req, res, { statusCode: 400, resetError: validation.error });
      }

      const passwordHash = await bcrypt.hash(validation.new_password, 12);
      await platformMemberSupportRepo.resetMemberPasswordForPlatform(
        pool,
        memberId,
        passwordHash,
        platformAdminId(req)
      );

      return res.redirect(`/admin/church/members/${memberId}?notice=password_reset`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/members/:memberId/suspend", requireSuperAdmin, async (req, res, next) => {
    try {
      const memberId = Number(req.params.memberId);
      if (!Number.isFinite(memberId) || memberId <= 0) {
        return res.status(404).type("text").send("Member not found.");
      }
      const pool = getPgPool();
      const member = await platformMemberSupportRepo.findMemberForPlatformAction(pool, memberId);
      if (!member) {
        return res.status(404).type("text").send("Member not found.");
      }

      const validation = validateSuspendMemberBody(req.body);
      if (!validation.ok) {
        return renderMemberSupportDetail(req, res, { statusCode: 400, statusActionError: validation.error });
      }

      try {
        await platformMemberSupportRepo.suspendMemberForPlatform(
          pool,
          memberId,
          validation.reason,
          platformAdminId(req)
        );
      } catch (err) {
        if (err.code === "INVALID_STATUS") {
          return renderMemberSupportDetail(req, res, { statusCode: 400, statusActionError: err.message });
        }
        throw err;
      }

      return res.redirect(`/admin/church/members/${memberId}?notice=suspended`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/members/:memberId/reactivate", requireSuperAdmin, async (req, res, next) => {
    try {
      const memberId = Number(req.params.memberId);
      if (!Number.isFinite(memberId) || memberId <= 0) {
        return res.status(404).type("text").send("Member not found.");
      }
      const pool = getPgPool();
      const member = await platformMemberSupportRepo.findMemberForPlatformAction(pool, memberId);
      if (!member) {
        return res.status(404).type("text").send("Member not found.");
      }

      const validation = validateReactivateMemberBody(req.body);
      if (!validation.ok) {
        return renderMemberSupportDetail(req, res, { statusCode: 400, statusActionError: validation.error });
      }

      try {
        await platformMemberSupportRepo.reactivateMemberForPlatform(
          pool,
          memberId,
          validation.reason,
          platformAdminId(req)
        );
      } catch (err) {
        if (err.code === "INVALID_STATUS") {
          return renderMemberSupportDetail(req, res, { statusCode: 400, statusActionError: err.message });
        }
        throw err;
      }

      return res.redirect(`/admin/church/members/${memberId}?notice=reactivated`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/members/:memberId/verify", requireSuperAdmin, async (req, res, next) => {
    try {
      const memberId = Number(req.params.memberId);
      if (!Number.isFinite(memberId) || memberId <= 0) {
        return res.status(404).type("text").send("Member not found.");
      }
      const pool = getPgPool();
      const member = await platformMemberSupportRepo.findMemberForPlatformAction(pool, memberId);
      if (!member) {
        return res.status(404).type("text").send("Member not found.");
      }

      const validation = validateVerifyMemberBody(req.body, member.status);
      if (!validation.ok) {
        if (member.status === "verified") {
          return res.redirect(`/admin/church/members/${memberId}?notice=already_verified`);
        }
        return renderMemberSupportDetail(req, res, { statusCode: 400, statusActionError: validation.error });
      }

      try {
        await platformMemberSupportRepo.verifyMemberForPlatform(
          pool,
          memberId,
          validation.reason,
          platformAdminId(req)
        );
      } catch (err) {
        if (err.code === "ALREADY_VERIFIED") {
          return res.redirect(`/admin/church/members/${memberId}?notice=already_verified`);
        }
        if (err.code === "INVALID_STATUS") {
          return renderMemberSupportDetail(req, res, { statusCode: 400, statusActionError: err.message });
        }
        throw err;
      }

      return res.redirect(`/admin/church/members/${memberId}?notice=verified`);
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/organizations", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const q = String(req.query.q || "").trim();
      const statusFilter = parseOrganizationStatusFilter(req.query.status);
      const organizations = await platformProvisioningRepo.listOrganizationsWithStatusSummary(pool, {
        q,
        status: statusFilter,
      });
      res.render("admin/church/organizations", {
        organizations,
        q,
        statusFilter,
        orgBranchStatuses: ORG_BRANCH_STATUSES,
        formatDate,
        getPlanDisplay,
        statusBadgeClass,
        statusLabel,
        activeNav: "church_platform_orgs",
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/branches/new", requireSuperAdmin, (req, res) => {
    res.redirect("/admin/church/organizations/new");
  });

  router.get("/church/organizations/new", requireSuperAdmin, (req, res) => {
    res.render("admin/church/organization_form", {
      form: formFromBody({}),
      error: null,
      planCodes: PLAN_CODES,
      churchPublicHost,
      activeNav: "church_platform_orgs",
    });
  });

  router.post("/church/organizations", requireSuperAdmin, async (req, res, next) => {
    try {
      const validation = validateProvisioningBody(req.body);
      if (!validation.ok) {
        return res.status(400).render("admin/church/organization_form", {
          form: validation.form,
          error: validation.error,
          planCodes: PLAN_CODES,
          churchPublicHost,
          activeNav: "church_platform_orgs",
        });
      }

      const pool = getPgPool();
      const platformAdminId = req.session.adminUser && req.session.adminUser.id ? req.session.adminUser.id : null;

      const result = await platformProvisioningRepo.provisionChurchOrganization(
        pool,
        {
          platform_tenant_id: TENANT_ZM,
          ...validation.data,
        },
        platformAdminId
      );

      if (req.session) {
        req.session.churchProvisionWelcome = {
          organizationId: result.organization.id,
          pack: buildProvisionWelcomePack({
            organization: result.organization,
            branch: result.branch,
            branchAdmin: result.branchAdmin,
            branchAdminCredentials: validation.data.branchAdmin,
            hqAdmin: result.hqAdmin,
          }),
        };
      }

      return res.redirect(
        `/admin/church/organizations/${result.organization.id}?provisioned=1`
      );
    } catch (err) {
      if (err && (err.code === "DUPLICATE_ORG_SLUG" || err.code === "DUPLICATE_HOST_SLUG")) {
        return res.status(400).render("admin/church/organization_form", {
          form: formFromBody(req.body),
          error: err.message,
          planCodes: PLAN_CODES,
          churchPublicHost,
          activeNav: "church_platform_orgs",
        });
      }
      if (err && err.code === "23505") {
        return res.status(400).render("admin/church/organization_form", {
          form: formFromBody(req.body),
          error: "Organization slug or admin account already exists.",
          planCodes: PLAN_CODES,
          churchPublicHost,
          activeNav: "church_platform_orgs",
        });
      }
      if (err && err.code === "ONBOARDING_CONTENT_FAILED") {
        return res.status(400).render("admin/church/organization_form", {
          form: formFromBody(req.body),
          error:
            "Organization was not created because initial website content could not be saved. Please try again or contact support.",
          planCodes: PLAN_CODES,
          churchPublicHost,
          activeNav: "church_platform_orgs",
        });
      }
      return next(err);
    }
  });

  router.get("/church/organizations/:organizationId", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(404).type("text").send("Organization not found.");
      }
      return renderOrganizationDetail(req, res);
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/organizations/:organizationId/edit", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(404).type("text").send("Organization not found.");
      }
      return renderOrganizationEdit(req, res);
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/organizations/:organizationId", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(404).type("text").send("Organization not found.");
      }
      const pool = getPgPool();
      const organization = await platformProvisioningRepo.findOrganizationByIdForPlatform(pool, organizationId);
      if (!organization) {
        return res.status(404).type("text").send("Organization not found.");
      }

      const validation = validateUpdateOrganizationBody(req.body);
      if (!validation.ok) {
        return renderOrganizationEdit(req, res, {
          statusCode: 400,
          error: validation.error,
          form: validation.form,
        });
      }

      const available = await platformProvisioningRepo.checkOrganizationSlugAvailableForUpdate(
        pool,
        validation.data.slug,
        organizationId
      );
      if (!available) {
        return renderOrganizationEdit(req, res, {
          statusCode: 400,
          error: "Organization slug is already in use.",
          form: validation.form,
        });
      }

      const result = await platformProvisioningRepo.updateOrganizationMetadataForPlatform(
        pool,
        organizationId,
        validation.data,
        platformAdminId(req)
      );

      const notice = result.slugChanged ? "slug_changed" : "updated";
      return res.redirect(`/admin/church/organizations/${organizationId}?notice=${notice}`);
    } catch (err) {
      if (err && err.code === "DUPLICATE_ORG_SLUG") {
        return renderOrganizationEdit(req, res, {
          statusCode: 400,
          error: err.message,
          form: updateOrganizationFormFromBody(req.body),
        });
      }
      return next(err);
    }
  });

  router.post("/church/organizations/:organizationId/suspend", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      const pool = getPgPool();
      const org = await platformProvisioningRepo.findChurchOrganizationById(pool, organizationId);
      const validation = validateSuspendBody(req.body);
      const transition = assertCanSuspendOrganization(org);
      if (!transition.ok) {
        return renderOrganizationDetail(req, res, { statusCode: 400, statusError: transition.error });
      }
      if (!validation.ok) {
        return renderOrganizationDetail(req, res, { statusCode: 400, statusError: validation.error });
      }
      await platformProvisioningRepo.suspendOrganization(pool, organizationId, {
        reason: validation.reason,
        platformAdminId: platformAdminId(req),
      });
      return res.redirect(`/admin/church/organizations/${organizationId}?notice=suspended`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/organizations/:organizationId/reactivate", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      const pool = getPgPool();
      const org = await platformProvisioningRepo.findChurchOrganizationById(pool, organizationId);
      const validation = validateReactivateBody(req.body);
      const transition = assertCanReactivateOrganization(org);
      if (!transition.ok) {
        return renderOrganizationDetail(req, res, { statusCode: 400, statusError: transition.error });
      }
      await platformProvisioningRepo.reactivateOrganization(pool, organizationId, {
        reason: validation.reason,
        platformAdminId: platformAdminId(req),
      });
      return res.redirect(`/admin/church/organizations/${organizationId}?notice=reactivated`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/organizations/:organizationId/archive", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      const pool = getPgPool();
      const org = await platformProvisioningRepo.findChurchOrganizationById(pool, organizationId);
      const validation = validateArchiveBody(req.body);
      const transition = assertCanArchiveOrganization(org);
      if (!transition.ok) {
        return renderOrganizationDetail(req, res, { statusCode: 400, statusError: transition.error });
      }
      if (!validation.ok) {
        return renderOrganizationDetail(req, res, { statusCode: 400, statusError: validation.error });
      }
      await platformProvisioningRepo.archiveOrganization(pool, organizationId, {
        reason: validation.reason,
        platformAdminId: platformAdminId(req),
      });
      return res.redirect(`/admin/church/organizations/${organizationId}?notice=archived`);
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/organizations/:organizationId/plan", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(404).type("text").send("Organization not found.");
      }
      const pool = getPgPool();
      const planSummary = await platformProvisioningRepo.getOrganizationPlanSummary(pool, organizationId);
      if (!planSummary) {
        return res.status(404).type("text").send("Organization not found.");
      }
      const saved = String(req.query.saved || "") === "1";
      res.render("admin/church/organization_plan", {
        planSummary,
        planCodes: CHURCH_PLAN_CODES,
        formatDate,
        saved,
        error: null,
        form: {
          plan_code: planSummary.planCode,
          plan_status: planSummary.planStatus,
          plan_notes: planSummary.planNotes || "",
        },
        activeNav: "church_platform_orgs",
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/organizations/:organizationId/plan", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(404).type("text").send("Organization not found.");
      }
      const validation = validatePlanUpdateBody(req.body);
      const pool = getPgPool();
      const planSummary = await platformProvisioningRepo.getOrganizationPlanSummary(pool, organizationId);
      if (!planSummary) {
        return res.status(404).type("text").send("Organization not found.");
      }
      if (!validation.ok) {
        return res.status(400).render("admin/church/organization_plan", {
          planSummary,
          planCodes: CHURCH_PLAN_CODES,
          formatDate,
          saved: false,
          error: validation.error,
          form: {
            plan_code: String(req.body.plan_code || planSummary.planCode),
            plan_status: String(req.body.plan_status || planSummary.planStatus),
            plan_notes: String(req.body.plan_notes || ""),
          },
          activeNav: "church_platform_orgs",
        });
      }
      const platformAdminId = req.session.adminUser && req.session.adminUser.id ? req.session.adminUser.id : null;
      await platformProvisioningRepo.updateOrganizationPlan(pool, organizationId, validation.data, platformAdminId);
      return res.redirect(`/admin/church/organizations/${organizationId}/plan?saved=1`);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/church/organizations/:organizationId/hq-admins", requireSuperAdmin, async (req, res, next) => {
    try {
      return renderHqAdminsList(req, res);
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/organizations/:organizationId/hq-admins/new", requireSuperAdmin, async (req, res, next) => {
    try {
      return renderHqAdminForm(req, res, { mode: "create" });
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/organizations/:organizationId/hq-admins", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      const pool = getPgPool();
      const organization = await loadOrganizationForAdminRoutes(pool, organizationId);
      if (!organization) {
        return res.status(404).type("text").send("Organization not found.");
      }

      const validation = validateCreateHqAdminBody(req.body);
      if (!validation.ok) {
        return renderHqAdminForm(req, res, {
          statusCode: 400,
          mode: "create",
          error: validation.error,
          form: validation.form,
        });
      }

      const conflict = await platformProvisioningRepo.checkHqAdminLoginConflictForOrganization(pool, organizationId, {
        email: validation.data.email,
        phone: validation.data.phone,
      });
      if (conflict) {
        return renderHqAdminForm(req, res, {
          statusCode: 400,
          mode: "create",
          error: "Email or phone is already in use for this organization.",
          form: validation.form,
        });
      }

      const passwordHash = await bcrypt.hash(validation.data.temporary_password, 12);
      const admin = await platformProvisioningRepo.createHqAdminForPlatform(
        pool,
        organizationId,
        {
          full_name: validation.data.full_name,
          email: validation.data.email,
          phone: validation.data.phone,
          role: validation.data.role,
          password_hash: passwordHash,
          notes: validation.data.notes,
        },
        platformAdminId(req)
      );

      return res.redirect(`/admin/church/organizations/${organizationId}/hq-admins/${admin.id}?notice=created`);
    } catch (err) {
      if (err && err.code === "DUPLICATE_LOGIN") {
        return renderHqAdminForm(req, res, {
          statusCode: 400,
          mode: "create",
          error: err.message,
          form: hqCreateFormFromBody(req.body),
        });
      }
      return next(err);
    }
  });

  router.get("/church/organizations/:organizationId/hq-admins/:adminId", requireSuperAdmin, async (req, res, next) => {
    try {
      return renderHqAdminDetail(req, res);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/church/organizations/:organizationId/hq-admins/:adminId/edit",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const organizationId = Number(req.params.organizationId);
        const adminId = Number(req.params.adminId);
        const pool = getPgPool();
        const admin = await platformProvisioningRepo.findHqAdminByIdForPlatform(pool, adminId, organizationId);
        if (!admin) {
          return res.status(404).type("text").send("HQ admin not found.");
        }
        return renderHqAdminForm(req, res, { mode: "edit", admin });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post("/church/organizations/:organizationId/hq-admins/:adminId", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      const adminId = Number(req.params.adminId);
      const pool = getPgPool();
      const admin = await platformProvisioningRepo.findHqAdminByIdForPlatform(pool, adminId, organizationId);
      if (!admin) {
        return res.status(404).type("text").send("HQ admin not found.");
      }

      const validation = validateUpdateHqAdminBody(req.body);
      if (!validation.ok) {
        return renderHqAdminForm(req, res, {
          statusCode: 400,
          mode: "edit",
          admin,
          error: validation.error,
          form: validation.form,
        });
      }

      const conflict = await platformProvisioningRepo.checkHqAdminLoginConflictForOrganization(pool, organizationId, {
        email: validation.data.email,
        phone: validation.data.phone,
        excludeAdminId: adminId,
      });
      if (conflict) {
        return renderHqAdminForm(req, res, {
          statusCode: 400,
          mode: "edit",
          admin,
          error: "Email or phone is already in use for this organization.",
          form: validation.form,
        });
      }

      await platformProvisioningRepo.updateHqAdminForPlatform(
        pool,
        adminId,
        organizationId,
        validation.data,
        platformAdminId(req)
      );

      return res.redirect(`/admin/church/organizations/${organizationId}/hq-admins/${adminId}?notice=updated`);
    } catch (err) {
      if (err && err.code === "DUPLICATE_LOGIN") {
        const organizationId = Number(req.params.organizationId);
        const adminId = Number(req.params.adminId);
        const pool = getPgPool();
        const admin = await platformProvisioningRepo.findHqAdminByIdForPlatform(pool, adminId, organizationId);
        return renderHqAdminForm(req, res, {
          statusCode: 400,
          mode: "edit",
          admin,
          error: err.message,
          form: hqEditFormFromBody(req.body),
        });
      }
      return next(err);
    }
  });

  router.post(
    "/church/organizations/:organizationId/hq-admins/:adminId/activate",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const organizationId = Number(req.params.organizationId);
        const adminId = Number(req.params.adminId);
        const pool = getPgPool();
        const admin = await platformProvisioningRepo.findHqAdminByIdForPlatform(pool, adminId, organizationId);
        if (!admin) {
          return res.status(404).type("text").send("HQ admin not found.");
        }
        await platformProvisioningRepo.activateHqAdminForPlatform(pool, adminId, organizationId, platformAdminId(req));
        return res.redirect(`/admin/church/organizations/${organizationId}/hq-admins/${adminId}?notice=activated`);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/church/organizations/:organizationId/hq-admins/:adminId/deactivate",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const organizationId = Number(req.params.organizationId);
        const adminId = Number(req.params.adminId);
        const pool = getPgPool();
        const admin = await platformProvisioningRepo.findHqAdminByIdForPlatform(pool, adminId, organizationId);
        if (!admin) {
          return res.status(404).type("text").send("HQ admin not found.");
        }
        await platformProvisioningRepo.deactivateHqAdminForPlatform(pool, adminId, organizationId, platformAdminId(req));
        return res.redirect(`/admin/church/organizations/${organizationId}/hq-admins/${adminId}?notice=deactivated`);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/church/organizations/:organizationId/hq-admins/:adminId/reset-password",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const organizationId = Number(req.params.organizationId);
        const adminId = Number(req.params.adminId);
        const pool = getPgPool();
        const admin = await platformProvisioningRepo.findHqAdminByIdForPlatform(pool, adminId, organizationId);
        if (!admin) {
          return res.status(404).type("text").send("HQ admin not found.");
        }

        const validation = validateResetHqAdminPasswordBody(req.body);
        if (!validation.ok) {
          return renderHqAdminDetail(req, res, { statusCode: 400, resetError: validation.error });
        }

        const passwordHash = await bcrypt.hash(validation.new_password, 12);
        await platformProvisioningRepo.resetHqAdminPasswordForPlatform(
          pool,
          adminId,
          organizationId,
          passwordHash,
          platformAdminId(req)
        );

        return res.redirect(`/admin/church/organizations/${organizationId}/hq-admins/${adminId}?notice=password_reset`);
      } catch (err) {
        next(err);
      }
    }
  );

  router.get("/church/organizations/:organizationId/branches/new", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(404).type("text").send("Organization not found.");
      }
      const pool = getPgPool();
      const organization = await platformProvisioningRepo.findChurchOrganizationById(pool, organizationId);
      if (!organization) {
        return res.status(404).type("text").send("Organization not found.");
      }
      const planSummary = await platformProvisioningRepo.getOrganizationPlanSummary(pool, organizationId);
      const branchLimitBlocked = planSummary ? planSummary.branchLimitReached : false;
      res.render("admin/church/branch_form", {
        organization,
        planSummary,
        form: addBranchFormFromBody({ country: organization.country || "" }),
        error: null,
        branchLimitBlocked,
        churchPublicHost,
        activeNav: "church_platform_orgs",
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/organizations/:organizationId/branches", requireSuperAdmin, async (req, res, next) => {
    try {
      const organizationId = Number(req.params.organizationId);
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(404).type("text").send("Organization not found.");
      }
      const pool = getPgPool();
      const organization = await platformProvisioningRepo.findChurchOrganizationById(pool, organizationId);
      if (!organization) {
        return res.status(404).type("text").send("Organization not found.");
      }
      const planSummary = await platformProvisioningRepo.getOrganizationPlanSummary(pool, organizationId);
      const validation = validateAddBranchBody(req.body, organization);
      if (!validation.ok) {
        return res.status(400).render("admin/church/branch_form", {
          organization,
          planSummary,
          form: validation.form,
          error: validation.error,
          branchLimitBlocked: planSummary ? planSummary.branchLimitReached : false,
          churchPublicHost,
          activeNav: "church_platform_orgs",
        });
      }
      const platformAdminId = req.session.adminUser && req.session.adminUser.id ? req.session.adminUser.id : null;
      const result = await platformProvisioningRepo.createBranchForOrganization(
        pool,
        organizationId,
        validation.data,
        platformAdminId
      );
      return res.redirect(`/admin/church/branches/${result.branch.id}?created=1`);
    } catch (err) {
      const organizationId = Number(req.params.organizationId);
      if (err && err.code === "PLAN_BRANCH_LIMIT") {
        const pool = getPgPool();
        const organization = await platformProvisioningRepo.findChurchOrganizationById(pool, organizationId);
        const planSummary = await platformProvisioningRepo.getOrganizationPlanSummary(pool, organizationId);
        return res.status(400).render("admin/church/branch_form", {
          organization,
          planSummary,
          form: addBranchFormFromBody(req.body),
          error: err.message,
          branchLimitBlocked: true,
          churchPublicHost,
          activeNav: "church_platform_orgs",
        });
      }
      if (err && err.code === "DUPLICATE_HOST_SLUG") {
        const pool = getPgPool();
        const organization = await platformProvisioningRepo.findChurchOrganizationById(pool, organizationId);
        const planSummary = await platformProvisioningRepo.getOrganizationPlanSummary(pool, organizationId);
        return res.status(400).render("admin/church/branch_form", {
          organization,
          planSummary,
          form: addBranchFormFromBody(req.body),
          error: err.message,
          branchLimitBlocked: planSummary ? planSummary.branchLimitReached : false,
          churchPublicHost,
          activeNav: "church_platform_orgs",
        });
      }
      return next(err);
    }
  });

  router.get("/church/branches", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const q = String(req.query.q || "").trim();
      const statusFilter = parseBranchStatusFilter(req.query.status);
      const branches = await platformProvisioningRepo.listBranchesWithStatusSummary(pool, { q, status: statusFilter });
      res.render("admin/church/branches", {
        branches,
        q,
        statusFilter,
        orgBranchStatuses: ORG_BRANCH_STATUSES,
        formatDate,
        churchPublicHost,
        statusBadgeClass,
        statusLabel,
        activeNav: "church_platform_branches",
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/branches/:branchId", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      if (!Number.isFinite(branchId) || branchId <= 0) {
        return res.status(404).type("text").send("Branch not found.");
      }
      return renderBranchDetail(req, res);
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/branches/:branchId/edit", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      if (!Number.isFinite(branchId) || branchId <= 0) {
        return res.status(404).type("text").send("Branch not found.");
      }
      return renderBranchEdit(req, res);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/church/organizations/:organizationId/branches/:branchId/edit",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const branchId = Number(req.params.branchId);
        if (!Number.isFinite(branchId) || branchId <= 0) {
          return res.status(404).type("text").send("Branch not found.");
        }
        return renderBranchEdit(req, res);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post("/church/branches/:branchId", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      if (!Number.isFinite(branchId) || branchId <= 0) {
        return res.status(404).type("text").send("Branch not found.");
      }
      const pool = getPgPool();
      const branch = await platformProvisioningRepo.findBranchByIdForPlatform(pool, branchId);
      if (!branch) {
        return res.status(404).type("text").send("Branch not found.");
      }

      const validation = validateUpdateBranchBody(req.body);
      if (!validation.ok) {
        return renderBranchEdit(req, res, {
          statusCode: 400,
          error: validation.error,
          form: validation.form,
        });
      }

      const available = await platformProvisioningRepo.checkBranchHostSlugAvailableForUpdate(
        pool,
        validation.data.host_slug,
        branchId
      );
      if (!available) {
        return renderBranchEdit(req, res, {
          statusCode: 400,
          error: "Branch host slug is already in use.",
          form: validation.form,
        });
      }

      const result = await platformProvisioningRepo.updateBranchMetadataForPlatform(
        pool,
        branchId,
        validation.data,
        platformAdminId(req)
      );

      const notice = result.hostSlugChanged ? "host_slug_changed" : "updated";
      return res.redirect(`/admin/church/branches/${branchId}?notice=${notice}`);
    } catch (err) {
      if (err && err.code === "DUPLICATE_HOST_SLUG") {
        return renderBranchEdit(req, res, {
          statusCode: 400,
          error: err.message,
          form: updateBranchFormFromBody(req.body),
        });
      }
      return next(err);
    }
  });

  router.get("/church/branches/:branchId/admins", requireSuperAdmin, async (req, res, next) => {
    try {
      return renderBranchAdminsList(req, res);
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/branches/:branchId/admins/new", requireSuperAdmin, async (req, res, next) => {
    try {
      return renderBranchAdminForm(req, res, { mode: "create" });
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/branches/:branchId/admins", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      const pool = getPgPool();
      const branch = await loadBranchForAdminRoutes(pool, branchId);
      if (!branch) {
        return res.status(404).type("text").send("Branch not found.");
      }

      const validation = validateCreateBranchAdminBody(req.body);
      if (!validation.ok) {
        return renderBranchAdminForm(req, res, {
          statusCode: 400,
          mode: "create",
          error: validation.error,
          form: validation.form,
        });
      }

      const conflict = await platformProvisioningRepo.checkBranchAdminLoginConflictForBranch(pool, branchId, {
        email: validation.data.email,
        phone: validation.data.phone,
      });
      if (conflict) {
        return renderBranchAdminForm(req, res, {
          statusCode: 400,
          mode: "create",
          error: "Email or phone is already in use for this branch.",
          form: validation.form,
        });
      }

      const passwordHash = await bcrypt.hash(validation.data.temporary_password, 12);
      const admin = await platformProvisioningRepo.createBranchAdminForPlatform(
        pool,
        branchId,
        {
          full_name: validation.data.full_name,
          email: validation.data.email,
          phone: validation.data.phone,
          role: validation.data.role,
          password_hash: passwordHash,
          notes: validation.data.notes,
        },
        platformAdminId(req)
      );

      return res.redirect(`/admin/church/branches/${branchId}/admins/${admin.id}?notice=created`);
    } catch (err) {
      if (err && err.code === "DUPLICATE_LOGIN") {
        return renderBranchAdminForm(req, res, {
          statusCode: 400,
          mode: "create",
          error: err.message,
          form: createFormFromBody(req.body),
        });
      }
      return next(err);
    }
  });

  router.get("/church/branches/:branchId/admins/:adminId", requireSuperAdmin, async (req, res, next) => {
    try {
      return renderBranchAdminDetail(req, res);
    } catch (err) {
      next(err);
    }
  });

  router.get("/church/branches/:branchId/admins/:adminId/edit", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      const adminId = Number(req.params.adminId);
      const pool = getPgPool();
      const admin = await platformProvisioningRepo.findBranchAdminByIdForPlatform(pool, adminId, branchId);
      if (!admin) {
        return res.status(404).type("text").send("Branch admin not found.");
      }
      return renderBranchAdminForm(req, res, { mode: "edit", admin });
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/branches/:branchId/admins/:adminId", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      const adminId = Number(req.params.adminId);
      const pool = getPgPool();
      const admin = await platformProvisioningRepo.findBranchAdminByIdForPlatform(pool, adminId, branchId);
      if (!admin) {
        return res.status(404).type("text").send("Branch admin not found.");
      }

      const validation = validateUpdateBranchAdminBody(req.body);
      if (!validation.ok) {
        return renderBranchAdminForm(req, res, {
          statusCode: 400,
          mode: "edit",
          admin,
          error: validation.error,
          form: validation.form,
        });
      }

      const conflict = await platformProvisioningRepo.checkBranchAdminLoginConflictForBranch(pool, branchId, {
        email: validation.data.email,
        phone: validation.data.phone,
        excludeAdminId: adminId,
      });
      if (conflict) {
        return renderBranchAdminForm(req, res, {
          statusCode: 400,
          mode: "edit",
          admin,
          error: "Email or phone is already in use for this branch.",
          form: validation.form,
        });
      }

      await platformProvisioningRepo.updateBranchAdminForPlatform(
        pool,
        adminId,
        branchId,
        validation.data,
        platformAdminId(req)
      );

      return res.redirect(`/admin/church/branches/${branchId}/admins/${adminId}?notice=updated`);
    } catch (err) {
      if (err && err.code === "DUPLICATE_LOGIN") {
        const branchId = Number(req.params.branchId);
        const adminId = Number(req.params.adminId);
        const pool = getPgPool();
        const admin = await platformProvisioningRepo.findBranchAdminByIdForPlatform(pool, adminId, branchId);
        return renderBranchAdminForm(req, res, {
          statusCode: 400,
          mode: "edit",
          admin,
          error: err.message,
          form: editFormFromBody(req.body),
        });
      }
      return next(err);
    }
  });

  router.post("/church/branches/:branchId/admins/:adminId/activate", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      const adminId = Number(req.params.adminId);
      const pool = getPgPool();
      const admin = await platformProvisioningRepo.findBranchAdminByIdForPlatform(pool, adminId, branchId);
      if (!admin) {
        return res.status(404).type("text").send("Branch admin not found.");
      }
      await platformProvisioningRepo.activateBranchAdminForPlatform(pool, adminId, branchId, platformAdminId(req));
      return res.redirect(`/admin/church/branches/${branchId}/admins/${adminId}?notice=activated`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/branches/:branchId/admins/:adminId/deactivate", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      const adminId = Number(req.params.adminId);
      const pool = getPgPool();
      const admin = await platformProvisioningRepo.findBranchAdminByIdForPlatform(pool, adminId, branchId);
      if (!admin) {
        return res.status(404).type("text").send("Branch admin not found.");
      }
      await platformProvisioningRepo.deactivateBranchAdminForPlatform(pool, adminId, branchId, platformAdminId(req));
      return res.redirect(`/admin/church/branches/${branchId}/admins/${adminId}?notice=deactivated`);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/church/branches/:branchId/admins/:adminId/reset-password",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const branchId = Number(req.params.branchId);
        const adminId = Number(req.params.adminId);
        const pool = getPgPool();
        const admin = await platformProvisioningRepo.findBranchAdminByIdForPlatform(pool, adminId, branchId);
        if (!admin) {
          return res.status(404).type("text").send("Branch admin not found.");
        }

        const validation = validateResetBranchAdminPasswordBody(req.body);
        if (!validation.ok) {
          return renderBranchAdminDetail(req, res, { statusCode: 400, resetError: validation.error });
        }

        const passwordHash = await bcrypt.hash(validation.new_password, 12);
        await platformProvisioningRepo.resetBranchAdminPasswordForPlatform(
          pool,
          adminId,
          branchId,
          passwordHash,
          platformAdminId(req)
        );

        return res.redirect(`/admin/church/branches/${branchId}/admins/${adminId}?notice=password_reset`);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post("/church/branches/:branchId/suspend", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      const pool = getPgPool();
      const branch = await platformProvisioningRepo.findChurchBranchById(pool, branchId);
      const validation = validateSuspendBody(req.body);
      const transition = assertCanSuspendBranch(branch);
      if (!transition.ok) {
        return renderBranchDetail(req, res, { statusCode: 400, statusError: transition.error });
      }
      if (!validation.ok) {
        return renderBranchDetail(req, res, { statusCode: 400, statusError: validation.error });
      }
      await platformProvisioningRepo.suspendBranch(pool, branchId, {
        reason: validation.reason,
        platformAdminId: platformAdminId(req),
      });
      return res.redirect(`/admin/church/branches/${branchId}?notice=suspended`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/branches/:branchId/reactivate", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      const pool = getPgPool();
      const branch = await platformProvisioningRepo.findChurchBranchById(pool, branchId);
      const validation = validateReactivateBody(req.body);
      const transition = assertCanReactivateBranch(branch);
      if (!transition.ok) {
        return renderBranchDetail(req, res, { statusCode: 400, statusError: transition.error });
      }
      await platformProvisioningRepo.reactivateBranch(pool, branchId, {
        reason: validation.reason,
        platformAdminId: platformAdminId(req),
      });
      return res.redirect(`/admin/church/branches/${branchId}?notice=reactivated`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/church/branches/:branchId/archive", requireSuperAdmin, async (req, res, next) => {
    try {
      const branchId = Number(req.params.branchId);
      const pool = getPgPool();
      const branch = await platformProvisioningRepo.findChurchBranchById(pool, branchId);
      const validation = validateArchiveBody(req.body);
      const transition = assertCanArchiveBranch(branch);
      if (!transition.ok) {
        return renderBranchDetail(req, res, { statusCode: 400, statusError: transition.error });
      }
      if (!validation.ok) {
        return renderBranchDetail(req, res, { statusCode: 400, statusError: validation.error });
      }
      await platformProvisioningRepo.archiveBranch(pool, branchId, {
        reason: validation.reason,
        platformAdminId: platformAdminId(req),
      });
      return res.redirect(`/admin/church/branches/${branchId}?notice=archived`);
    } catch (err) {
      next(err);
    }
  });
};

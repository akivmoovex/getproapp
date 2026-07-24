"use strict";

/**
 * Site-level public website publish readiness + atomic publish/unpublish.
 * Per-page CMS publish remains in publicContentAdminService; this gates the
 * church_settings.website_status site flag and keeps required page rows consistent.
 */

const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const publicContentRepo = require("../repositories/publicContentRepository");
const appRepo = require("../repositories/platformChurchRegistrationRepository");
const {
  resolveOrganizationEntitlements,
  hasFeature,
  FEATURE_KEYS,
} = require("../../platform/services/entitlementService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const { PUBLIC_PAGE_KEYS, PAGE_KEY_TITLES } = require("./publicContentConstants");
const { normalizeOrganizationKey } = require("./organizationKey");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  NOT_READY: "not_ready",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
  CONFLICT: "conflict",
});

const GAP = Object.freeze({
  ORGANIZATION_NAME: "organization_name",
  FIRST_BRANCH: "first_branch",
  CONTACT_METHOD: "contact_method",
  SERVICE_TIMES: "service_times",
  REQUIRED_PAGES: "required_pages",
  PUBLIC_HOSTNAME: "public_hostname",
  CUSTOM_DOMAIN_ENTITLEMENT: "custom_domain_entitlement",
  WEBSITE_SUSPENDED: "website_suspended",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

async function withTransaction(db, fn) {
  return withClient(db, async (client) => {
    const nested = typeof client.release === "function" && client !== db;
    const ownsTx = nested || (db && typeof db.connect === "function");
    if (ownsTx) await client.query("BEGIN");
    try {
      const result = await fn(client);
      if (ownsTx) await client.query("COMMIT");
      return result;
    } catch (err) {
      if (ownsTx) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
      }
      throw err;
    }
  });
}

function deploymentCode(env) {
  const id = getPlatformDeploymentCode(env || process.env);
  return id && id.ok ? id.code : "blessboard-org-v5";
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function loadChurchPublishContext(client, churchId) {
  const r = await client.query(
    `SELECT c.id AS church_id,
            c.display_name AS church_display_name,
            c.status AS church_status,
            o.id AS organization_id,
            o.organization_key,
            o.display_name AS organization_display_name,
            o.status AS organization_status,
            (SELECT b.id FROM blessboard.branches b
              WHERE b.church_id = c.id AND b.status = 'active'
              ORDER BY CASE WHEN b.branch_type = 'hq' THEN 0 ELSE 1 END, b.created_at ASC
              LIMIT 1) AS first_branch_id,
            (SELECT COUNT(*)::int FROM blessboard.branches b
              WHERE b.church_id = c.id AND b.status = 'active') AS active_branch_count
       FROM blessboard.churches c
       JOIN platform.organizations o ON o.id = c.organization_id
      WHERE c.id = $1
      LIMIT 1`,
    [churchId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 * @param {string|null} branchId
 */
async function loadContactFlags(client, churchId, branchId) {
  const settings = await settingsRepo.findChurchSettings(client, churchId);
  const branchSettings =
    branchId != null ? await settingsRepo.findBranchSettings(client, branchId) : null;
  const hasChurchContact =
    Boolean(settings && String(settings.primaryEmail || "").trim()) ||
    Boolean(settings && String(settings.primaryPhone || "").trim());
  const hasBranchContact =
    Boolean(branchSettings && String(branchSettings.email || "").trim()) ||
    Boolean(branchSettings && String(branchSettings.phone || "").trim());
  return {
    settings,
    hasContact: hasChurchContact || hasBranchContact,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function hasServiceTimesContent(client, churchId) {
  const r = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1
          AND ps.status IN ('draft', 'published')
          AND (
            ps.section_key IN ('service_times', 'services', 'worship_times')
            OR ps.section_type IN ('service_times', 'services', 'worship_times')
          )
          AND NULLIF(TRIM(COALESCE(ps.body_text, '')), '') IS NOT NULL
     ) AS has_service_times`,
    [churchId]
  );
  return Boolean(r.rows[0] && r.rows[0].has_service_times);
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function listRequiredPagePresence(client, churchId) {
  const pages = [];
  const missing = [];
  for (const pageKey of PUBLIC_PAGE_KEYS) {
    const page = await publicContentRepo.findPageByScope(client, {
      churchId,
      branchId: null,
      pageKey,
    });
    if (page) pages.push(page);
    else missing.push(pageKey);
  }
  return { pages, missing };
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function listOrganizationDomains(client, organizationId) {
  const r = await client.query(
    `SELECT id, hostname, domain_type, status, is_primary
       FROM platform.domains
      WHERE organization_id = $1
        AND status IN ('active', 'pending')
      ORDER BY CASE WHEN domain_type = 'canonical' THEN 0
                    WHEN domain_type = 'subdomain' THEN 1
                    ELSE 2 END,
               hostname ASC`,
    [organizationId]
  );
  return r.rows || [];
}

/**
 * Path public URL is always available for a valid organization_key (Foundation policy).
 * Custom domains require CUSTOM_DOMAIN entitlement when present.
 * @param {{ query: Function }} client
 * @param {object} ctx
 * @param {object|null} entitlements
 */
function evaluateHostnameReadiness(ctx, domains, entitlements) {
  const keyNorm = normalizeOrganizationKey(ctx.organization_key);
  const pathPublicOk = keyNorm.ok;
  const customDomains = (domains || []).filter(
    (d) => String(d.domain_type || "").toLowerCase() === "custom"
  );
  const hasCustomWithoutEntitlement =
    customDomains.length > 0 &&
    !(entitlements && hasFeature(entitlements, FEATURE_KEYS.CUSTOM_DOMAIN));

  return {
    pathPublicOk,
    publicPath: pathPublicOk ? `/c/${keyNorm.key}` : null,
    organizationKey: pathPublicOk ? keyNorm.key : null,
    domains: domains || [],
    customDomainBlocked: hasCustomWithoutEntitlement,
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   churchId: string,
 *   deferServiceTimes?: boolean,
 *   env?: object,
 * }} input
 */
async function evaluatePublishReadiness(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(churchId)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      ready: false,
      gaps: [GAP.ORGANIZATION_NAME],
      reason: "church_id",
    };
  }
  const deferServiceTimes = Boolean(input && input.deferServiceTimes);

  try {
    return await withClient(db, async (client) => {
      const ctx = await loadChurchPublishContext(client, churchId);
      if (!ctx) {
        return {
          ok: false,
          status: STATUS.NOT_FOUND,
          ready: false,
          gaps: [],
          reason: "church_not_found",
        };
      }

      const gaps = [];
      const orgName = String(ctx.organization_display_name || "").trim();
      const churchName = String(ctx.church_display_name || "").trim();
      if (!orgName || !churchName) gaps.push(GAP.ORGANIZATION_NAME);

      if (!(Number(ctx.active_branch_count) > 0) || !ctx.first_branch_id) {
        gaps.push(GAP.FIRST_BRANCH);
      }

      const contact = await loadContactFlags(client, churchId, ctx.first_branch_id);
      if (!contact.hasContact) gaps.push(GAP.CONTACT_METHOD);

      const hasTimes = await hasServiceTimesContent(client, churchId);
      if (!hasTimes && !deferServiceTimes) gaps.push(GAP.SERVICE_TIMES);

      const pagePresence = await listRequiredPagePresence(client, churchId);
      if (pagePresence.missing.length) gaps.push(GAP.REQUIRED_PAGES);

      const entitlementsResult = await resolveOrganizationEntitlements(client, {
        organizationId: ctx.organization_id,
        productKey: "blessboard",
      });
      const entitlements =
        entitlementsResult && entitlementsResult.ok ? entitlementsResult.entitlements : null;

      const domains = await listOrganizationDomains(client, ctx.organization_id);
      const hostname = evaluateHostnameReadiness(ctx, domains, entitlements);
      if (!hostname.pathPublicOk) gaps.push(GAP.PUBLIC_HOSTNAME);
      if (hostname.customDomainBlocked) gaps.push(GAP.CUSTOM_DOMAIN_ENTITLEMENT);

      const websiteStatus = contact.settings
        ? String(contact.settings.websiteStatus || "draft")
        : "draft";
      if (websiteStatus === "suspended") gaps.push(GAP.WEBSITE_SUSPENDED);

      let previewAcknowledged = false;
      const onboarding = await client.query(
        `SELECT preview_acknowledged, onboarding_status
           FROM blessboard.organization_onboarding
          WHERE organization_id = $1`,
        [ctx.organization_id]
      );
      if (onboarding.rows[0]) {
        previewAcknowledged = Boolean(onboarding.rows[0].preview_acknowledged);
      }

      const ready = gaps.length === 0;
      return {
        ok: true,
        status: STATUS.OK,
        ready,
        gaps,
        deferServiceTimes,
        websiteStatus,
        previewAcknowledged,
        organizationId: String(ctx.organization_id),
        organizationKey: hostname.organizationKey,
        publicPath: hostname.publicPath,
        churchId,
        firstBranchId: ctx.first_branch_id ? String(ctx.first_branch_id) : null,
        requiredPagesPresent: pagePresence.missing.length === 0,
        missingPageKeys: pagePresence.missing,
        hasServiceTimes: hasTimes,
        hasContact: contact.hasContact,
        planKey: entitlements && entitlements.planKey ? entitlements.planKey : null,
        entitlements: {
          customDomain: Boolean(
            entitlements && hasFeature(entitlements, FEATURE_KEYS.CUSTOM_DOMAIN)
          ),
          subscriptionActive: Boolean(entitlements && entitlements.subscriptionActive),
        },
        domainCount: domains.length,
      };
    });
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      ready: false,
      gaps: [],
      reason: "lookup_error",
    };
  }
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   organizationId: string,
 *   actorUserId?: string|null,
 *   env?: object,
 * }} input
 */
async function acknowledgeWebsitePreview(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_id" };
  }

  try {
    return await withTransaction(db, async (client) => {
      await appRepo.ensureOrganizationOnboardingRow(client, { organizationId });
      const updated = await appRepo.updateOrganizationOnboarding(client, organizationId, {
        previewAcknowledged: true,
        onboardingStatus: "in_progress",
        onboardingStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      });
      if (!updated) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "onboarding_not_found" };
      }

      await recordAuditEventSafe(client, {
        deploymentCode: deploymentCode(input && input.env),
        organizationId,
        churchId: null,
        branchId: null,
        actorUserId: input.actorUserId || null,
        actionKey: "website.preview_acknowledged",
        entityType: "organization",
        entityId: organizationId,
        outcome: "success",
        metadata: {
          status: "ok",
          source: "hq_website",
        },
      });

      return { ok: true, status: STATUS.OK, previewAcknowledged: true };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup_error" };
  }
}

/**
 * Ensure church-wide draft shells exist (idempotent).
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function ensureRequiredDraftPages(client, churchId) {
  let createdCount = 0;
  for (const pageKey of PUBLIC_PAGE_KEYS) {
    const result = await publicContentRepo.ensureDraftPage(client, {
      churchId,
      branchId: null,
      pageKey,
      title: PAGE_KEY_TITLES[pageKey] || pageKey,
    });
    if (result.created) createdCount += 1;
  }
  return createdCount;
}

/**
 * Publish all required church-wide pages + website_status in one transaction.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   churchId: string,
 *   actorUserId?: string|null,
 *   deferServiceTimes?: boolean,
 *   confirmPublish?: unknown,
 *   env?: object,
 * }} input
 */
async function publishChurchWebsite(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "church_id" };
  }
  if (!(input && (input.confirmPublish === true || input.confirmPublish === "1" || input.confirmPublish === "on"))) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm_publish" };
  }

  const readiness = await evaluatePublishReadiness(db, {
    churchId,
    deferServiceTimes: Boolean(input && input.deferServiceTimes),
    env: input && input.env,
  });
  if (!readiness.ok) {
    return {
      ok: false,
      status: readiness.status,
      reason: readiness.reason || "readiness_failed",
      gaps: readiness.gaps || [],
    };
  }
  if (!readiness.ready) {
    return {
      ok: false,
      status: STATUS.NOT_READY,
      reason: "not_ready",
      gaps: readiness.gaps,
      readiness,
    };
  }

  if (readiness.organizationId) {
    const { validateWebsitePublication } = require("./websitePublicationValidationService");
    const validation = await validateWebsitePublication(db, {
      organizationId: readiness.organizationId,
      churchId,
      actorUserId: input.actorUserId || null,
      deferServiceTimes: Boolean(input && input.deferServiceTimes),
      mobilePreviewConfirmed: Boolean(input && input.mobilePreviewConfirmed),
      env: input && input.env,
    });
    if (!validation.ok || !validation.publishable) {
      return {
        ok: false,
        status: STATUS.NOT_READY,
        reason: "validation_failed",
        gaps: readiness.gaps || [],
        validationErrors: (validation && validation.errors) || [],
        validation,
      };
    }
  }

  try {
    return await withTransaction(db, async (client) => {
      // Re-check inside TX to avoid races leaving partial publishes.
      const inner = await evaluatePublishReadiness(client, {
        churchId,
        deferServiceTimes: Boolean(input && input.deferServiceTimes),
      });
      if (!inner.ok || !inner.ready) {
        return {
          ok: false,
          status: inner.ok ? STATUS.NOT_READY : inner.status,
          reason: "not_ready",
          gaps: inner.gaps || [],
        };
      }

      await ensureRequiredDraftPages(client, churchId);

      const publishedAt = new Date();
      const pageUpdate = await client.query(
        `UPDATE blessboard.public_pages
            SET status = 'published',
                published_at = COALESCE(published_at, $2::timestamptz),
                updated_at = now()
          WHERE church_id = $1
            AND branch_id IS NULL
            AND page_key = ANY($3::text[])
            AND status <> 'archived'
        RETURNING id, page_key, status`,
        [churchId, publishedAt.toISOString(), PUBLIC_PAGE_KEYS.slice()]
      );

      if (pageUpdate.rowCount !== PUBLIC_PAGE_KEYS.length) {
        throw Object.assign(new Error("partial_page_publish"), {
          code: "PARTIAL_PAGE_PUBLISH",
          expected: PUBLIC_PAGE_KEYS.length,
          actual: pageUpdate.rowCount,
        });
      }

      const displayName = await settingsRepo.findChurchDisplayName(client, churchId);
      await settingsRepo.ensureChurchSettingsRow(client, {
        churchId,
        publicName: displayName || "Church",
      });
      const existing = await settingsRepo.findChurchSettings(client, churchId);
      await settingsRepo.upsertChurchSettings(client, churchId, {
        publicName: (existing && existing.publicName) || displayName || "Church",
        denomination: existing ? existing.denomination : null,
        primaryEmail: existing ? existing.primaryEmail : null,
        primaryPhone: existing ? existing.primaryPhone : null,
        defaultTimezone: existing ? existing.defaultTimezone : null,
        defaultCountryCode: existing ? existing.defaultCountryCode : null,
        websiteStatus: "published",
      });

      await appRepo.ensureOrganizationOnboardingRow(client, {
        organizationId: inner.organizationId,
      });
      await appRepo.updateOrganizationOnboarding(client, inner.organizationId, {
        previewAcknowledged: true,
        onboardingStatus: "in_progress",
        onboardingStartedAt: publishedAt.toISOString(),
        lastActivityAt: publishedAt.toISOString(),
      });

      const fieldKeys = [];
      if (input && input.deferServiceTimes) fieldKeys.push("service_times_deferred");

      await recordAuditEventSafe(client, {
        deploymentCode: deploymentCode(input && input.env),
        organizationId: inner.organizationId,
        churchId,
        branchId: null,
        actorUserId: input.actorUserId || null,
        actionKey: "website.published",
        entityType: "church",
        entityId: churchId,
        outcome: "success",
        metadata: {
          from_status: inner.websiteStatus || "draft",
          to_status: "published",
          count: pageUpdate.rowCount,
          field_keys: fieldKeys.length ? fieldKeys : undefined,
          source: "hq_website",
          plan_key: inner.planKey || undefined,
        },
      });

      let publicationVersion = null;
      try {
        const submissionRepo = require("../repositories/websiteChangeSubmissionRepository");
        const publishedSubmissionIds = await submissionRepo.markApprovedSubmissionsPublished(
          client,
          inner.organizationId,
          input.actorUserId || null
        );

        const versionSvc = require("./websitePublicationVersionService");
        publicationVersion = await versionSvc.recordPublishVersionInTransaction(client, {
          organizationId: inner.organizationId,
          churchId,
          actorUserId: input.actorUserId || null,
          publishedAt: publishedAt.toISOString(),
          sourceType: (input && input.sourceType) || "hq_edit",
          sourceSubmissionId: (input && input.sourceSubmissionId) || null,
          publicationNote:
            input && input.publicationNote
              ? String(input.publicationNote).trim().slice(0, 2000)
              : null,
          notifyBranchAdmins: Boolean(input && input.notifyBranchAdmins),
          notifyHqTeam: Boolean(input && input.notifyHqTeam),
          publishedSubmissionIds,
          alreadyPublished: inner.websiteStatus === "published",
        });
      } catch (versionErr) {
        // Version history is required for Phase3 — fail the publish TX.
        throw versionErr;
      }

      return {
        ok: true,
        status: STATUS.OK,
        publishedAt: publishedAt.toISOString(),
        pageCount: pageUpdate.rowCount,
        publicPath: inner.publicPath,
        organizationKey: inner.organizationKey,
        alreadyPublished: inner.websiteStatus === "published",
        publicationVersionId: publicationVersion && publicationVersion.id,
        publicationVersionNumber:
          publicationVersion && publicationVersion.versionNumber,
        publishedSubmissionIds:
          (publicationVersion &&
            publicationVersion.changeSummary &&
            publicationVersion.changeSummary.publishedSubmissionIds) ||
          [],
      };
    });
  } catch (err) {
    if (err && err.code === "PARTIAL_PAGE_PUBLISH") {
      return {
        ok: false,
        status: STATUS.CONFLICT,
        reason: "partial_page_publish",
      };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup_error" };
  }
}

/**
 * Unpublish site (website_status → draft). Preserves page rows and content.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   churchId: string,
 *   actorUserId?: string|null,
 *   env?: object,
 * }} input
 */
async function unpublishChurchWebsite(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "church_id" };
  }

  try {
    return await withTransaction(db, async (client) => {
      const ctx = await loadChurchPublishContext(client, churchId);
      if (!ctx) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "church_not_found" };
      }

      const existing = await settingsRepo.findChurchSettings(client, churchId);
      const fromStatus = existing ? String(existing.websiteStatus || "draft") : "draft";
      if (fromStatus === "suspended") {
        return {
          ok: false,
          status: STATUS.FORBIDDEN,
          reason: "website_suspended",
        };
      }

      const displayName = await settingsRepo.findChurchDisplayName(client, churchId);
      await settingsRepo.ensureChurchSettingsRow(client, {
        churchId,
        publicName: displayName || "Church",
      });
      const settings = await settingsRepo.findChurchSettings(client, churchId);
      await settingsRepo.upsertChurchSettings(client, churchId, {
        publicName: (settings && settings.publicName) || displayName || "Church",
        denomination: settings ? settings.denomination : null,
        primaryEmail: settings ? settings.primaryEmail : null,
        primaryPhone: settings ? settings.primaryPhone : null,
        defaultTimezone: settings ? settings.defaultTimezone : null,
        defaultCountryCode: settings ? settings.defaultCountryCode : null,
        websiteStatus: "draft",
      });

      await recordAuditEventSafe(client, {
        deploymentCode: deploymentCode(input && input.env),
        organizationId: String(ctx.organization_id),
        churchId,
        branchId: null,
        actorUserId: input.actorUserId || null,
        actionKey: "website.unpublished",
        entityType: "church",
        entityId: churchId,
        outcome: "success",
        metadata: {
          from_status: fromStatus,
          to_status: "draft",
          source: "hq_website",
        },
      });

      return {
        ok: true,
        status: STATUS.OK,
        fromStatus,
        websiteStatus: "draft",
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup_error" };
  }
}

module.exports = {
  STATUS,
  GAP,
  PUBLIC_PAGE_KEYS,
  evaluatePublishReadiness,
  acknowledgeWebsitePreview,
  publishChurchWebsite,
  unpublishChurchWebsite,
  ensureRequiredDraftPages,
};

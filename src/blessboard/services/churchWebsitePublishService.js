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
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
} = require("../../platform/website/publicWebsiteUrl");

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
 * @param {string|null} [branchId]
 */
async function listRequiredPagePresence(client, churchId, branchId) {
  const pages = [];
  const missing = [];
  const scopedBranchId = branchId != null && String(branchId).trim() ? String(branchId).trim() : null;
  for (const pageKey of PUBLIC_PAGE_KEYS) {
    const page = await publicContentRepo.findPageByScope(client, {
      churchId,
      branchId: scopedBranchId,
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
    publicPath: pathPublicOk
      ? buildPublicOrganizationWebsitePath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: keyNorm.key,
        })
      : null,
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
      // Contract: ready === false always includes at least one gap/issue code.
      gaps: ["lookup_error"],
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
 * Ensure draft shells exist for the publish scope (idempotent).
 * @param {{ query: Function }} client
 * @param {string} churchId
 * @param {string|null} [branchId]
 */
async function ensureRequiredDraftPages(client, churchId, branchId) {
  let createdCount = 0;
  const scopedBranchId = branchId != null && String(branchId).trim() ? String(branchId).trim() : null;
  for (const pageKey of PUBLIC_PAGE_KEYS) {
    const result = await publicContentRepo.ensureDraftPage(client, {
      churchId,
      branchId: scopedBranchId,
      pageKey,
      title: PAGE_KEY_TITLES[pageKey] || pageKey,
    });
    if (result.created) createdCount += 1;
  }
  return createdCount;
}

/**
 * Publish required pages + version history for one website scope.
 * branchId null = church-wide; set = one branch mini website.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   organizationId?: string|null,
 *   churchId: string,
 *   branchId?: string|null,
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
  const rawBranchId = input && input.branchId;
  let branchId = null;
  if (rawBranchId != null && String(rawBranchId).trim() !== "") {
    branchId = String(rawBranchId).trim();
    if (!UUID_RE.test(branchId)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_id" };
    }
  }
  const requestedOrganizationId =
    input && input.organizationId != null && String(input.organizationId).trim()
      ? String(input.organizationId).trim()
      : null;
  if (requestedOrganizationId && !UUID_RE.test(requestedOrganizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_id" };
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
  if (requestedOrganizationId && String(readiness.organizationId) !== requestedOrganizationId) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "organization_mismatch" };
  }
  if (!readiness.ready) {
    // Phase 7 draft republish onto an already-published website should not re-block
    // on first-publish advisory gaps (contact, service times, hostname polish, etc.).
    // Branch publishes also allow when church website is already live.
    const forcePublishVersion = Boolean(input && input.forcePublishVersion);
    const alreadyPublished = String(readiness.websiteStatus || "") === "published";
    const fatalGaps = (readiness.gaps || []).filter(
      (g) =>
        g === GAP.WEBSITE_SUSPENDED ||
        g === GAP.ORGANIZATION_NAME ||
        g === GAP.FIRST_BRANCH ||
        g === GAP.CUSTOM_DOMAIN_ENTITLEMENT
    );
    const allowDraftRepublish =
      forcePublishVersion && alreadyPublished && fatalGaps.length === 0;
    const allowBranchOntoPublishedChurch =
      Boolean(branchId) && alreadyPublished && fatalGaps.length === 0;
    if (!allowDraftRepublish && !allowBranchOntoPublishedChurch) {
      return {
        ok: false,
        status: STATUS.NOT_READY,
        reason: "not_ready",
        gaps: readiness.gaps,
        readiness,
      };
    }
  }

  if (readiness.organizationId) {
    const { validateWebsitePublication } = require("./websitePublicationValidationService");
    const validation = await validateWebsitePublication(db, {
      organizationId: readiness.organizationId,
      churchId,
      branchId,
      actorUserId: input.actorUserId || null,
      deferServiceTimes: Boolean(input && input.deferServiceTimes),
      mobilePreviewConfirmed: Boolean(input && input.mobilePreviewConfirmed),
      relaxPreviewRequirement: Boolean(input && input.relaxPreviewRequirement),
      relaxReadinessGaps: Boolean(
        input &&
          (input.forcePublishVersion || branchId) &&
          String(readiness.websiteStatus || "") === "published"
      ),
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
      if (branchId) {
        const branchCheck = await client.query(
          `SELECT id FROM blessboard.branches
            WHERE id = $1 AND church_id = $2 AND status = 'active'
            LIMIT 1`,
          [branchId, churchId]
        );
        if (!branchCheck.rows[0]) {
          return { ok: false, status: STATUS.NOT_FOUND, reason: "branch_not_found" };
        }
      }

      // Re-check inside TX to avoid races leaving partial publishes.
      const inner = await evaluatePublishReadiness(client, {
        churchId,
        deferServiceTimes: Boolean(input && input.deferServiceTimes),
      });
      if (!inner.ok || !inner.ready) {
        const forcePublishVersion = Boolean(input && input.forcePublishVersion);
        const alreadyPublished = String(inner.websiteStatus || "") === "published";
        const fatalGaps = (inner.gaps || []).filter(
          (g) =>
            g === GAP.WEBSITE_SUSPENDED ||
            g === GAP.ORGANIZATION_NAME ||
            g === GAP.FIRST_BRANCH ||
            g === GAP.CUSTOM_DOMAIN_ENTITLEMENT
        );
        const allowDraftRepublish =
          forcePublishVersion && alreadyPublished && fatalGaps.length === 0;
        const allowBranchOntoPublishedChurch =
          Boolean(branchId) && alreadyPublished && fatalGaps.length === 0;
        if (!allowDraftRepublish && !allowBranchOntoPublishedChurch) {
          return {
            ok: false,
            status: inner.ok ? STATUS.NOT_READY : inner.status,
            reason: "not_ready",
            gaps: inner.gaps || [],
          };
        }
      }

      // Apply pending pencil drafts before snapshotting so HQ Publish matches
      // ActiveClinic: ✓ saves draft, Publish makes that copy live and versions it.
      let pendingOverlayDrafts = 0;
      if (inner.organizationId) {
        const fieldDraftRepo = require("../repositories/websiteInlineFieldDraftRepository");
        const structuredDraftRepo = require("../repositories/websiteStructuredDraftRepository");
        const [pendingField, pendingStructured] = await Promise.all([
          fieldDraftRepo.countDrafts(client, { churchId, branchId }),
          structuredDraftRepo.countStructuredDrafts(client, { churchId, branchId }),
        ]);
        pendingOverlayDrafts = Number(pendingField || 0) + Number(pendingStructured || 0);
        if (pendingOverlayDrafts > 0) {
          const { applyWebsiteDraftsInTransaction } = require("./websiteDraftApplyService");
          await applyWebsiteDraftsInTransaction(client, {
            organizationId: inner.organizationId,
            churchId,
            branchId,
          });
        }
      }

      // Narrow idempotency: rapid duplicate POSTs only when nothing new is waiting.
      // Phase 7 draft apply always forces a version even when CMS page rows stay published.
      const forcePublishVersion = Boolean(input && input.forcePublishVersion === true);
      if (!forcePublishVersion && inner.organizationId && input.actorUserId) {
        const draftRes = branchId
          ? await client.query(
              `SELECT COUNT(*)::int AS n
                 FROM blessboard.public_pages
                WHERE church_id = $1
                  AND branch_id = $2
                  AND status = 'draft'
                  AND page_key = ANY($3::text[])`,
              [churchId, branchId, PUBLIC_PAGE_KEYS.slice()]
            )
          : await client.query(
              `SELECT COUNT(*)::int AS n
                 FROM blessboard.public_pages
                WHERE church_id = $1
                  AND branch_id IS NULL
                  AND status = 'draft'
                  AND page_key = ANY($2::text[])`,
              [churchId, PUBLIC_PAGE_KEYS.slice()]
            );
        const draftN = draftRes.rows[0] ? Number(draftRes.rows[0].n) : 0;
        const approvedRes = branchId
          ? await client.query(
              `SELECT COUNT(*)::int AS n
                 FROM blessboard.website_change_submissions
                WHERE organization_id = $1
                  AND status = 'approved'
                  AND branch_id = $2`,
              [inner.organizationId, branchId]
            )
          : await client.query(
              `SELECT COUNT(*)::int AS n
                 FROM blessboard.website_change_submissions
                WHERE organization_id = $1
                  AND status = 'approved'`,
              [inner.organizationId]
            );
        const approvedN = approvedRes.rows[0] ? Number(approvedRes.rows[0].n) : 0;
        if (draftN === 0 && approvedN === 0 && pendingOverlayDrafts === 0) {
          const recentRes = branchId
            ? await client.query(
                `SELECT id, version_number, published_at, published_by
                   FROM blessboard.website_publication_versions
                  WHERE organization_id = $1
                    AND branch_id = $2
                    AND published_by = $3
                    AND status = 'published'
                    AND published_at > now() - interval '15 seconds'
                  ORDER BY published_at DESC
                  LIMIT 1`,
                [inner.organizationId, branchId, input.actorUserId]
              )
            : await client.query(
                `SELECT id, version_number, published_at, published_by
                   FROM blessboard.website_publication_versions
                  WHERE organization_id = $1
                    AND branch_id IS NULL
                    AND published_by = $2
                    AND status = 'published'
                    AND published_at > now() - interval '15 seconds'
                  ORDER BY published_at DESC
                  LIMIT 1`,
                [inner.organizationId, input.actorUserId]
              );
          const recent = recentRes.rows[0];
          if (recent && recent.id) {
            return {
              ok: true,
              status: STATUS.OK,
              publishedAt: recent.published_at
                ? new Date(recent.published_at).toISOString()
                : new Date().toISOString(),
              pageCount: PUBLIC_PAGE_KEYS.length,
              publicPath: inner.publicPath,
              organizationKey: inner.organizationKey,
              organizationId: inner.organizationId,
              churchId,
              branchId,
              alreadyPublished: true,
              idempotent: true,
              publicationVersionId: recent.id,
              publicationVersionNumber: recent.version_number,
              publishedSubmissionIds: [],
            };
          }
        }
      }

      await ensureRequiredDraftPages(client, churchId, branchId);

      const publishedAt = new Date();
      const pageUpdate = branchId
        ? await client.query(
            `UPDATE blessboard.public_pages
                SET status = 'published',
                    published_at = COALESCE(published_at, $3::timestamptz),
                    updated_at = now()
              WHERE church_id = $1
                AND branch_id = $2
                AND page_key = ANY($4::text[])
                AND status <> 'archived'
            RETURNING id, page_key, status`,
            [churchId, branchId, publishedAt.toISOString(), PUBLIC_PAGE_KEYS.slice()]
          )
        : await client.query(
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

      // Church-wide publish flips site flag; branch publish must not mutate main website status.
      if (!branchId) {
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
      }

      const fieldKeys = [];
      if (input && input.deferServiceTimes) fieldKeys.push("service_times_deferred");

      await recordAuditEventSafe(client, {
        deploymentCode: deploymentCode(input && input.env),
        organizationId: inner.organizationId,
        churchId,
        branchId,
        actorUserId: input.actorUserId || null,
        actionKey: "website.published",
        entityType: branchId ? "branch" : "church",
        entityId: branchId || churchId,
        outcome: "success",
        metadata: {
          from_status: inner.websiteStatus || "draft",
          to_status: branchId ? inner.websiteStatus || "draft" : "published",
          count: pageUpdate.rowCount,
          field_keys: fieldKeys.length ? fieldKeys : undefined,
          source: "hq_website",
          plan_key: inner.planKey || undefined,
          website_scope: branchId ? "branch" : "church",
          branch_id: branchId || undefined,
        },
      });

      let publicationVersion = null;
      try {
        const submissionRepo = require("../repositories/websiteChangeSubmissionRepository");
        const publishedSubmissionIds = await submissionRepo.markApprovedSubmissionsPublished(
          client,
          inner.organizationId,
          input.actorUserId || null,
          branchId
        );

        const versionSvc = require("./websitePublicationVersionService");
        publicationVersion = await versionSvc.recordPublishVersionInTransaction(client, {
          organizationId: inner.organizationId,
          churchId,
          branchId,
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
        const {
          publishFromLegacy,
        } = require("../../platform/website-engine/blessboardBridge");
        const enginePublished = await publishFromLegacy(client, {
          organizationId: inner.organizationId,
          churchId,
          branchId,
          actorIdentityId: input.actorUserId || null,
          slug: inner.organizationKey,
        });
        if (!enginePublished.ok) {
          throw Object.assign(new Error("website_engine_publish_failed"), {
            code: "WEBSITE_ENGINE_PUBLISH",
            engineCode: enginePublished.code,
          });
        }
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
        organizationId: inner.organizationId,
        churchId,
        branchId,
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
    if (process.env.BLESSBOARD_DEBUG_PUBLISH === "1") {
      // eslint-disable-next-line no-console
      console.error("[publishChurchWebsite]", err && err.message, err && err.code, err && err.stack);
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

      const {
        unpublishFromLegacy,
      } = require("../../platform/website-engine/blessboardBridge");
      await unpublishFromLegacy(client, {
        organizationId: String(ctx.organization_id),
        churchId,
        actorIdentityId: input.actorUserId || null,
        grantedPermissions: ["website.publish"],
        syncProductAvailability: false,
        reason: "tenant_unpublish",
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

/**
 * Seed a safe home welcome section when missing (never overwrite existing copy).
 * Uses provision-safe column sets (no revision_number).
 * @param {{ query: Function }} client
 * @param {{ churchId: string, publicName: string }} fields
 */
async function ensureInitialHomeWelcomeSection(client, fields) {
  const churchId = String((fields && fields.churchId) || "").trim();
  const publicName =
    String((fields && fields.publicName) || "").trim() || "Church";
  if (!UUID_RE.test(churchId)) return { created: false };

  const pageResult = await publicContentRepo.ensureDraftPage(client, {
    churchId,
    branchId: null,
    pageKey: "home",
    title: PAGE_KEY_TITLES.home || "Home",
  });
  const page = pageResult && pageResult.page;
  if (!page || !page.id) return { created: false, page: null };

  const existing = await publicContentRepo.findSectionByPageAndKeyForProvision(
    client,
    page.id,
    "welcome"
  );
  if (existing) return { created: false, page, section: existing };

  const section = await publicContentRepo.insertSection(client, {
    pageId: page.id,
    sectionKey: "welcome",
    sectionType: "text",
    heading: `Welcome to ${publicName}`,
    bodyText:
      `${publicName} is getting started on BlessBoard. ` +
      "Update this homepage from Church Website when you are ready.",
    mediaUrl: null,
    sortOrder: 0,
    status: "draft",
    layoutMetadata: null,
  });
  return { created: true, page, section };
}

/**
 * First-time Foundation publish inside an existing provisioning transaction.
 * Publishes required pages + draft sections and sets website_status=published
 * so `/c/:organizationKey` is immediately usable. Skips HQ readiness gates
 * (preview ack / service-times) that block first publish after approval.
 *
 * @param {{ query: Function }} client
 * @param {{
 *   churchId: string,
 *   organizationId: string,
 *   organizationKey: string,
 *   publicName?: string|null,
 *   actorUserId?: string|null,
 *   env?: object,
 *   source?: string,
 * }} input
 */
async function publishInitialFoundationWebsite(client, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const organizationKey = String((input && input.organizationKey) || "")
    .trim()
    .toLowerCase();
  if (!UUID_RE.test(churchId) || !UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  const keyNorm = normalizeOrganizationKey(organizationKey);
  if (!keyNorm.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_key" };
  }

  const settings = await settingsRepo.findChurchSettings(client, churchId);
  if (settings && String(settings.websiteStatus || "") === "published") {
    const publishedPages = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.public_pages
        WHERE church_id = $1
          AND branch_id IS NULL
          AND status = 'published'
          AND page_key = ANY($2::text[])`,
      [churchId, PUBLIC_PAGE_KEYS.slice()]
    );
    const n = publishedPages.rows[0] ? Number(publishedPages.rows[0].n) : 0;
    if (n === PUBLIC_PAGE_KEYS.length) {
      return {
        ok: true,
        status: STATUS.OK,
        alreadyPublished: true,
        publicPath: buildPublicOrganizationWebsitePath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: keyNorm.key,
        }),
        organizationKey: keyNorm.key,
        pageCount: n,
      };
    }
  }

  const publicName =
    String((input && input.publicName) || "").trim() ||
    (settings && settings.publicName) ||
    "Church";

  await ensureRequiredDraftPages(client, churchId);
  const {
    seedTenantOwnedWebsiteTemplateContent,
  } = require("./seedTenantWebsiteTemplateContent");
  await seedTenantOwnedWebsiteTemplateContent(client, {
    churchId,
    publicName,
    primaryEmail: (input && input.primaryEmail) || null,
    primaryPhone: (input && input.primaryPhone) || null,
    address: (input && input.address) || (input && input.city) || null,
    city: (input && input.city) || null,
  });
  await ensureInitialHomeWelcomeSection(client, { churchId, publicName });

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

  await client.query(
    `UPDATE blessboard.page_sections ps
        SET status = 'published',
            updated_at = now()
       FROM blessboard.public_pages pp
      WHERE ps.page_id = pp.id
        AND pp.church_id = $1
        AND pp.branch_id IS NULL
        AND pp.page_key = ANY($2::text[])
        AND ps.status = 'draft'`,
    [churchId, PUBLIC_PAGE_KEYS.slice()]
  );

  await settingsRepo.ensureChurchSettingsRow(client, {
    churchId,
    publicName,
  });
  const existing = await settingsRepo.findChurchSettings(client, churchId);
  await settingsRepo.upsertChurchSettings(client, churchId, {
    publicName: (existing && existing.publicName) || publicName,
    denomination: existing ? existing.denomination : null,
    primaryEmail: existing ? existing.primaryEmail : null,
    primaryPhone: existing ? existing.primaryPhone : null,
    defaultTimezone: existing ? existing.defaultTimezone : null,
    defaultCountryCode: existing ? existing.defaultCountryCode : null,
    websiteStatus: "published",
  });

  await appRepo.ensureOrganizationOnboardingRow(client, { organizationId });
  await appRepo.updateOrganizationOnboarding(client, organizationId, {
    previewAcknowledged: true,
    onboardingStatus: "in_progress",
    onboardingStartedAt: publishedAt.toISOString(),
    lastActivityAt: publishedAt.toISOString(),
  });

  await recordAuditEventSafe(client, {
    deploymentCode: deploymentCode(input && input.env),
    organizationId,
    churchId,
    branchId: null,
    actorUserId: (input && input.actorUserId) || null,
    actionKey: "website.published",
    entityType: "church",
    entityId: churchId,
    outcome: "success",
    metadata: {
      from_status: (settings && settings.websiteStatus) || "draft",
      to_status: "published",
      count: pageUpdate.rowCount,
      source: (input && input.source) || "registration_provision",
      initial_foundation_publish: true,
    },
  });

  let publicationVersionId = null;
  let publicationVersionNumber = null;
  await client.query("SAVEPOINT initial_foundation_publish_version");
  try {
    const versionSvc = require("./websitePublicationVersionService");
    const publicationVersion = await versionSvc.recordPublishVersionInTransaction(client, {
      organizationId,
      churchId,
      actorUserId: (input && input.actorUserId) || null,
      publishedAt: publishedAt.toISOString(),
      sourceType: "initial_setup",
      publicationNote: "Initial Foundation website published at registration approval",
      publishedSubmissionIds: [],
      alreadyPublished: false,
    });
    publicationVersionId = publicationVersion && publicationVersion.id;
    publicationVersionNumber = publicationVersion && publicationVersion.versionNumber;
    await client.query("RELEASE SAVEPOINT initial_foundation_publish_version");
  } catch (versionErr) {
    try {
      await client.query("ROLLBACK TO SAVEPOINT initial_foundation_publish_version");
    } catch {
      /* ignore */
    }
    const pgCode = versionErr && versionErr.code ? String(versionErr.code) : "";
    // Hosted DBs may lag migrations 041+/043; public route only needs website_status.
    if (pgCode !== "42P01" && pgCode !== "42703") {
      throw versionErr;
    }
  }

  try {
    const { publishFromLegacy } = require("../../platform/website-engine/blessboardBridge");
    await publishFromLegacy(client, {
      organizationId,
      churchId,
      actorIdentityId: (input && input.actorUserId) || null,
      slug: keyNorm.key,
    });
  } catch {
    /* Shared-engine backfill must not fail registration. */
  }

  return {
    ok: true,
    status: STATUS.OK,
    alreadyPublished: false,
    publishedAt: publishedAt.toISOString(),
    pageCount: pageUpdate.rowCount,
    publicPath: buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: keyNorm.key,
    }),
    organizationKey: keyNorm.key,
    publicationVersionId,
    publicationVersionNumber,
  };
}

module.exports = {
  STATUS,
  GAP,
  PUBLIC_PAGE_KEYS,
  evaluatePublishReadiness,
  acknowledgeWebsitePreview,
  publishChurchWebsite,
  publishInitialFoundationWebsite,
  ensureInitialHomeWelcomeSection,
  unpublishChurchWebsite,
  ensureRequiredDraftPages,
};

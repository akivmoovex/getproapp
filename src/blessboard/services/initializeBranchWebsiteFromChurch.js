"use strict";

/**
 * HQ snapshot → branch-owned website initialization.
 *
 * Copies structure/design/eligible content once. Does not keep live HQ fallback
 * after completion. Idempotent: completed → already_initialized; never overwrites
 * published branch content or human overrides flagged as partially_edited.
 */

const governanceRepo = require("../repositories/branchWebsiteGovernanceRepository");
const scopeSettingsRepo = require("../repositories/websiteScopeSettingsRepository");
const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const publicContentRepo = require("../repositories/publicContentRepository");
const versionRepo = require("../repositories/websitePublicationVersionRepository");
const {
  assertBranchBelongsToOrg,
  ensureBranchWebsiteGovernance,
} = require("./branchWebsiteGovernanceService");
const {
  createBranchPageOverride,
} = require("./websiteBranchPageInheritanceService");
const { PUBLIC_PAGE_KEYS, PAGE_KEY_TITLES } = require("./publicContentConstants");
const {
  buildPublicationSnapshot,
} = require("./websitePublicationVersionService");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
const registry = require("./websiteSettingKeyRegistry");

const STATUS = Object.freeze({
  OK: "ok",
  ALREADY_INITIALIZED: "already_initialized",
  PARTIALLY_EDITED: "partially_edited",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
  FAILED: "failed",
});

const INIT_STATUS = governanceRepo.INIT_STATUS;

const SOCIAL_CHANNEL_TYPES = Object.freeze(
  new Set([
    "facebook",
    "instagram",
    "twitter",
    "x",
    "youtube",
    "tiktok",
    "linkedin",
    "whatsapp",
    "telegram",
    "vimeo",
    "spotify",
    "website",
    "social",
  ])
);

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
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

function safeErrorCode(err) {
  if (!err) return "unknown";
  if (err.code) return String(err.code).slice(0, 64);
  if (err.message) return String(err.message).slice(0, 120);
  return "unknown";
}

/**
 * @param {{ query: Function }} db
 * @param {string} branchId
 */
async function isBranchWebsiteInitialized(db, branchId) {
  if (!governanceRepo.isUuid(branchId)) return false;
  try {
    const row = await governanceRepo.findByBranchId(db, branchId);
    return Boolean(
      row && row.websiteInitializationStatus === INIT_STATUS.COMPLETED
    );
  } catch {
    return false;
  }
}

/**
 * Detect intentional branch website content that must not be overwritten.
 * Draft-only page overrides from a prior failed init are allowed to continue.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId: string }} scope
 */
async function detectPartialHumanEdits(client, scope) {
  const publishedPages = await client.query(
    `SELECT 1 FROM blessboard.public_pages
      WHERE church_id = $1 AND branch_id = $2 AND status = 'published'
      LIMIT 1`,
    [scope.churchId, scope.branchId]
  );
  if (publishedPages.rows[0]) {
    return { partial: true, reason: "published_branch_pages" };
  }

  try {
    const overrides = await scopeSettingsRepo.listActiveForBranch(client, scope);
    if (overrides && overrides.length > 0) {
      return { partial: true, reason: "scope_setting_overrides" };
    }
  } catch {
    /* table may be absent on lagging hosts */
  }

  const entityTables = ["leaders", "ministries", "events", "sermons", "giving_methods"];
  for (const table of entityTables) {
    const res = await client.query(
      `SELECT 1 FROM blessboard.${table}
        WHERE church_id = $1 AND branch_id = $2 AND status = 'published'
        LIMIT 1`,
      [scope.churchId, scope.branchId]
    );
    if (res.rows[0]) {
      return { partial: true, reason: `published_${table}` };
    }
  }

  return { partial: false, reason: null };
}

/**
 * Copy HQ identity/SEO/presentation settings into branch overrides, replacing
 * location-sensitive fields from branch_settings / branch row.
 */
async function seedBranchScopeSettings(client, input) {
  const { organizationId, churchId, branchId, actorUserId, branchRow, branchSettings, churchSettings } =
    input;

  const branchName =
    (branchSettings && branchSettings.publicName) ||
    (branchRow && branchRow.display_name) ||
    "Branch";
  const churchName =
    (churchSettings && churchSettings.publicName) || "Church";

  /** @type {Record<string, unknown>} */
  const seed = {
    "identity.branch_display_name": branchName,
    "presentation.branch_display_label": branchName,
    "presentation.parent_church_label": churchName,
    "presentation.branch_selector_label": "Locations",
    "presentation.accent_key": "none",
    "seo.title": `${branchName}`,
    "seo.og_title": `${branchName}`,
    "seo.noindex": false,
  };

  if (branchSettings) {
    if (branchSettings.phone) seed["contact.phone"] = String(branchSettings.phone);
    if (branchSettings.email) seed["contact.email"] = String(branchSettings.email);
    if (branchSettings.addressLine1) {
      seed["contact.address_line_1"] = String(branchSettings.addressLine1);
    }
    if (branchSettings.addressLine2) {
      seed["contact.address_line_2"] = String(branchSettings.addressLine2);
    }
    if (branchSettings.city) seed["contact.city"] = String(branchSettings.city);
    if (branchSettings.provinceState) {
      seed["contact.province"] = String(branchSettings.provinceState);
    }
    if (branchSettings.countryCode) {
      seed["contact.country"] = String(branchSettings.countryCode);
    }
    if (branchSettings.postalCode) {
      seed["contact.postal_code"] = String(branchSettings.postalCode);
    }
  }

  // Copy non-location HQ presentation overrides only when branch has no value yet.
  // Hero/tagline are copied as structure from HQ home sections via page override;
  // optional SEO description left empty for review when not branch-specific.

  for (const [settingKey, value] of Object.entries(seed)) {
    if (!registry.normalizeSettingKey(settingKey)) continue;
    const existing = await scopeSettingsRepo.findActive(client, {
      churchId,
      branchId,
      settingKey,
    });
    if (existing) continue;
    await scopeSettingsRepo.upsertActive(client, {
      organizationId,
      churchId,
      branchId,
      settingKey,
      inheritanceState: "override",
      valueJson: registry.toValueJson(value),
      updatedBy: actorUserId || null,
    });
  }
}

/**
 * Copy published HQ entity lists into branch drafts when branch has none.
 * Skips giving_methods (payment details must not be copied blindly).
 * Contact channels: social types only.
 */
async function seedBranchEntities(client, scope) {
  const { churchId, branchId } = scope;

  async function copyIfEmpty(listFn, insertFn, mapFields, filterFn) {
    const existing = await listFn(client, { churchId, branchId });
    if (existing && existing.length > 0) return 0;
    const churchItems = await listFn(client, {
      churchId,
      branchId: null,
      status: "published",
    });
    let copied = 0;
    for (const item of churchItems || []) {
      if (filterFn && !filterFn(item)) continue;
      await insertFn(client, {
        churchId,
        branchId,
        ...mapFields(item),
        status: "draft",
      });
      copied += 1;
    }
    return copied;
  }

  await copyIfEmpty(
    publicContentRepo.listLeaders,
    publicContentRepo.insertLeader,
    (item) => ({
      displayName: item.displayName,
      roleTitle: item.roleTitle,
      biography: item.biography,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
    })
  );

  await copyIfEmpty(
    publicContentRepo.listMinistries,
    publicContentRepo.insertMinistry,
    (item) => ({
      name: item.name,
      summary: item.summary,
      description: item.description,
      meetingDay: item.meetingDay,
      contactEmail: item.contactEmail,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
      joinPolicy: item.joinPolicy,
    })
  );

  await copyIfEmpty(
    publicContentRepo.listEvents,
    publicContentRepo.insertEvent,
    (item) => ({
      title: item.title,
      summary: item.summary,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      timezone: item.timezone,
      location: item.location,
      registrationUrl: item.registrationUrl,
      imageUrl: item.imageUrl,
      capacity: item.capacity,
    })
  );

  await copyIfEmpty(
    publicContentRepo.listSermons,
    publicContentRepo.insertSermon,
    (item) => ({
      title: item.title,
      speakerName: item.speakerName,
      preachedAt: item.preachedAt,
      summary: item.summary,
      mediaUrl: item.mediaUrl,
      resourceUrl: item.resourceUrl,
    })
  );

  await copyIfEmpty(
    publicContentRepo.listContactChannels,
    publicContentRepo.insertContactChannel,
    (item) => ({
      channelType: item.channelType,
      label: item.label,
      value: item.value,
      sortOrder: item.sortOrder,
    }),
    (item) => SOCIAL_CHANNEL_TYPES.has(String(item.channelType || "").toLowerCase())
  );

  // Intentionally do not copy giving_methods (bank / mobile-money details).
}

/**
 * Record an initial draft version for the branch website.
 */
async function recordInitializationVersion(client, input) {
  const existing = await client.query(
    `SELECT id, version_number, status, source_type, created_at
       FROM blessboard.website_publication_versions
      WHERE organization_id = $1
        AND church_id = $2
        AND branch_id = $3
        AND source_type = 'initial_setup'
      ORDER BY version_number ASC
      LIMIT 1`,
    [input.organizationId, input.churchId, input.branchId]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    return {
      id: row.id,
      versionNumber: row.version_number,
      status: row.status,
      sourceType: row.source_type,
      createdAt: row.created_at,
      reused: true,
    };
  }

  const versionNumber = await versionRepo.getNextVersionNumber(
    client,
    input.organizationId
  );
  const snapshot = await buildPublicationSnapshot(
    client,
    input.churchId,
    input.branchId
  );
  const changeSummary = {
    label: "Initialized from HQ website",
    publicationNote: "Initialized from HQ website",
    sourceHqVersionId: input.sourceHqVersionId || null,
    initializedAt: new Date().toISOString(),
    branchId: input.branchId,
  };
  // source_version_id / restoration_reason are reserved for content_restoration
  // (wpv_restoration_consistency). HQ source is stored in change_summary_json and
  // branch_website_governance.initialized_from_version_id.
  const res = await client.query(
    `INSERT INTO blessboard.website_publication_versions (
       organization_id, church_id, branch_id, version_number, status, theme_key, source_type,
       snapshot_json, change_summary_json, created_by
     ) VALUES (
       $1, $2, $3, $4, 'draft', $5, 'initial_setup',
       $6::jsonb, $7::jsonb, $8
     )
     RETURNING id, version_number, status, source_type, created_at`,
    [
      input.organizationId,
      input.churchId,
      input.branchId,
      versionNumber,
      (snapshot && snapshot.themeKey) || "default",
      JSON.stringify(snapshot || {}),
      JSON.stringify(changeSummary),
      input.actorUserId || null,
    ]
  );
  const row = res.rows[0];
  return row
    ? {
        id: row.id,
        versionNumber: row.version_number,
        status: row.status,
        sourceType: row.source_type,
        createdAt: row.created_at,
        reused: false,
      }
    : null;
}

/**
 * Canonical branch website initialization from current HQ website.
 *
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId: string,
 *   actorUserId?: string|null,
 *   forceRetry?: boolean,
 * }} input
 */
async function initializeBranchWebsiteFromChurch(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const actorUserId =
    input && input.actorUserId != null && String(input.actorUserId).trim()
      ? String(input.actorUserId).trim()
      : null;
  const forceRetry = Boolean(input && input.forceRetry);

  const check = await assertBranchBelongsToOrg(db, {
    organizationId,
    churchId,
    branchId,
  });
  if (!check.ok) {
    return {
      ok: false,
      status: check.status,
      reason: check.status,
      initializationStatus: null,
    };
  }

  try {
    await ensureBranchWebsiteGovernance(db, {
      organizationId,
      churchId,
      branchId,
      updatedBy: actorUserId,
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.FAILED,
      reason: "governance_unavailable",
      message: "Branch website governance is unavailable.",
      initializationStatus: INIT_STATUS.FAILED,
      errorCode: safeErrorCode(err),
    };
  }

  let governance = await governanceRepo.findByBranchId(db, branchId);
  if (!governance) {
    return {
      ok: false,
      status: STATUS.FAILED,
      reason: "governance_missing",
      initializationStatus: INIT_STATUS.FAILED,
    };
  }

  if (governance.websiteInitializationStatus === INIT_STATUS.COMPLETED) {
    return {
      ok: true,
      status: STATUS.ALREADY_INITIALIZED,
      reason: "already_initialized",
      initializationStatus: INIT_STATUS.COMPLETED,
      initializedAt: governance.initializedAt,
      initializedFromVersionId: governance.initializedFromVersionId,
      branchId,
    };
  }

  try {
    const partial = await withClient(db, async (client) =>
      detectPartialHumanEdits(client, { churchId, branchId })
    );
    if (partial.partial && !forceRetry) {
      const statusAllowsRetry =
        governance.websiteInitializationStatus === INIT_STATUS.FAILED ||
        governance.websiteInitializationStatus === INIT_STATUS.INITIALIZING;
      if (!statusAllowsRetry) {
        await recordBlessBoardAudit(db, {
          churchId,
          organizationId,
          branchId,
          actorUserId,
          actionKey: "website.branch_initialization_skipped",
          entityType: "branch_website",
          entityId: branchId,
          outcome: "denied",
          metadata: {
            reason: "partially_edited",
            detail: partial.reason,
          },
        });
        return {
          ok: false,
          status: STATUS.PARTIALLY_EDITED,
          reason: "partially_edited",
          detail: partial.reason,
          initializationStatus: governance.websiteInitializationStatus,
          branchId,
        };
      }
    }

    await governanceRepo.updateInitialization(db, {
      branchId,
      websiteInitializationStatus: INIT_STATUS.INITIALIZING,
      updatedBy: actorUserId,
    });

    await recordBlessBoardAudit(db, {
      churchId,
      organizationId,
      branchId,
      actorUserId,
      actionKey: "website.branch_initialization_requested",
      entityType: "branch_website",
      entityId: branchId,
      outcome: "success",
      metadata: {
        force_retry: forceRetry,
      },
    });

    const hqVersion = await versionRepo.getCurrentPublishedVersion(
      db,
      organizationId,
      null
    );
    const sourceHqVersionId = hqVersion && hqVersion.id ? hqVersion.id : null;

    const pagesCopied = [];
    for (const pageKey of PUBLIC_PAGE_KEYS) {
      const result = await createBranchPageOverride(db, {
        organizationId,
        churchId,
        branchId,
        pageKey,
        actorUserId,
      });
      pagesCopied.push({
        pageKey,
        ok: Boolean(result && result.ok),
        title: PAGE_KEY_TITLES[pageKey] || pageKey,
      });
    }

    await withClient(db, async (client) => {
      const branchRowRes = await client.query(
        `SELECT id, display_name, branch_key, status
           FROM blessboard.branches WHERE id = $1 LIMIT 1`,
        [branchId]
      );
      const branchRow = branchRowRes.rows[0] || null;
      const branchSettings = await settingsRepo.findBranchSettings(client, branchId);
      const churchSettings = await settingsRepo.findChurchSettings(client, churchId);

      await seedBranchScopeSettings(client, {
        organizationId,
        churchId,
        branchId,
        actorUserId,
        branchRow,
        branchSettings,
        churchSettings,
      });
      await seedBranchEntities(client, { churchId, branchId });
    });

    const initVersion = await withClient(db, async (client) =>
      recordInitializationVersion(client, {
        organizationId,
        churchId,
        branchId,
        actorUserId,
        sourceHqVersionId,
      })
    );

    governance = await governanceRepo.updateInitialization(db, {
      branchId,
      websiteInitializationStatus: INIT_STATUS.COMPLETED,
      initializedFromVersionId: sourceHqVersionId,
      initializedAt: new Date().toISOString(),
      updatedBy: actorUserId,
    });

    await recordBlessBoardAudit(db, {
      churchId,
      organizationId,
      branchId,
      actorUserId,
      actionKey: "website.branch_initialization_completed",
      entityType: "branch_website",
      entityId: branchId,
      outcome: "success",
      metadata: {
        source_hq_version_id: sourceHqVersionId,
        branch_version_id: initVersion && initVersion.id ? initVersion.id : null,
        pages_copied: pagesCopied.map((p) => p.pageKey),
        giving_methods_copied: false,
      },
    });

    return {
      ok: true,
      status: STATUS.OK,
      reason: "initialized",
      initializationStatus: INIT_STATUS.COMPLETED,
      initializedAt: governance && governance.initializedAt,
      initializedFromVersionId: sourceHqVersionId,
      branchVersionId: initVersion && initVersion.id ? initVersion.id : null,
      pagesCopied,
      branchId,
      draft: true,
    };
  } catch (err) {
    const errorCode = safeErrorCode(err);
    try {
      await governanceRepo.updateInitialization(db, {
        branchId,
        websiteInitializationStatus: INIT_STATUS.FAILED,
        initializationError: errorCode,
        updatedBy: actorUserId,
      });
    } catch {
      /* ignore secondary failure */
    }
    try {
      await recordBlessBoardAudit(db, {
        churchId,
        organizationId,
        branchId,
        actorUserId,
        actionKey: "website.branch_initialization_failed",
        entityType: "branch_website",
        entityId: branchId,
        outcome: "failure",
        metadata: {
          error_code: errorCode,
          force_retry: forceRetry,
        },
      });
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: STATUS.FAILED,
      reason: "initialization_failed",
      errorCode,
      initializationStatus: INIT_STATUS.FAILED,
      branchId,
    };
  }
}

module.exports = {
  STATUS,
  INIT_STATUS,
  initializeBranchWebsiteFromChurch,
  isBranchWebsiteInitialized,
  detectPartialHumanEdits,
};

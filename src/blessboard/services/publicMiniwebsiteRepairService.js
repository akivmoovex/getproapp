"use strict";

/**
 * Idempotent repair for approved churches missing a usable public miniwebsite
 * at /c/:organizationKey. Never mutates a valid organization_key (immutable).
 * Never overwrites existing page/section copy; only publishes drafts when the
 * site is not yet publicly live.
 */

const {
  repairWebsiteFoundation,
  inspectWebsiteFoundationGaps,
  ensureMinimalDraftPages,
} = require("./websiteFoundationRepairService");
const {
  publishInitialFoundationWebsite,
} = require("./churchWebsitePublishService");
const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const { PUBLIC_PAGE_KEYS } = require("./publicContentConstants");
const { normalizeOrganizationKey } = require("./organizationKey");
const { publicChurchHomePath } = require("../urls/churchUrlHelper");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
  BLOCKED: "blocked",
});

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {(fn: (client: { query: Function }) => Promise<any>) => Promise<any>} runInTx
 */
async function withClient(db, runInTx) {
  if (typeof db.connect === "function") {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await runInTx(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }
  return runInTx(db);
}

/**
 * @param {{ query: Function }} client
 * @param {{ organizationId?: string|null, organizationKey?: string|null, applicationId?: string|null }} target
 */
async function resolveRepairTarget(client, target) {
  const organizationId = String((target && target.organizationId) || "").trim();
  const organizationKey = String((target && target.organizationKey) || "")
    .trim()
    .toLowerCase();
  const applicationId = String((target && target.applicationId) || "").trim();

  if (organizationId) {
    const r = await client.query(
      `SELECT o.id AS organization_id, o.organization_key, o.display_name, o.status AS organization_status,
              c.id AS church_id, c.display_name AS church_display_name, c.status AS church_status
         FROM platform.organizations o
         LEFT JOIN blessboard.churches c ON c.organization_id = o.id
        WHERE o.id = $1
        ORDER BY c.created_at ASC NULLS LAST
        LIMIT 1`,
      [organizationId]
    );
    return r.rows[0] || null;
  }

  if (organizationKey) {
    const r = await client.query(
      `SELECT o.id AS organization_id, o.organization_key, o.display_name, o.status AS organization_status,
              c.id AS church_id, c.display_name AS church_display_name, c.status AS church_status
         FROM platform.organizations o
         LEFT JOIN blessboard.churches c ON c.organization_id = o.id
        WHERE o.organization_key = $1
        ORDER BY c.created_at ASC NULLS LAST
        LIMIT 1`,
      [organizationKey]
    );
    return r.rows[0] || null;
  }

  if (applicationId) {
    const r = await client.query(
      `SELECT o.id AS organization_id, o.organization_key, o.display_name, o.status AS organization_status,
              c.id AS church_id, c.display_name AS church_display_name, c.status AS church_status,
              a.id AS application_id, a.provisioning_status, a.application_status
         FROM blessboard.platform_church_registration_applications a
         LEFT JOIN platform.organizations o ON o.id = a.organization_id
         LEFT JOIN blessboard.churches c ON c.organization_id = o.id
        WHERE a.id = $1
        ORDER BY c.created_at ASC NULLS LAST
        LIMIT 1`,
      [applicationId]
    );
    return r.rows[0] || null;
  }

  return null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function inspectPublicationGaps(client, churchId) {
  const gaps = [];
  const settings = await settingsRepo.findChurchSettings(client, churchId);
  const websiteStatus = settings ? String(settings.websiteStatus || "draft") : null;
  if (!settings) gaps.push("church_settings");
  else if (websiteStatus !== "published") gaps.push("website_status_not_published");

  for (const pageKey of PUBLIC_PAGE_KEYS) {
    const page = await client.query(
      `SELECT id, status FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id IS NULL AND page_key = $2
        LIMIT 1`,
      [churchId, pageKey]
    );
    if (!page.rows[0]) gaps.push(`page_missing:${pageKey}`);
    else if (String(page.rows[0].status) !== "published") {
      gaps.push(`page_unpublished:${pageKey}`);
    }
  }

  return {
    websiteStatus: websiteStatus || "missing",
    gaps,
    needsPublish: gaps.some(
      (g) =>
        g === "website_status_not_published" ||
        g.startsWith("page_unpublished:") ||
        g.startsWith("page_missing:")
    ),
  };
}

/**
 * Read-only inspection for dry-run.
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId?: string|null,
 *   organizationKey?: string|null,
 *   applicationId?: string|null,
 * }} input
 */
async function inspectPublicMiniwebsiteRepair(db, input) {
  try {
    return await withClient(db, async (client) => {
      // Dry-run should not leave an open write TX effect — still use BEGIN/COMMIT
      // so locks are consistent; no writes happen below.
      const row = await resolveRepairTarget(client, input || {});
      if (!row || !row.organization_id) {
        return {
          ok: false,
          status: STATUS.NOT_FOUND,
          reason: "target_not_found",
          before: null,
          plannedActions: [],
        };
      }

      const keyNorm = normalizeOrganizationKey(row.organization_key);
      const before = {
        organizationId: String(row.organization_id),
        organizationKey: row.organization_key || null,
        organizationKeyValid: Boolean(keyNorm.ok),
        organizationStatus: row.organization_status || null,
        churchId: row.church_id ? String(row.church_id) : null,
        churchDisplayName: row.church_display_name || row.display_name || null,
        publicPath: keyNorm.ok ? publicChurchHomePath(keyNorm.key) : null,
      };

      const plannedActions = [];
      if (!keyNorm.ok) {
        plannedActions.push({
          action: "blocked_invalid_organization_key",
          detail:
            "organization_key is immutable and invalid; cannot auto-repair public path",
        });
        return {
          ok: true,
          status: STATUS.BLOCKED,
          before,
          plannedActions,
          needsRepair: true,
        };
      }

      if (!row.church_id) {
        plannedActions.push({
          action: "blocked_missing_church",
          detail: "organization has no church row",
        });
        return {
          ok: true,
          status: STATUS.BLOCKED,
          before,
          plannedActions,
          needsRepair: true,
        };
      }

      const foundation = await inspectWebsiteFoundationGaps(client, {
        churchId: String(row.church_id),
      });
      if (foundation.needsRepair) {
        plannedActions.push({
          action: "repair_website_foundation",
          gaps: foundation.gaps,
        });
      }

      const publication = await inspectPublicationGaps(client, String(row.church_id));
      before.websiteStatus = publication.websiteStatus;
      before.publicationGaps = publication.gaps;
      if (publication.needsPublish) {
        plannedActions.push({
          action: "publish_initial_foundation_website",
          gaps: publication.gaps,
        });
      }

      return {
        ok: true,
        status: STATUS.OK,
        before,
        plannedActions,
        needsRepair: plannedActions.length > 0,
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "inspect_failed" };
  }
}

/**
 * Apply idempotent repair (or dry-run via inspect only when dryRun=true).
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   organizationId?: string|null,
 *   organizationKey?: string|null,
 *   applicationId?: string|null,
 *   dryRun?: boolean,
 *   actorUserId?: string|null,
 *   env?: object,
 * }} input
 */
async function repairPublicMiniwebsite(db, input) {
  const dryRun = Boolean(input && input.dryRun);
  if (dryRun) {
    const inspection = await inspectPublicMiniwebsiteRepair(db, input);
    return {
      ...inspection,
      dryRun: true,
      applied: false,
      after: null,
    };
  }

  try {
    return await withClient(db, async (client) => {
      const row = await resolveRepairTarget(client, input || {});
      if (!row || !row.organization_id) {
        return {
          ok: false,
          status: STATUS.NOT_FOUND,
          reason: "target_not_found",
          dryRun: false,
          applied: false,
        };
      }

      const keyNorm = normalizeOrganizationKey(row.organization_key);
      const before = {
        organizationId: String(row.organization_id),
        organizationKey: row.organization_key || null,
        organizationKeyValid: Boolean(keyNorm.ok),
        churchId: row.church_id ? String(row.church_id) : null,
        websiteStatus: null,
      };

      if (!keyNorm.ok) {
        return {
          ok: false,
          status: STATUS.BLOCKED,
          reason: "invalid_organization_key_immutable",
          before,
          dryRun: false,
          applied: false,
        };
      }
      if (!row.church_id) {
        return {
          ok: false,
          status: STATUS.BLOCKED,
          reason: "missing_church",
          before,
          dryRun: false,
          applied: false,
        };
      }

      const churchId = String(row.church_id);
      const organizationId = String(row.organization_id);
      const publicName =
        String(row.church_display_name || row.display_name || "").trim() || "Church";

      const pubBefore = await inspectPublicationGaps(client, churchId);
      before.websiteStatus = pubBefore.websiteStatus;
      before.publicationGaps = pubBefore.gaps;

      const foundation = await repairWebsiteFoundation(client, {
        churchId,
        publicName,
        actorUserId: (input && input.actorUserId) || null,
        auditReason: "repair_public_miniwebsite",
      });
      // repairWebsiteFoundation opens its own TX when given a pool; when given
      // a client without connect, withClient in that module runs fn directly.
      // Pass client here — websiteFoundationRepairService.withClient detects connect.
      // Our client has no connect, so it uses runInTx(db) path. Good.

      if (!foundation.ok) {
        // repairWebsiteFoundation may have used nested BEGIN on pool; on client it
        // should not. Re-run foundation pieces inline if needed.
        await ensureMinimalDraftPages(client, churchId);
        await settingsRepo.ensureChurchSettingsRow(client, {
          churchId,
          publicName,
        });
      }

      const published = await publishInitialFoundationWebsite(client, {
        churchId,
        organizationId,
        organizationKey: keyNorm.key,
        publicName,
        actorUserId: (input && input.actorUserId) || null,
        env: (input && input.env) || process.env,
        source: "public_miniwebsite_repair",
      });

      if (!published.ok) {
        throw Object.assign(new Error("publish_failed"), {
          code: "REPAIR_PUBLISH_FAILED",
          reason: published.reason,
        });
      }

      const pubAfter = await inspectPublicationGaps(client, churchId);
      const after = {
        organizationId,
        organizationKey: keyNorm.key,
        churchId,
        websiteStatus: pubAfter.websiteStatus,
        publicationGaps: pubAfter.gaps,
        publicPath: published.publicPath,
        alreadyPublished: Boolean(published.alreadyPublished),
        pagesCreated: (foundation && foundation.pagesCreated) || [],
      };

      return {
        ok: true,
        status: STATUS.OK,
        dryRun: false,
        applied: true,
        before,
        after,
        foundation,
        published,
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: (err && err.reason) || (err && err.code) || "repair_failed",
      dryRun: false,
      applied: false,
    };
  }
}

module.exports = {
  STATUS,
  inspectPublicMiniwebsiteRepair,
  repairPublicMiniwebsite,
  inspectPublicationGaps,
  resolveRepairTarget,
};

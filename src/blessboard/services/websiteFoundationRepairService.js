"use strict";

/**
 * Idempotent website foundation repair for provisioned BlessBoard churches.
 * Inserts missing settings / public pages / service-times section / onboarding only.
 * Never overwrites customized content, publication state, or ownership.
 */

const publicContentRepo = require("../repositories/publicContentRepository");
const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const { PUBLIC_PAGE_KEYS, PAGE_KEY_TITLES } = require("./publicContentConstants");
const { ensureCanonicalServiceTimesSection } = require("./homeServiceTimesService");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
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
 * @param {string} churchId
 */
async function ensureMinimalDraftPages(client, churchId) {
  const createdPages = [];
  for (const pageKey of PUBLIC_PAGE_KEYS) {
    const result = await publicContentRepo.ensureDraftPage(client, {
      churchId,
      branchId: null,
      pageKey,
      title: PAGE_KEY_TITLES[pageKey] || pageKey,
    });
    if (result && result.created) createdPages.push(pageKey);
  }
  const serviceTimes = await ensureCanonicalServiceTimesSection(client, {
    churchId,
    branchId: null,
  });
  return {
    createdPages,
    serviceTimesCreated: Boolean(serviceTimes && serviceTimes.created),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   churchId: string,
 *   publicName?: string | null,
 *   actorUserId?: string | null,
 *   auditReason?: string | null,
 * }} input
 */
async function repairWebsiteFoundation(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "church_id_required" };
  }
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "database_required" };
  }

  try {
    return await withClient(db, async (client) => {
      const church = await client.query(
        `SELECT c.id, c.organization_id, c.display_name, c.status
           FROM blessboard.churches c
          WHERE c.id = $1
          LIMIT 1`,
        [churchId]
      );
      if (!church.rows[0]) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "church_not_found" };
      }
      const row = church.rows[0];
      const organizationId = String(row.organization_id);
      const publicName =
        String((input && input.publicName) || "").trim() ||
        String(row.display_name || "").trim() ||
        "Church";

      const settingsBefore = await settingsRepo.findChurchSettings(client, churchId);
      await settingsRepo.ensureChurchSettingsRow(client, {
        churchId,
        publicName,
      });
      const settingsCreated = !settingsBefore;

      const pages = await ensureMinimalDraftPages(client, churchId);

      let onboardingCreated = false;
      if (organizationId) {
        const onboarding = await client.query(
          `INSERT INTO blessboard.organization_onboarding (
             organization_id, registration_application_id, onboarding_status, follow_up_status,
             preview_acknowledged, onboarding_dismissed, support_requested
           ) VALUES ($1, NULL, 'not_started', 'new', false, false, false)
           ON CONFLICT (organization_id) DO NOTHING
           RETURNING organization_id`,
          [organizationId]
        );
        onboardingCreated = Boolean(onboarding.rows[0]);
      }

      const actorUserId =
        input && input.actorUserId != null ? String(input.actorUserId).trim() : null;
      if (actorUserId) {
        await recordBlessBoardAudit(client, {
          churchId,
          actorUserId,
          actionKey: "website.foundation_repaired",
          entityType: "church",
          entityId: churchId,
          metadata: {
            reason: (input && input.auditReason) || "repair_website_foundation",
            settings_created: settingsCreated,
            pages_created: pages.createdPages,
            service_times_created: pages.serviceTimesCreated,
            onboarding_created: onboardingCreated,
          },
        });
      }

      return {
        ok: true,
        status: STATUS.OK,
        churchId,
        organizationId,
        settingsCreated,
        pagesCreated: pages.createdPages,
        serviceTimesCreated: pages.serviceTimesCreated,
        onboardingCreated,
        published: false,
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "transaction_error" };
  }
}

/**
 * Detect whether repair would insert anything (read-only).
 * @param {{ query: Function }} db
 * @param {{ churchId: string }} input
 */
async function inspectWebsiteFoundationGaps(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId || !db || typeof db.query !== "function") {
    return { ok: false, needsRepair: false, gaps: [] };
  }
  const gaps = [];
  try {
    const settings = await settingsRepo.findChurchSettings(db, churchId);
    if (!settings) gaps.push("church_settings");

    for (const pageKey of PUBLIC_PAGE_KEYS) {
      const page = await publicContentRepo.findPageByScope(db, {
        churchId,
        branchId: null,
        pageKey,
      });
      if (!page) gaps.push(`page:${pageKey}`);
    }

    const home = await publicContentRepo.findPageByScope(db, {
      churchId,
      branchId: null,
      pageKey: "home",
    });
    if (home && home.id) {
      const section = await publicContentRepo.findSectionByPageAndKey(
        db,
        home.id,
        "service_times"
      );
      if (!section) gaps.push("section:service_times");
    } else {
      gaps.push("section:service_times");
    }

    return { ok: true, needsRepair: gaps.length > 0, gaps };
  } catch {
    return { ok: false, needsRepair: false, gaps: [] };
  }
}

module.exports = {
  STATUS,
  repairWebsiteFoundation,
  inspectWebsiteFoundationGaps,
  ensureMinimalDraftPages,
};

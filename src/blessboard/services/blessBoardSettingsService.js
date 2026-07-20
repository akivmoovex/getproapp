"use strict";

/**
 * BlessBoard V5 church/branch settings services.
 * Idempotent initialize. Updates are transactional and sync catalogue names.
 */

const repo = require("../repositories/blessBoardSettingsRepository");
const appRepo = require("../repositories/platformChurchRegistrationRepository");
const {
  validateChurchSettingsInput,
  validateBranchSettingsInput,
  friendlySettingsError,
} = require("./settingsValidation");
const {
  prepareBranchDisplayName,
  isUniqueBranchDisplayNameViolation,
  DUPLICATE_BRANCH_DISPLAY_NAME_MESSAGE,
} = require("./normalizeBranchDisplayName");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
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

async function openTxClient(db) {
  if (db && typeof db.query === "function" && typeof db.release === "function") {
    return { client: db, owned: false, manageTx: false };
  }
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    return { client, owned: true, manageTx: true };
  }
  return { client: db, owned: false, manageTx: true };
}

async function touchOnboardingActivity(client, organizationId) {
  if (!organizationId || !UUID_RE.test(String(organizationId))) return;
  try {
    await appRepo.ensureOrganizationOnboardingRow(client, { organizationId });
    await appRepo.updateOrganizationOnboarding(client, organizationId, {
      onboardingStatus: "in_progress",
      onboardingStartedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });
  } catch {
    /* ignore */
  }
}

async function ensureChurchSettingsInitialized(db, churchId) {
  const id = String(churchId || "").trim();
  if (!id) return { ok: false, status: STATUS.INVALID_INPUT, settings: null };
  try {
    return await withClient(db, async (client) => {
      const displayName = await repo.findChurchDisplayName(client, id);
      if (!displayName) {
        return { ok: false, status: STATUS.NOT_FOUND, settings: null };
      }
      const settings = await repo.ensureChurchSettingsRow(client, {
        churchId: id,
        publicName: displayName,
      });
      if (!settings) {
        return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
      }
      return { ok: true, status: STATUS.OK, settings };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
  }
}

async function ensureBranchSettingsInitialized(db, branchId) {
  const id = String(branchId || "").trim();
  if (!id) return { ok: false, status: STATUS.INVALID_INPUT, settings: null };
  try {
    return await withClient(db, async (client) => {
      const displayName = await repo.findBranchDisplayName(client, id);
      if (!displayName) {
        return { ok: false, status: STATUS.NOT_FOUND, settings: null };
      }
      const settings = await repo.ensureBranchSettingsRow(client, {
        branchId: id,
        publicName: displayName,
      });
      if (!settings) {
        return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
      }
      return { ok: true, status: STATUS.OK, settings };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
  }
}

async function getChurchSettings(db, churchId) {
  return ensureChurchSettingsInitialized(db, churchId);
}

async function getBranchSettings(db, branchId) {
  return ensureBranchSettingsInitialized(db, branchId);
}

async function getChurchSettingsPageModel(db, churchId) {
  const id = String(churchId || "").trim();
  if (!UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, model: null, reason: "church_id" };
  }
  try {
    return await withClient(db, async (client) => {
      const settingsResult = await ensureChurchSettingsInitialized(client, id);
      if (!settingsResult.ok) {
        return { ok: false, status: settingsResult.status, model: null };
      }
      const catalogue = await repo.findChurchCatalogueSnapshot(client, id);
      if (!catalogue) {
        return { ok: false, status: STATUS.NOT_FOUND, model: null };
      }
      let primaryBranch = null;
      if (catalogue.primaryBranchId) {
        const branchSettings = await ensureBranchSettingsInitialized(
          client,
          catalogue.primaryBranchId
        );
        primaryBranch = {
          id: catalogue.primaryBranchId,
          branchKey: catalogue.primaryBranchKey,
          displayName: catalogue.primaryBranchDisplayName,
          status: catalogue.primaryBranchStatus,
          settings: branchSettings.ok ? branchSettings.settings : null,
        };
      }
      return {
        ok: true,
        status: STATUS.OK,
        model: {
          settings: settingsResult.settings,
          catalogue: {
            organizationId: catalogue.organizationId,
            organizationKey: catalogue.organizationKey,
            organizationDisplayName: catalogue.organizationDisplayName,
            organizationLegalName: catalogue.organizationLegalName,
            organizationStatus: catalogue.organizationStatus,
            churchId: catalogue.churchId,
            churchKey: catalogue.churchKey,
            churchDisplayName: catalogue.churchDisplayName,
            churchLegalName: catalogue.churchLegalName,
            churchStatus: catalogue.churchStatus,
            canonicalTimezone:
              settingsResult.settings.defaultTimezone ||
              catalogue.primaryBranchTimezone ||
              null,
          },
          primaryBranch,
        },
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, model: null };
  }
}

async function getBranchSettingsPageModel(db, branchId) {
  const id = String(branchId || "").trim();
  if (!UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, model: null, reason: "branch_id" };
  }
  try {
    return await withClient(db, async (client) => {
      const settingsResult = await ensureBranchSettingsInitialized(client, id);
      if (!settingsResult.ok) {
        return { ok: false, status: settingsResult.status, model: null };
      }
      const meta = await repo.findBranchCatalogueSnapshot(client, id);
      if (!meta) {
        return { ok: false, status: STATUS.NOT_FOUND, model: null };
      }
      const churchSettings = await repo.findChurchSettings(client, meta.churchId);
      return {
        ok: true,
        status: STATUS.OK,
        model: {
          settings: settingsResult.settings,
          catalogue: {
            branchId: meta.branchId,
            branchKey: meta.branchKey,
            branchDisplayName: meta.displayName,
            branchStatus: meta.status,
            branchType: meta.branchType,
            churchId: meta.churchId,
            churchDisplayName: meta.churchDisplayName,
            websiteStatus: churchSettings ? churchSettings.websiteStatus : "draft",
            canonicalTimezone:
              (churchSettings && churchSettings.defaultTimezone) ||
              settingsResult.settings.timezone ||
              meta.timezone ||
              null,
          },
        },
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, model: null };
  }
}

async function updateChurchSettings(db, churchId, input) {
  const id = String(churchId || "").trim();
  if (!UUID_RE.test(id)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      settings: null,
      reason: "church_id",
      message: friendlySettingsError("church_id"),
    };
  }

  const validated = validateChurchSettingsInput(input);
  if (!validated.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      settings: null,
      reason: validated.reason,
      message: friendlySettingsError(validated.reason),
    };
  }

  const session = await openTxClient(db);
  const { client, owned, manageTx } = session;
  try {
    if (manageTx) await client.query("BEGIN");

    const snapshot = await repo.findChurchCatalogueSnapshot(client, id);
    if (!snapshot) {
      if (manageTx) await client.query("ROLLBACK");
      return { ok: false, status: STATUS.NOT_FOUND, settings: null };
    }

    const settings = await repo.upsertChurchSettings(client, id, validated.value);
    if (!settings) {
      if (manageTx) await client.query("ROLLBACK");
      return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
    }

    const namePatch = { displayName: validated.value.publicName };
    if (input && Object.prototype.hasOwnProperty.call(input, "legalName")) {
      namePatch.legalName = validated.value.legalName;
    }
    await repo.updateChurchCatalogueNames(client, id, namePatch);
    await repo.updateOrganizationCatalogueNames(client, snapshot.organizationId, namePatch);

    if (snapshot.primaryBranchId) {
      await repo.updateBranchCatalogueMeta(client, snapshot.primaryBranchId, {
        timezone: validated.value.defaultTimezone,
        countryCode: validated.value.defaultCountryCode,
      });
    }

    await touchOnboardingActivity(client, snapshot.organizationId);

    const fieldKeys = ["profile"];
    if (validated.value.websiteStatus !== snapshot.websiteStatus) {
      fieldKeys.push("website_status");
    }
    if (validated.value.primaryEmail || validated.value.primaryPhone) {
      fieldKeys.push("contact");
    }
    if (validated.value.defaultTimezone) fieldKeys.push("timezone");

    await recordBlessBoardAudit(client, {
      churchId: id,
      organizationId: snapshot.organizationId,
      actorUserId: input && input.actorUserId,
      actionKey: "settings.church.update",
      entityType: "church_settings",
      entityId: id,
      outcome: "success",
      metadata: {
        status: "updated",
        field_keys: fieldKeys,
        from_status: snapshot.websiteStatus || undefined,
        to_status: validated.value.websiteStatus,
      },
    });

    if (manageTx) await client.query("COMMIT");
    return { ok: true, status: STATUS.OK, settings };
  } catch (err) {
    try {
      if (manageTx) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const code = err && err.code ? String(err.code) : "";
    if (code === "23514") {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        settings: null,
        reason: "constraint",
        message: friendlySettingsError("constraint"),
      };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

async function updateBranchSettings(db, branchId, input) {
  const id = String(branchId || "").trim();
  if (!UUID_RE.test(id)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      settings: null,
      reason: "branch_id",
      message: friendlySettingsError("branch_id"),
    };
  }

  const validated = validateBranchSettingsInput(input);
  if (!validated.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      settings: null,
      reason: validated.reason,
      message: friendlySettingsError(validated.reason),
    };
  }

  const preparedName = prepareBranchDisplayName(validated.value.publicName, {
    field: "public_name",
    emptyMessage: "Enter a branch display name.",
  });
  if (!preparedName.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      settings: null,
      reason: "public_name",
      message: preparedName.error,
    };
  }
  validated.value.publicName = preparedName.display;

  const session = await openTxClient(db);
  const { client, owned, manageTx } = session;
  try {
    if (manageTx) await client.query("BEGIN");

    const meta = await repo.findBranchCatalogueSnapshot(client, id);
    if (!meta || String(meta.status) !== "active") {
      if (manageTx) await client.query("ROLLBACK");
      return { ok: false, status: STATUS.NOT_FOUND, settings: null };
    }

    if (
      input &&
      input.expectedChurchId &&
      UUID_RE.test(String(input.expectedChurchId)) &&
      String(input.expectedChurchId) !== String(meta.churchId)
    ) {
      if (manageTx) await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.NOT_FOUND,
        settings: null,
        reason: "church_mismatch",
        message: "This branch could not be found for your church.",
      };
    }

    await repo.updateBranchCatalogueDisplayName(client, id, preparedName.display);
    const settings = await repo.upsertBranchSettings(client, id, validated.value);
    if (!settings) {
      if (manageTx) await client.query("ROLLBACK");
      return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
    }

    await repo.updateBranchCatalogueMeta(client, id, {
      timezone: validated.value.timezone,
      countryCode: validated.value.countryCode,
    });

    await touchOnboardingActivity(client, meta.organizationId);

    await recordBlessBoardAudit(client, {
      churchId: meta.churchId,
      organizationId: meta.organizationId,
      branchId: id,
      actorUserId: input && input.actorUserId,
      actionKey: "settings.branch.update",
      entityType: "branch_settings",
      entityId: id,
      outcome: "success",
      metadata: {
        status: "updated",
        field_keys: ["profile", "contact", "address"],
        branch_key: meta.branchKey || undefined,
      },
    });

    if (manageTx) await client.query("COMMIT");
    return { ok: true, status: STATUS.OK, settings };
  } catch (err) {
    try {
      if (manageTx) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (isUniqueBranchDisplayNameViolation(err)) {
      return {
        ok: false,
        status: STATUS.CONFLICT,
        settings: null,
        reason: "duplicate_display_name",
        message: DUPLICATE_BRANCH_DISPLAY_NAME_MESSAGE,
      };
    }
    const code = err && err.code ? String(err.code) : "";
    if (code === "23514") {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        settings: null,
        reason: "constraint",
        message: friendlySettingsError("constraint"),
      };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  STATUS,
  ensureChurchSettingsInitialized,
  ensureBranchSettingsInitialized,
  getChurchSettings,
  getBranchSettings,
  getChurchSettingsPageModel,
  getBranchSettingsPageModel,
  updateChurchSettings,
  updateBranchSettings,
};

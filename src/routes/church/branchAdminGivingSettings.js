"use strict";

const { getPgPool } = require("../../db/pg");
const givingSettingsRepo = require("../../db/pg/church/givingSettingsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  settingsFromForm,
  formFromSettings,
  validateForPublish,
  validateGivingSettingsFields,
  describeGivingSettingsReadiness,
} = require("../../services/church/givingSettingsService");
const {
  branchAdminLocals,
  flashFromQuery,
  GIVING_SETTINGS_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

const ALLOWED_INTENTS = new Set(["draft", "publish"]);

async function loadEditorState(pool, branchId) {
  const row = await givingSettingsRepo.getGivingSettingsForBranch(pool, branchId);
  const form = formFromSettings(row);
  return {
    form,
    status: row ? row.status : "draft",
    settingsId: row ? row.id : null,
    readiness: describeGivingSettingsReadiness(row, form),
    listError: null,
  };
}

function renderSettings(req, res, statusCode, extras) {
  return res.status(statusCode).render(
    "church/branch-admin/giving_settings",
    branchAdminLocals(req, {
      summaryHref: "/branch/giving-summary",
      canEditSettings: true,
      ...extras,
    })
  );
}

module.exports = function registerBranchAdminGivingSettingsRoutes(router) {
  router.get(
    "/branch/giving-settings",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        let editor;
        let listError = null;
        try {
          editor = await loadEditorState(pool, req.churchContext.branch.id);
        } catch {
          editor = {
            form: formFromSettings(null),
            status: "draft",
            settingsId: null,
            readiness: describeGivingSettingsReadiness(null, formFromSettings(null)),
          };
          listError = "Giving settings could not be loaded. Please try again.";
        }
        return renderSettings(req, res, 200, {
          ...editor,
          listError,
          error: null,
          notice: noticeMessage(flashFromQuery(req, GIVING_SETTINGS_NOTICES)),
        });
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/giving-settings",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const intentRaw = String(req.body._intent || "draft").trim();
        const intent = ALLOWED_INTENTS.has(intentRaw) ? intentRaw : "draft";
        const settings = settingsFromForm(req.body || {});
        const form = formFromSettings({
          ...settings,
          giving_categories_json: settings.giving_categories_json,
        });

        const fieldCheck = validateGivingSettingsFields(settings, req.body || {});
        if (!fieldCheck.ok) {
          const editor = await loadEditorState(pool, branch.id);
          return renderSettings(req, res, 400, {
            ...editor,
            form,
            readiness: describeGivingSettingsReadiness({ status: editor.status }, form),
            error: fieldCheck.error,
            notice: null,
          });
        }

        if (intent === "publish") {
          const validation = validateForPublish(settings);
          if (!validation.ok) {
            const editor = await loadEditorState(pool, branch.id);
            return renderSettings(req, res, 400, {
              ...editor,
              form,
              readiness: describeGivingSettingsReadiness({ status: editor.status }, form),
              error: validation.error,
              notice: null,
            });
          }
        }

        const saved = await givingSettingsRepo.upsertGivingSettingsForBranch(pool, branch.id, {
          organization_id: org.id,
          ...settings,
          updated_by_admin_id: adminId,
        });

        await recordBranchAudit(pool, req, {
          action: "giving_settings_draft_saved",
          entityType: "giving_settings",
          entityId: saved.id,
          metadata: { status: "draft", branch_name: branch.name },
        });

        if (intent === "publish") {
          const published = await givingSettingsRepo.publishGivingSettingsForBranch(
            pool,
            branch.id,
            adminId
          );
          if (!published) {
            const editor = await loadEditorState(pool, branch.id);
            return renderSettings(req, res, 400, {
              ...editor,
              error: "Giving settings could not be published.",
              notice: null,
            });
          }
          await recordBranchAudit(pool, req, {
            action: "giving_settings_published",
            entityType: "giving_settings",
            entityId: published.id,
            metadata: { status: "published", branch_name: branch.name },
          });
          return res.redirect(303, "/branch/giving-settings?notice=giving_settings_published");
        }

        return res.redirect(303, "/branch/giving-settings?notice=giving_settings_draft_saved");
      } catch (e) {
        return next(e);
      }
    }
  );
};

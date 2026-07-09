"use strict";

const { getPgPool } = require("../../db/pg");
const givingSettingsRepo = require("../../db/pg/church/givingSettingsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  settingsFromForm,
  formFromSettings,
  validateForPublish,
} = require("../../services/church/givingSettingsService");
const {
  branchAdminLocals,
  flashFromQuery,
  GIVING_SETTINGS_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

async function loadEditorState(pool, branchId) {
  const row = await givingSettingsRepo.getGivingSettingsForBranch(pool, branchId);
  return {
    form: formFromSettings(row),
    status: row ? row.status : "draft",
    settingsId: row ? row.id : null,
  };
}

module.exports = function registerBranchAdminGivingSettingsRoutes(router) {
  router.get(
    "/branch/giving-settings",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const editor = await loadEditorState(pool, req.churchContext.branch.id);
        return res.render(
          "church/branch-admin/giving_settings",
          branchAdminLocals(req, {
            ...editor,
            error: null,
            notice: noticeMessage(flashFromQuery(req, GIVING_SETTINGS_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/giving-settings",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const intent = String(req.body._intent || "draft").trim();
        const settings = settingsFromForm(req.body || {});

        if (intent === "publish") {
          const validation = validateForPublish(settings);
          if (!validation.ok) {
            const editor = await loadEditorState(pool, branch.id);
            return res.status(400).render(
              "church/branch-admin/giving_settings",
              branchAdminLocals(req, {
                ...editor,
                form: formFromSettings({ ...settings, giving_categories_json: settings.giving_categories_json }),
                error: validation.error,
                notice: null,
              })
            );
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
            return res.status(400).render(
              "church/branch-admin/giving_settings",
              branchAdminLocals(req, {
                ...editor,
                error: "Giving settings could not be published.",
                notice: null,
              })
            );
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

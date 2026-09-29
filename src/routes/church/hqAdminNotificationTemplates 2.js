"use strict";

const { getPgPool } = require("../../db/pg");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const notificationTemplateService = require("../../services/church/notificationTemplateService");
const { TEMPLATE_KEYS } = require("../../church/notificationTemplateCatalogue");
const { hqAdminLocals } = require("./hqAdminShared");

function isKnownKey(key) {
  return TEMPLATE_KEYS.includes(String(key || "").trim());
}

module.exports = function registerHqAdminNotificationTemplatesRoutes(router) {
  router.get(
    "/hq/notification-templates",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const templates = await notificationTemplateService.listEffectiveTemplates(pool, org.id);
        return res.render(
          "church/hq/notification_templates",
          hqAdminLocals(req, {
            pageTitle: "Notification templates",
            activeNav: "notification-templates",
            templates,
            notice: String(req.query.notice || "").trim() || null,
            error: String(req.query.error || "").trim() || null,
          })
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  router.get(
    "/hq/notification-templates/:templateKey",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const key = String(req.params.templateKey || "").trim();
        if (!isKnownKey(key)) {
          return res.status(404).type("text").send("Template not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const template = await notificationTemplateService.getEffectiveTemplate(pool, key, org.id);
        return res.render(
          "church/hq/notification_template_detail",
          hqAdminLocals(req, {
            pageTitle: template.label,
            activeNav: "notification-templates",
            template,
            preview: null,
            form: {
              subject_template: template.subjectTemplate,
              body_text_template: template.bodyTextTemplate,
              body_html_template: template.bodyHtmlTemplate || "",
            },
            notice: String(req.query.notice || "").trim() || null,
            error: String(req.query.error || "").trim() || null,
          })
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/hq/notification-templates/:templateKey",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const key = String(req.params.templateKey || "").trim();
        if (!isKnownKey(key)) {
          return res.status(404).type("text").send("Template not found.");
        }
        const org = req.churchContext.organization;
        const admin = req.churchHqAdmin;
        const pool = getPgPool();
        await notificationTemplateService.upsertTemplate(pool, {
          templateKey: key,
          organizationId: org.id,
          subject_template: req.body.subject_template,
          body_text_template: req.body.body_text_template,
          body_html_template: req.body.body_html_template,
          actorType: "hq_admin",
          actorId: admin && admin.hq_admin_id,
        });
        return res.redirect(
          303,
          `/hq/notification-templates/${encodeURIComponent(key)}?notice=${encodeURIComponent("Override saved.")}`
        );
      } catch (err) {
        if (err && err.code === "VALIDATION") {
          return res.redirect(
            303,
            `/hq/notification-templates/${encodeURIComponent(req.params.templateKey)}?error=${encodeURIComponent(err.message)}`
          );
        }
        return next(err);
      }
    }
  );

  router.post(
    "/hq/notification-templates/:templateKey/preview",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const key = String(req.params.templateKey || "").trim();
        if (!isKnownKey(key)) {
          return res.status(404).type("text").send("Template not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        // Preview current form values without saving: temporarily validate then render.
        const validated = notificationTemplateService.validateAndSanitizeInput(key, req.body || {});
        if (!validated.ok) {
          return res.redirect(
            303,
            `/hq/notification-templates/${encodeURIComponent(key)}?error=${encodeURIComponent(validated.error)}`
          );
        }
        const effective = await notificationTemplateService.getEffectiveTemplate(pool, key, org.id);
        const preview = notificationTemplateService.renderTemplateContent(
          {
            ...effective,
            subjectTemplate: validated.subject_template,
            bodyTextTemplate: validated.body_text_template,
            bodyHtmlTemplate: validated.body_html_template,
          },
          notificationTemplateService.sampleVariablesForTemplate(key)
        );
        return res.render(
          "church/hq/notification_template_detail",
          hqAdminLocals(req, {
            pageTitle: effective.label,
            activeNav: "notification-templates",
            template: effective,
            preview,
            form: {
              subject_template: validated.subject_template,
              body_text_template: validated.body_text_template,
              body_html_template: validated.body_html_template || "",
            },
            notice: "Preview generated (not saved).",
            error: null,
          })
        );
      } catch (err) {
        if (err && err.code === "MISSING_VARIABLES") {
          return res.redirect(
            303,
            `/hq/notification-templates/${encodeURIComponent(req.params.templateKey)}?error=${encodeURIComponent(err.message)}`
          );
        }
        return next(err);
      }
    }
  );

  router.post(
    "/hq/notification-templates/:templateKey/restore",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const key = String(req.params.templateKey || "").trim();
        if (!isKnownKey(key)) {
          return res.status(404).type("text").send("Template not found.");
        }
        const org = req.churchContext.organization;
        const admin = req.churchHqAdmin;
        const pool = getPgPool();
        await notificationTemplateService.restoreDefaultTemplate(pool, {
          templateKey: key,
          organizationId: org.id,
          actorType: "hq_admin",
          actorId: admin && admin.hq_admin_id,
        });
        return res.redirect(
          303,
          `/hq/notification-templates/${encodeURIComponent(key)}?notice=${encodeURIComponent("Default restored.")}`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/hq/notification-templates/:templateKey/test-send",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const key = String(req.params.templateKey || "").trim();
        if (!isKnownKey(key)) {
          return res.status(404).type("text").send("Template not found.");
        }
        const org = req.churchContext.organization;
        const admin = req.churchHqAdmin;
        const pool = getPgPool();
        const hqAdminsRepo = require("../../db/pg/church/hqAdminsRepo");
        const row = await hqAdminsRepo.findHqAdminById(pool, admin.hq_admin_id);
        const email = String((row && row.email) || "").trim().toLowerCase();
        if (!email) {
          return res.redirect(
            303,
            `/hq/notification-templates/${encodeURIComponent(key)}?error=${encodeURIComponent("Your HQ account has no email for test delivery.")}`
          );
        }
        await notificationTemplateService.testSendTemplate(pool, {
          templateKey: key,
          organizationId: org.id,
          recipientEmail: email,
          authorisedRecipient: true,
          recipientActorType: "hq_admin",
          recipientActorId: admin.hq_admin_id,
          actorType: "hq_admin",
          actorId: admin.hq_admin_id,
        });
        return res.redirect(
          303,
          `/hq/notification-templates/${encodeURIComponent(key)}?notice=${encodeURIComponent("Test delivery recorded for your administrator email (no external provider).")}`
        );
      } catch (err) {
        if (err && (err.code === "VALIDATION" || err.code === "FORBIDDEN" || err.code === "MISSING_VARIABLES")) {
          return res.redirect(
            303,
            `/hq/notification-templates/${encodeURIComponent(req.params.templateKey)}?error=${encodeURIComponent(err.message)}`
          );
        }
        return next(err);
      }
    }
  );
};

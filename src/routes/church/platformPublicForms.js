"use strict";

const { BLESSBOARD_REGISTER_CHURCH_PATH } = require("../../church/platformPublicContent");
const {
  validatePlatformContactInquiry,
  validatePlatformRegisterChurchInquiry,
  contactFormFromBody,
  registerChurchFormFromBody,
} = require("../../church/platformInquiryValidation");
const { submitPlatformInquiry } = require("../../services/church/platformInquiryService");
const { platformPublicFormLimiter } = require("../../middleware/platformPublicFormRateLimit");
const { apexPageLocals } = require("./platformPublicPages");

function requireVerticalApex(req, res, next) {
  const ctx = req.churchContext;
  if (!ctx || ctx.kind !== "vertical-apex") {
    return next("router");
  }
  return next();
}

function contactPageLocals(req, extra = {}) {
  return apexPageLocals(
    {
      pageTitle: "Contact BlessBoard",
      activePage: "contact",
      submitted: String(req.query.submitted || "") === "1",
      formError: null,
      form: {},
      ...extra,
    },
    req
  );
}

function registerChurchPageLocals(req, extra = {}) {
  return apexPageLocals(
    {
      pageTitle: "Register Your Church",
      activePage: "register-church",
      submitted: String(req.query.submitted || "") === "1",
      formError: null,
      form: {},
      ...extra,
    },
    req
  );
}

function registerPlatformPublicFormRoutes(router) {
  router.post(
    "/contact",
    requireVerticalApex,
    platformPublicFormLimiter,
    async (req, res, next) => {
      try {
        const validation = validatePlatformContactInquiry(req.body);
        if (!validation.ok) {
          return res.status(400).render(
            "church/public/platform_contact",
            contactPageLocals(req, {
              formError: validation.error,
              form: contactFormFromBody(req.body),
              fieldError: validation.field || null,
            })
          );
        }

        const result = await submitPlatformInquiry(req, validation);
        if (!result.ok) {
          return res.status(503).render(
            "church/public/platform_contact",
            contactPageLocals(req, {
              formError: result.error,
              form: contactFormFromBody(req.body),
            })
          );
        }

        return res.redirect(303, "/contact?submitted=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    BLESSBOARD_REGISTER_CHURCH_PATH,
    requireVerticalApex,
    platformPublicFormLimiter,
    async (req, res, next) => {
      try {
        const validation = validatePlatformRegisterChurchInquiry(req.body);
        if (!validation.ok) {
          return res.status(400).render(
            "church/public/platform_register_church",
            registerChurchPageLocals(req, {
              formError: validation.error,
              form: registerChurchFormFromBody(req.body),
              fieldError: validation.field || null,
            })
          );
        }

        const result = await submitPlatformInquiry(req, validation);
        if (!result.ok) {
          return res.status(503).render(
            "church/public/platform_register_church",
            registerChurchPageLocals(req, {
              formError: result.error,
              form: registerChurchFormFromBody(req.body),
            })
          );
        }

        return res.redirect(303, `${BLESSBOARD_REGISTER_CHURCH_PATH}?submitted=1`);
      } catch (e) {
        return next(e);
      }
    }
  );
}

module.exports = registerPlatformPublicFormRoutes;
module.exports.contactPageLocals = contactPageLocals;
module.exports.registerChurchPageLocals = registerChurchPageLocals;

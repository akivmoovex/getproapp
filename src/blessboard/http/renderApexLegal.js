"use strict";

const { renderV5Ejs } = require("./v5EjsTemplateCache");
const { buildTermsOfServiceContent } = require("../content/termsOfServiceContent");
const { buildPrivacyPolicyContent } = require("../content/privacyPolicyContent");
const {
  buildRegistrationPageLocals,
  PRODUCT_CODE,
} = require("../../platform/registration/registrationRenderLocals");

function shellLocals(opts) {
  return {
    authenticated: Boolean(opts && opts.authenticated),
    csrfToken: (opts && opts.csrfToken) || "",
  };
}

function renderLegalPage(doc, opts) {
  return renderV5Ejs("apex/legal-page.ejs", {
    ...shellLocals(opts),
    ...buildRegistrationPageLocals(opts && opts.req, PRODUCT_CODE.BLESSBOARD, {
      step: opts && opts.registrationStep,
      plan: opts && opts.registrationPlan,
    }),
    pageTitle: doc.title,
    activeNav: opts && opts.activeNav ? opts.activeNav : "",
    legalDoc: doc,
  });
}

function renderTermsPage(opts) {
  return renderLegalPage(buildTermsOfServiceContent(), {
    ...opts,
    activeNav: "terms",
  });
}

function renderPrivacyPage(opts) {
  return renderLegalPage(buildPrivacyPolicyContent(), {
    ...opts,
    activeNav: "privacy",
  });
}

module.exports = {
  renderTermsPage,
  renderPrivacyPage,
};

"use strict";

const { renderV5Ejs } = require("./v5EjsTemplateCache");
const { buildTermsOfServiceContent } = require("../content/termsOfServiceContent");
const { buildPrivacyPolicyContent } = require("../content/privacyPolicyContent");

function shellLocals(opts) {
  return {
    authenticated: Boolean(opts && opts.authenticated),
    csrfToken: (opts && opts.csrfToken) || "",
  };
}

function renderLegalPage(doc, opts) {
  return renderV5Ejs("apex/legal-page.ejs", {
    ...shellLocals(opts),
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

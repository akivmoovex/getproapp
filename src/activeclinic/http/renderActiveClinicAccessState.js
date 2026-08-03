"use strict";

/**
 * ActiveClinic access / session state pages (AC-V6-S02).
 * Used when the full app shell is not appropriate (denied / expired).
 */

const {
  renderActiveClinicView,
} = require("./renderActiveClinicView");

function renderAccessStatePage(input) {
  const pageId = (input && input.pageId) || "access-denied";
  const locals = {
    pageId,
    pageTitle: (input && input.pageTitle) || "Access restricted",
    heading: (input && input.heading) || "Access Restricted",
    message:
      (input && input.message) ||
      "You do not have permission to view this page.",
    primaryHref: (input && input.primaryHref) || "/app",
    primaryLabel: (input && input.primaryLabel) || "Return to home",
    secondaryHref: (input && input.secondaryHref) || null,
    secondaryLabel: (input && input.secondaryLabel) || null,
    showLogout: input && input.showLogout === true,
    csrfField: (input && input.csrfField) || "_csrf",
    csrfToken: (input && input.csrfToken) || "",
  };
  return renderActiveClinicView("app/access-state.ejs", locals);
}

module.exports = {
  renderAccessStatePage,
};

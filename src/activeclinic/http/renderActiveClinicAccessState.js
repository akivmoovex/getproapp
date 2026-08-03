"use strict";

/**
 * ActiveClinic full-page state renderer (AC-V6-S08).
 * Used when the authenticated shell is not appropriate.
 */

const {
  renderActiveClinicView,
} = require("./renderActiveClinicView");
const {
  STATE,
  buildFullPageState,
} = require("../services/activeClinicStateTaxonomy");
const { SHELL_ASSET_VERSION } = require("../services/buildActiveClinicShellViewModel");

function renderAccessStatePage(input) {
  const stateKey =
    (input && input.stateKey) ||
    (input && input.pageId === "session-expired"
      ? STATE.SESSION_EXPIRED
      : input && input.pageId === "not-found"
        ? STATE.NOT_FOUND
        : input && input.pageId === "context-unavailable"
          ? STATE.CONTEXT_UNAVAILABLE
          : input && input.pageId === "service-unavailable"
            ? STATE.SERVICE_UNAVAILABLE
            : input && input.pageId === "error"
              ? STATE.REQUEST_ERROR
              : STATE.ACCESS_RESTRICTED);

  const built = buildFullPageState(stateKey, {
    pageTitle: input && input.pageTitle,
    heading: input && input.heading,
    message: input && input.message,
    primaryHref: input && input.primaryHref,
    primaryLabel: input && input.primaryLabel,
    secondaryHref: input && input.secondaryHref,
    secondaryLabel: input && input.secondaryLabel,
    showLogout: input && input.showLogout === true,
    httpStatus: input && input.httpStatus,
  });

  const pageId = (input && input.pageId) || built.pageId;
  const locals = {
    pageId,
    stateKey: built.stateKey,
    pageTitle: (input && input.pageTitle) || built.pageTitle,
    heading: (input && input.heading) || built.heading,
    message: (input && input.message) || built.message,
    primaryHref: (input && input.primaryHref) || built.primaryHref,
    primaryLabel: (input && input.primaryLabel) || built.primaryLabel,
    secondaryHref:
      input && Object.prototype.hasOwnProperty.call(input, "secondaryHref")
        ? input.secondaryHref
        : built.secondaryHref,
    secondaryLabel: (input && input.secondaryLabel) || built.secondaryLabel,
    showLogout: input && input.showLogout === true,
    csrfField: (input && input.csrfField) || "_csrf",
    csrfToken: (input && input.csrfToken) || "",
    supportReference: (input && input.supportReference) || null,
    assetVersion: (input && input.assetVersion) || SHELL_ASSET_VERSION || "s08-1",
  };
  return renderActiveClinicView("app/access-state.ejs", locals);
}

module.exports = {
  renderAccessStatePage,
  STATE,
};

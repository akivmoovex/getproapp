"use strict";

const constants = require("./constants");
const {
  evaluateOrganizationOnboarding,
  skipOnboardingStep,
  completeOrganizationOnboarding,
  resolvePostLoginPath,
  applyOnboardingRedirect,
} = require("./engine");
const { getOnboardingAdapter } = require("./adapters");
const repo = require("./repository");

module.exports = {
  ...constants,
  evaluateOrganizationOnboarding,
  skipOnboardingStep,
  completeOrganizationOnboarding,
  resolvePostLoginPath,
  applyOnboardingRedirect,
  getOnboardingAdapter,
  getProgress: repo.getProgress,
};

"use strict";

const contentTypes = require("./contentTypes");
const templateRegistry = require("./templateRegistry");
const permissions = require("./permissions");
const instanceRepository = require("./instanceRepository");
const contentService = require("./contentService");
const resolver = require("./resolver");
const mediaService = require("./mediaService");
const submissionService = require("./submissionService");
const versionService = require("./versionService");
const checklistService = require("./checklistService");
const templateUpgradeService = require("./templateUpgradeService");
const provisionService = require("./provisionService");
const auditService = require("./auditService");
const authorizeWebsite = require("./authorizeWebsite");

module.exports = {
  ...contentTypes,
  ...templateRegistry,
  ...permissions,
  instanceRepository,
  contentService,
  resolver,
  mediaService,
  submissionService,
  versionService,
  checklistService,
  templateUpgradeService,
  provisionService,
  auditService,
  authorizeWebsite,
};

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
const reviewDiff = require("./reviewDiff");
const lifecycleStatus = require("./lifecycleStatus");
const publishPolicy = require("./publishPolicy");
const productWebsiteDefaults = require("./productWebsiteDefaults");
const moderationEventService = require("./moderationEventService");
const lifecycleService = require("./lifecycleService");
const publicationService = require("./publicationService");
const recentChangesService = require("./recentChangesService");
const editSessionService = require("./editSessionService");

module.exports = {
  ...contentTypes,
  ...templateRegistry,
  ...permissions,
  ...lifecycleStatus,
  ...publishPolicy,
  ...productWebsiteDefaults,
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
  reviewDiff,
  moderationEventService,
  lifecycleService,
  publicationService,
  recentChangesService,
  editSessionService,
};

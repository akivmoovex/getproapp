"use strict";

const PUBLISH_POLICY = Object.freeze({
  AUTO_PUBLISH_WITH_MODERATION: "AUTO_PUBLISH_WITH_MODERATION",
  REVIEW_BEFORE_PUBLISH: "REVIEW_BEFORE_PUBLISH",
  PLATFORM_LOCKED: "PLATFORM_LOCKED",
});

const ALL_PUBLISH_POLICIES = Object.freeze(Object.values(PUBLISH_POLICY));

const POLICY_LABELS = Object.freeze({
  [PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION]: "Auto-publish with moderation",
  [PUBLISH_POLICY.REVIEW_BEFORE_PUBLISH]: "Review before publish",
  [PUBLISH_POLICY.PLATFORM_LOCKED]: "Publishing restricted",
});

function isPublishPolicy(value) {
  return ALL_PUBLISH_POLICIES.includes(String(value || ""));
}

function tenantMayPublish(policy, publishLocked) {
  if (publishLocked === true) return false;
  return String(policy || "") !== PUBLISH_POLICY.PLATFORM_LOCKED;
}

function autoPublishes(policy, publishLocked) {
  return (
    tenantMayPublish(policy, publishLocked) &&
    String(policy || "") === PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION
  );
}

module.exports = {
  PUBLISH_POLICY,
  ALL_PUBLISH_POLICIES,
  POLICY_LABELS,
  isPublishPolicy,
  tenantMayPublish,
  autoPublishes,
};

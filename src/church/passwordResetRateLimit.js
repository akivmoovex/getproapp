"use strict";

const PASSWORD_RESET_REQUEST_TYPES = ["member", "branch_admin", "hq_admin", "ministry_leader"];

const PASSWORD_RESET_RATE_LIMIT = {
  maxPerIdentifierPerHour: 3,
  maxPerIpPerHour: 10,
  blockMinutes: 30,
  windowMinutes: 60,
};

const GENERIC_LIMITED_MESSAGE =
  "If your details match an account, the request will be reviewed. Please wait before submitting again.";

const IP_BUCKET_PREFIX = "__ip__:";

module.exports = {
  PASSWORD_RESET_REQUEST_TYPES,
  PASSWORD_RESET_RATE_LIMIT,
  GENERIC_LIMITED_MESSAGE,
  IP_BUCKET_PREFIX,
};

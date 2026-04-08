"use strict";

const { normalizeGenericDigits } = require("../phone/phoneRulesService");

/** @deprecated Prefer `phoneRulesService.normalizePhoneForTenant` for canonical storage. */
function normalizePhoneDigits(raw) {
  return normalizeGenericDigits(raw);
}

module.exports = { normalizePhoneDigits };

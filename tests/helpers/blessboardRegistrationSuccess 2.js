"use strict";

const assert = require("node:assert/strict");

function assertChurchReadySuccessRedirect(location) {
  const loc = String(location || "");
  assert.match(loc, /^\/register-church\/success\?/, loc);
  assert.match(loc, /(?:^|[?&])ready=1(?:&|$)/, loc);
  assert.match(loc, /(?:^|[?&])ref=BB-[A-Za-z0-9-]+/, loc);
  assert.doesNotMatch(loc, /review=1/, loc);
  assert.doesNotMatch(loc, /^\/hq(?:\?|$)/, loc);
  assert.doesNotMatch(loc, /^\/register-church\?/, loc);
}

module.exports = {
  assertChurchReadySuccessRedirect,
};

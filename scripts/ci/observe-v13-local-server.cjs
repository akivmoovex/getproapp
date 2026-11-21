"use strict";

/**
 * Start the existing application server only after the V13 browser guard
 * accepts a local disposable database. This file does not create a database,
 * migrate, or seed. Unauthorized runs exit before the server module loads.
 */

const { assertV13BrowserHarness } = require("../../tests/v13/helpers/v13BrowserIsolation");

let harness;
try {
  harness = assertV13BrowserHarness(process.env, {
    fallbackPort: process.env.PLAYWRIGHT_E2E_PORT || "4187",
  });
} catch (error) {
  process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
  process.exit(1);
}

if (String(process.env.HOST || "") !== "127.0.0.1" || String(process.env.PORT || "") !== harness.port) {
  process.stderr.write(
    "V13_BROWSER_GUARD: the local server must bind 127.0.0.1 on the approved browser port\n"
  );
  process.exit(1);
}

require("./observe-blessboard-server.cjs");

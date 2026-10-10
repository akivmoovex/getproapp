const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const JSON_PATH = path.join(ROOT, "docs/qa/V208_ADMIN_ROUTE_ACTION_INVENTORY.json");

test("V8 Admin route inventory captures active mounts and known route families", () => {
  const result = spawnSync(process.execPath, ["scripts/local/v208-admin-route-inventory.js"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, V208_ADMIN_INVENTORY_OUT: path.join(ROOT, "docs/qa") },
  });
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  assert.ok(inventory.counts.capturedRoutes > 0);
  assert.ok(inventory.counts.mountedRouteActions > 0);
  assert.equal(inventory.knownRouteValidation.pass, true);
  assert.equal(inventory.knownRouteValidation.missing.length, 0);
});

test("V8 Admin inventory keeps GET and mutation actions distinct", () => {
  const inventory = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const routes = inventory.mountedRouteActions;
  assert.ok(routes.some((route) => route.method === "GET" && route.path === "/admin/organizations"));
  assert.ok(routes.some((route) => route.method === "POST" && route.path.includes("/website/publish")));
  assert.ok(new Set(routes.map((route) => route.routeId)).size === routes.length);
});

test("legacy-only Admin routes are recorded as excluded from V8 scope", () => {
  const inventory = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  assert.deepEqual(
    inventory.excludedLegacyRuntimeRoutes.map((route) => route.path),
    ["/admin/dashboard", "/admin/crm", "/admin/projects", "/admin/finance/cfo", "/admin/db"]
  );
});

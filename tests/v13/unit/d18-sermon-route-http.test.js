"use strict";

/**
 * D18 database-independent execution of the real branch sermon router.
 * Matching authenticated sessions call getPgPool and are not requested.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const express = require("express");

const registerBranchAdminSermonsRoutes = require("../../../src/routes/church/branchAdminSermons");

function app() {
  const server = express();
  server.use((req, _res, next) => {
    if (req.headers["x-church"] === "1") {
      req.churchContext = {
        kind: "branch",
        organization: { id: 1, name: "Chapel" },
        branch: { id: Number(req.headers["x-branch"] || 1), name: "Main" },
      };
    }
    const sessionBranch = req.headers["x-session-branch"];
    req.session = sessionBranch
      ? {
          churchBranchAdmin: {
            admin_id: 9,
            organization_id: 1,
            branch_id: Number(sessionBranch),
            full_name: "Ada",
            role: "branch_administrator",
            status: "active",
            security_version: 1,
          },
        }
      : {};
    next();
  });
  const router = express.Router();
  registerBranchAdminSermonsRoutes(router);
  server.use(router);
  return server;
}

function request(server, path, headers, method) {
  return new Promise((resolve, reject) => {
    const listener = http.createServer(server);
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      const req = http.request(
        { hostname: "127.0.0.1", port, path, method: method || "GET", headers },
        (res) => {
          res.resume();
          res.on("end", () => {
            listener.close(() => resolve({ status: res.statusCode, location: res.headers.location || "" }));
          });
        }
      );
      req.on("error", (err) => listener.close(() => reject(err)));
      req.end();
    });
  });
}

describe("D18 branch sermon HTTP handler", () => {
  it("denies a sermon create route without a branch host, a session, or the matching branch", async () => {
    const routerApp = app();
    const missingHost = await request(routerApp, "/branch/sermons/new");
    assert.equal(missingHost.status, 404);

    const signedOut = await request(routerApp, "/branch/sermons/new", { "x-church": "1" });
    assert.equal(signedOut.status, 302);
    assert.equal(signedOut.location, "/branch/login");

    const otherBranch = await request(routerApp, "/branch/sermons/new", {
      "x-church": "1",
      "x-branch": "1",
      "x-session-branch": "2",
    });
    assert.equal(otherBranch.status, 302);
    assert.equal(otherBranch.location, "/branch/login");

    const post = await request(routerApp, "/branch/sermons", { "x-church": "1" }, "POST");
    assert.equal(post.status, 302);
    assert.equal(post.location, "/branch/login");
  });
});

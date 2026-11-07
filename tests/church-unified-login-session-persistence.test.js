"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const loginRunnerPath = require.resolve("../src/services/church/runTenantUnifiedLogin");
const loginServicePath = require.resolve("../src/services/church/tenantUnifiedLoginService");
const realLoginService = require(loginServicePath);

function loadLoginRunner(authResult, events) {
  const previousService = require.cache[loginServicePath];
  const previousRunner = require.cache[loginRunnerPath];
  require.cache[loginServicePath] = {
    id: loginServicePath,
    filename: loginServicePath,
    loaded: true,
    exports: {
      ...realLoginService,
      authenticateTenantUnifiedLogin: async () => {
        events.push("authenticate");
        return authResult;
      },
    },
  };
  delete require.cache[loginRunnerPath];
  const runner = require(loginRunnerPath);

  if (previousService) require.cache[loginServicePath] = previousService;
  else delete require.cache[loginServicePath];
  if (previousRunner) require.cache[loginRunnerPath] = previousRunner;
  else delete require.cache[loginRunnerPath];

  return runner;
}

function makeDeferredSessionRequest(events) {
  let completeSave;
  let savedSnapshot;
  let resolveSaveStarted;
  const saveStarted = new Promise((resolve) => {
    resolveSaveStarted = resolve;
  });

  const persistedSession = new Proxy(
    {
      save(callback) {
        events.push("save:start");
        savedSnapshot = JSON.parse(JSON.stringify(persistedSession));
        completeSave = (err) => {
          events.push(err ? "save:failed" : "save:complete");
          callback(err || null);
        };
        resolveSaveStarted();
      },
    },
    {
      set(target, property, value) {
        if (String(property).startsWith("church")) {
          events.push(`assign:${String(property)}`);
        }
        target[property] = value;
        return true;
      },
    }
  );

  const req = {
    churchContext: {
      organization: { id: 10, status: "active" },
      branch: { id: 20, status: "active" },
    },
    session: {
      regenerate(callback) {
        events.push("regenerate");
        req.session = persistedSession;
        callback(null);
      },
    },
  };

  return {
    req,
    saveStarted,
    completeSave(err) {
      assert.equal(typeof completeSave, "function", "session save must have started");
      completeSave(err);
    },
    getSavedSnapshot() {
      return savedSnapshot;
    },
  };
}

function makeResponse(events) {
  const redirects = [];
  return {
    redirects,
    redirect(status, destination) {
      events.push(`redirect:${status}:${destination}`);
      redirects.push({ status, destination });
      return { status, destination };
    },
  };
}

function branchAdminRole() {
  return {
    type: "branch_admin",
    accountId: 30,
    status: "active",
    label: "Branch administrator",
    sessionPayload: {
      branch_admin_id: 30,
      organization_id: 10,
      branch_id: 20,
      role: "branch_admin",
      status: "active",
      security_version: 7,
    },
  };
}

test("single-role login persists the complete authenticated payload before redirect", async () => {
  const events = [];
  const role = branchAdminRole();
  const { runTenantUnifiedLoginPost } = loadLoginRunner(
    { ok: true, roles: [role], primaryRole: role, needsPortalChoice: false },
    events
  );
  const deferred = makeDeferredSessionRequest(events);
  const res = makeResponse(events);

  const completion = runTenantUnifiedLoginPost({}, deferred.req, res, {
    identifier: "branch@example.test",
    password: "not-recorded",
    renderError: () => {
      throw new Error("unexpected login rejection");
    },
  });

  await deferred.saveStarted;
  assert.deepEqual(res.redirects, [], "redirect must wait for the session store callback");
  assert.equal(deferred.getSavedSnapshot().churchBranchAdmin.security_version, 7);
  assert.ok(events.indexOf("regenerate") < events.indexOf("assign:churchBranchAdmin"));
  assert.ok(events.indexOf("assign:churchBranchAdmin") < events.indexOf("save:start"));

  deferred.completeSave();
  await completion;

  assert.deepEqual(res.redirects, [{ status: 303, destination: "/branch/dashboard" }]);
  assert.ok(events.indexOf("save:complete") < events.indexOf("redirect:303:/branch/dashboard"));
});

test("multi-role login persists secret-free portal choice before redirect", async () => {
  const events = [];
  const roles = [
    branchAdminRole(),
    {
      type: "member",
      accountId: 40,
      status: "verified",
      label: "Member",
      password: "must-not-persist",
      password_hash: "must-not-persist",
      sessionPayload: {
        member_id: 40,
        branch_id: 20,
        status: "verified",
        security_version: 3,
      },
    },
  ];
  const { runTenantUnifiedLoginPost } = loadLoginRunner(
    { ok: true, roles, primaryRole: roles[0], needsPortalChoice: true },
    events
  );
  const deferred = makeDeferredSessionRequest(events);
  const res = makeResponse(events);

  const completion = runTenantUnifiedLoginPost({}, deferred.req, res, {
    identifier: "multi@example.test",
    password: "not-recorded",
    renderError: () => {
      throw new Error("unexpected login rejection");
    },
  });

  await deferred.saveStarted;
  assert.deepEqual(res.redirects, [], "portal-choice redirect must wait for persistence");
  const snapshot = deferred.getSavedSnapshot();
  assert.equal(snapshot.churchPortalChoice.organization_id, 10);
  assert.equal(snapshot.churchPortalChoice.branch_id, 20);
  assert.equal(snapshot.churchPortalChoice.roles.length, 2);
  assert.doesNotMatch(JSON.stringify(snapshot), /password|password_hash|sessionPayload/i);
  assert.ok(events.indexOf("regenerate") < events.indexOf("assign:churchPortalChoice"));
  assert.ok(events.indexOf("assign:churchPortalChoice") < events.indexOf("save:start"));

  deferred.completeSave();
  await completion;

  assert.deepEqual(res.redirects, [{ status: 303, destination: "/choose-portal" }]);
  assert.ok(events.indexOf("save:complete") < events.indexOf("redirect:303:/choose-portal"));
});

test("session persistence failure rejects safely and never redirects", async () => {
  const events = [];
  const role = branchAdminRole();
  const { runTenantUnifiedLoginPost } = loadLoginRunner(
    { ok: true, roles: [role], primaryRole: role, needsPortalChoice: false },
    events
  );
  const deferred = makeDeferredSessionRequest(events);
  const res = makeResponse(events);

  const completion = runTenantUnifiedLoginPost({}, deferred.req, res, {
    identifier: "branch@example.test",
    password: "not-recorded",
    renderError: () => {
      throw new Error("unexpected login rejection");
    },
  });

  await deferred.saveStarted;
  deferred.completeSave(new Error("database password=secret session-id=secret"));

  await assert.rejects(completion, (err) => {
    assert.equal(err.code, "AUTH_SESSION_SAVE_FAILED");
    assert.equal(err.message, "Unable to complete sign-in.");
    assert.equal(err.cause, undefined);
    assert.doesNotMatch(String(err), /password|session-id|secret/i);
    assert.doesNotMatch(JSON.stringify(err), /password|session-id|secret/i);
    return true;
  });
  assert.deepEqual(res.redirects, []);
  assert.equal(events.filter((event) => event.startsWith("redirect:")).length, 0);
});

test("safe member next destination remains unchanged and still waits for persistence", async () => {
  const events = [];
  const role = {
    type: "member",
    accountId: 40,
    status: "verified",
    label: "Member",
    sessionPayload: {
      member_id: 40,
      branch_id: 20,
      status: "verified",
      security_version: 3,
    },
  };
  const { runTenantUnifiedLoginPost } = loadLoginRunner(
    { ok: true, roles: [role], primaryRole: role, needsPortalChoice: false },
    events
  );
  const deferred = makeDeferredSessionRequest(events);
  const res = makeResponse(events);

  const completion = runTenantUnifiedLoginPost({}, deferred.req, res, {
    identifier: "member@example.test",
    password: "not-recorded",
    nextPath: "/member/account",
    renderError: () => {
      throw new Error("unexpected login rejection");
    },
  });

  await deferred.saveStarted;
  assert.deepEqual(res.redirects, []);
  deferred.completeSave();
  await completion;
  assert.deepEqual(res.redirects, [{ status: 303, destination: "/member/account" }]);
});

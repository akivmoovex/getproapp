"use strict";

/**
 * Isolated-PostgreSQL execution checks.
 * This module does not connect, create a role, create a database, or start a server.
 * The regression bootstrap wrapper calls assertIsolatedBootstrapLaunch before pg is imported.
 */

const fs = require("fs");
const path = require("path");

const SHARED_POSTGRES_PORT = "5432";
const ISOLATED_POSTGRES_PORT = "55432";
const ISOLATED_HOST = "127.0.0.1";
const TARGET_DATABASE_NAME = "getpro_v13_e2e_regression213101";
const G78_HTTP_DATABASE = "getpro_v13_e2e_g78d2301";
const TARGET_ROLE = "v13_regression_213101";
const ISOLATED_DIR_NAME = ".v13-isolated-pg";
const SHARED_DATA_MARKERS = Object.freeze([
  "Application Support/Postgres",
  "Postgres.app",
  "var-16",
  "/opt/homebrew/var/postgresql",
  "/usr/local/var/postgres",
]);

const ROLE_ATTRIBUTES = Object.freeze({
  login: true,
  superuser: false,
  createdb: false,
  createrole: false,
  replication: false,
  bypassrls: false,
  inherit: false,
});

const ISOLATED_INSTANCE_ID = "v13-regression-213101";
const ROLE_PRIVILEGE_DECLARATION =
  "LOGIN,NOSUPERUSER,NOCREATEDB,NOCREATEROLE,NOREPLICATION,NOBYPASSRLS,NOINHERIT";

function repoRoot() {
  return path.resolve(__dirname, "../../..");
}

function fail(message) {
  throw new Error(`V13_ISOLATED_PLAN: ${message}`);
}

function parseTargetUrl(connectionString) {
  let parsed;
  try {
    parsed = new URL(String(connectionString || "").trim().replace(/^postgresql:/i, "postgres:"));
  } catch {
    fail("connection string is not a PostgreSQL URL");
  }
  return {
    host: String(parsed.hostname || "").toLowerCase(),
    port: parsed.port || SHARED_POSTGRES_PORT,
    database: decodeURIComponent((parsed.pathname || "").replace(/^\//, "")),
    username: decodeURIComponent(parsed.username || ""),
  };
}

/**
 * Accept only the designed loopback instance. Port 5432 is the shared cluster.
 * The returned object never includes a password.
 */
function assertIsolatedConnectionTarget(connectionString) {
  const target = parseTargetUrl(connectionString);
  if (target.host !== ISOLATED_HOST) {
    fail(`host must be ${ISOLATED_HOST}`);
  }
  if (target.port === SHARED_POSTGRES_PORT) {
    fail("refusing shared PostgreSQL port 5432");
  }
  if (target.port !== ISOLATED_POSTGRES_PORT) {
    fail(`port must be ${ISOLATED_POSTGRES_PORT}`);
  }
  if (target.database !== TARGET_DATABASE_NAME) {
    fail(`database must be ${TARGET_DATABASE_NAME}`);
  }
  if (target.username !== TARGET_ROLE) {
    fail(`role must be ${TARGET_ROLE}`);
  }
  return {
    host: target.host,
    port: target.port,
    database: target.database,
    username: target.username,
  };
}

function isolationRoot(worktree) {
  return path.resolve(path.resolve(String(worktree || repoRoot())), ISOLATED_DIR_NAME);
}

/**
 * Lexical containment plus an lstat walk. Missing leaves are allowed.
 * An existing symlink, or a realpath outside the worktree, is rejected.
 * This does not create directories.
 */
function assertProjectLocalIsolationPath(worktree, targetPath) {
  const root = path.resolve(String(worktree || repoRoot()));
  const base = isolationRoot(root);
  const target = path.resolve(String(targetPath || ""));
  const inside = path.relative(base, target);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) {
    fail("path is outside the project-local isolation root");
  }
  let rootStat;
  try {
    rootStat = fs.lstatSync(root);
  } catch (error) {
    fail(`worktree is not accessible (${error.code || "unknown"})`);
  }
  if (rootStat.isSymbolicLink()) fail("worktree path is a symlink");
  const realRoot = fs.realpathSync(root);
  let cursor = root;
  for (const part of path.relative(root, target).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return { path: target, exists: false, realPath: null };
      }
      fail(`isolation path is not accessible (${error.code || "unknown"})`);
    }
    if (stat.isSymbolicLink()) fail("refusing a symlink inside the isolation path");
    const real = fs.realpathSync(cursor);
    const escaped = path.relative(realRoot, real);
    if (!escaped || escaped.startsWith("..") || path.isAbsolute(escaped)) {
      fail("resolved isolation path escapes the worktree");
    }
  }
  return { path: target, exists: true, realPath: fs.realpathSync(target) };
}

function assertIsolatedDataDirectory(worktree, dataDir) {
  const root = path.resolve(String(worktree || ""));
  const expected = path.resolve(root, ISOLATED_DIR_NAME, "data");
  const given = path.resolve(String(dataDir || ""));
  if (given !== expected) {
    fail("data directory must be the project-local .v13-isolated-pg/data path");
  }
  const socketDir = path.resolve(root, ISOLATED_DIR_NAME, "run");
  const blob = `${given} ${socketDir}`;
  for (const marker of SHARED_DATA_MARKERS) {
    if (blob.includes(marker)) fail("refusing a shared PostgreSQL data path");
  }
  if (given.includes(`${path.sep}tmp${path.sep}`) || socketDir === "/tmp") {
    fail("refusing a shared temporary socket or data path");
  }
  const dataPath = assertProjectLocalIsolationPath(root, given);
  const socketPath = assertProjectLocalIsolationPath(root, socketDir);
  return {
    dataDir: given,
    socketDir,
    dataExists: dataPath.exists,
    socketExists: socketPath.exists,
  };
}

function expectedRoleCatalogSnapshot() {
  return {
    rolname: TARGET_ROLE,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
    rolinherit: false,
    rolcanlogin: true,
    databases: [TARGET_DATABASE_NAME],
  };
}

function assertRoleCatalogSnapshot(raw, expectedDatabase = TARGET_DATABASE_NAME) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      fail("role catalog snapshot is not valid JSON");
    }
  }
  if (!parsed || parsed.rolname !== TARGET_ROLE) fail("role catalog snapshot has the wrong role");
  if (parsed.rolcanlogin !== true) fail("role catalog snapshot must be a login role");
  for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls", "rolinherit"]) {
    if (parsed[key] !== false) fail(`role catalog snapshot prohibits ${key}`);
  }
  const databases = parsed.databases;
  if (!Array.isArray(databases) || databases.length !== 1 || databases[0] !== expectedDatabase) {
    fail("role catalog snapshot must list only the disposable database");
  }
  return parsed;
}

function assertIsolatedHba(text) {
  const source = String(text || "");
  if (/trust/i.test(source)) fail("pg_hba must not use trust");
  if (source.includes("0.0.0.0") || source.includes("::/0")) {
    fail("pg_hba must not allow remote addresses");
  }
  if (!source.includes("scram-sha-256")) fail("pg_hba must require SCRAM");
  if (!source.includes("127.0.0.1/32")) fail("pg_hba must allow 127.0.0.1/32 only");
  return true;
}

function assertDedicatedRole(spec) {
  const role = spec || {};
  if (role.name !== TARGET_ROLE) fail(`role name must be ${TARGET_ROLE}`);
  for (const [key, expected] of Object.entries(ROLE_ATTRIBUTES)) {
    if (role[key] !== expected) fail(`role ${key} must be ${expected}`);
  }
  return true;
}

function assertTeardownPlan(input) {
  const target = assertIsolatedConnectionTarget(input && input.connectionString);
  if (String(input && input.teardownAuthorized || "") !== "1") {
    fail("teardown requires GETPRO_V13_TEARDOWN_AUTHORIZED=1");
  }
  const statements = [
    `DROP DATABASE IF EXISTS ${TARGET_DATABASE_NAME};`,
    `DROP ROLE IF EXISTS ${TARGET_ROLE};`,
  ];
  const joined = statements.join("\n");
  if (joined.includes(SHARED_POSTGRES_PORT) || /DROP\s+DATABASE\s+postgres\b/i.test(joined)) {
    fail("teardown must not name the shared instance");
  }
  if ((joined.match(/DROP\s+DATABASE/gi) || []).length !== 1) {
    fail("teardown drops one database");
  }
  return { target, statements };
}

const STAGE_FLAGS = Object.freeze({
  create_instance: ["GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED"],
  create_database: [
    "GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED",
    "GETPRO_V13_ALLOW_DB_WRITES",
    "GETPRO_V13_DB_STAGES_AUTHORIZED",
  ],
  bootstrap: [
    "GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED",
    "GETPRO_V13_ALLOW_DB_WRITES",
    "GETPRO_V13_DB_STAGES_AUTHORIZED",
  ],
  fixtures: [
    "GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED",
    "GETPRO_V13_ALLOW_DB_WRITES",
    "GETPRO_V13_DB_STAGES_AUTHORIZED",
  ],
  http: [
    "GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED",
    "GETPRO_V13_ALLOW_DB_WRITES",
    "GETPRO_V13_DB_STAGES_AUTHORIZED",
    "GETPRO_V13_HTTP_AUTHORIZED",
  ],
  browser: [
    "GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED",
    "GETPRO_V13_ALLOW_DB_WRITES",
    "GETPRO_V13_DB_STAGES_AUTHORIZED",
    "GETPRO_V13_BROWSER_AUTHORIZED",
  ],
  teardown: [
    "GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED",
    "GETPRO_V13_ALLOW_DB_WRITES",
    "GETPRO_V13_DB_STAGES_AUTHORIZED",
    "GETPRO_V13_TEARDOWN_AUTHORIZED",
  ],
});

function isolatedBootstrapEnv(worktree) {
  const root = path.resolve(String(worktree || repoRoot()));
  return {
    GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED: "1",
    GETPRO_V13_ISOLATED_PG_PORT: ISOLATED_POSTGRES_PORT,
    GETPRO_V13_ISOLATED_INSTANCE_ID: ISOLATED_INSTANCE_ID,
    GETPRO_V13_PG_CLUSTER_NAME: ISOLATED_INSTANCE_ID,
    GETPRO_V13_PG_DATA_DIR: path.join(root, ISOLATED_DIR_NAME, "data"),
    GETPRO_V13_PG_SOCKET_DIR: path.join(root, ISOLATED_DIR_NAME, "run"),
    GETPRO_V13_REGRESSION_ROLE_PRIVILEGES: ROLE_PRIVILEGE_DECLARATION,
    GETPRO_V13_ROLE_CATALOG_SNAPSHOT: JSON.stringify(expectedRoleCatalogSnapshot()),
    GETPRO_V13_WORKTREE: root,
  };
}

function isolatedConnectionString() {
  return `postgresql://${TARGET_ROLE}@${ISOLATED_HOST}:${ISOLATED_POSTGRES_PORT}/${TARGET_DATABASE_NAME}`;
}

function resolveLaunchTarget(source) {
  const override = String(source.GETPRO_V13_HTTP_DATABASE_NAME || "").trim();
  if (!override) return assertIsolatedConnectionTarget(String(source.E2E_DATABASE_URL || "").trim());
  if (String(source.GETPRO_V13_HTTP_AUTHORIZED || "") !== "1") {
    fail("HTTP database override requires GETPRO_V13_HTTP_AUTHORIZED=1");
  }
  if (override !== G78_HTTP_DATABASE) {
    fail("HTTP database override is not the authorized G78 disposable database");
  }
  const target = parseTargetUrl(String(source.E2E_DATABASE_URL || "").trim());
  if (target.host !== ISOLATED_HOST) fail(`host must be ${ISOLATED_HOST}`);
  if (target.port === SHARED_POSTGRES_PORT) fail("refusing shared PostgreSQL port 5432");
  if (target.port !== ISOLATED_POSTGRES_PORT) fail(`port must be ${ISOLATED_POSTGRES_PORT}`);
  if (target.username !== TARGET_ROLE) fail(`role must be ${TARGET_ROLE}`);
  if (target.database === TARGET_DATABASE_NAME) fail("refusing the existing regression database");
  if (target.database !== override) fail(`database must be ${override}`);
  return {
    host: target.host,
    port: target.port,
    database: target.database,
    username: target.username,
  };
}

/**
 * Connection-free launch gate. Port is necessary and not sufficient:
 * the data directory, cluster name, instance id, and role privileges must
 * also name this disposable instance rather than Postgres.app.
 * @param {NodeJS.ProcessEnv} env
 */
function assertIsolatedBootstrapLaunch(env) {
  const source = env || {};
  if (String(source.GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED || "") !== "1") {
    fail("GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED=1 is required");
  }
  if (String(source.GETPRO_V13_ALLOW_DB_WRITES || "") !== "1" || String(source.GETPRO_V13_DB_STAGES_AUTHORIZED || "") !== "1") {
    fail("database-write authorization is required");
  }
  if (String(source.GETPRO_DATABASE_URL || "").trim()) {
    fail("GETPRO_DATABASE_URL must stay unset");
  }
  const selected = String(source.E2E_DATABASE_URL || "").trim();
  const target = resolveLaunchTarget(source);
  if (target.database !== parseTargetUrl(selected).database) {
    fail("launch target does not match E2E_DATABASE_URL");
  }
  const approvedPort = String(source.GETPRO_V13_ISOLATED_PG_PORT || "").trim();
  if (approvedPort !== ISOLATED_POSTGRES_PORT || target.port !== approvedPort) {
    fail(`approved isolated port must be ${ISOLATED_POSTGRES_PORT}`);
  }
  if (String(source.GETPRO_V13_ISOLATED_INSTANCE_ID || "") !== ISOLATED_INSTANCE_ID) {
    fail("isolated instance id does not match v13-regression-213101");
  }
  if (String(source.GETPRO_V13_PG_CLUSTER_NAME || "") !== ISOLATED_INSTANCE_ID) {
    fail("cluster name must be the disposable instance, not Postgres.app");
  }
  const directories = assertIsolatedDataDirectory(
    source.GETPRO_V13_WORKTREE || repoRoot(),
    source.GETPRO_V13_PG_DATA_DIR
  );
  const socketDir = path.resolve(String(source.GETPRO_V13_PG_SOCKET_DIR || ""));
  if (socketDir !== directories.socketDir) {
    fail("socket directory must be the project-local .v13-isolated-pg/run path");
  }
  for (const marker of SHARED_DATA_MARKERS) {
    if (`${directories.dataDir} ${socketDir} ${source.GETPRO_V13_PG_CLUSTER_NAME || ""}`.includes(marker)) {
      fail("refusing the shared Postgres.app instance");
    }
  }
  const privileges = String(source.GETPRO_V13_REGRESSION_ROLE_PRIVILEGES || "");
  if (privileges !== ROLE_PRIVILEGE_DECLARATION) {
    fail("regression role privileges must be the non-superuser declaration");
  }
  assertDedicatedRole({
    name: target.username,
    login: true,
    superuser: false,
    createdb: false,
    createrole: false,
    replication: false,
    bypassrls: false,
    inherit: false,
  });
  assertRoleCatalogSnapshot(source.GETPRO_V13_ROLE_CATALOG_SNAPSHOT, target.database);
  return {
    ...target,
    instanceId: ISOLATED_INSTANCE_ID,
    dataDir: directories.dataDir,
    socketDir,
  };
}

function assertFutureStageAuthorized(stage, env) {
  const flags = STAGE_FLAGS[stage];
  if (!flags) fail(`unknown stage ${stage}`);
  const source = env || {};
  for (const flag of flags) {
    if (String(source[flag] || "") !== "1") fail(`${stage} requires ${flag}=1`);
  }
  if (String(source.GETPRO_DATABASE_URL || "").trim()) {
    fail("GETPRO_DATABASE_URL must stay unset");
  }
  const selected = String(source.E2E_DATABASE_URL || source.TEST_DATABASE_URL || "").trim();
  if (stage !== "create_instance") {
    const target = assertIsolatedConnectionTarget(selected);
    if (String(source.DATABASE_URL || "") !== selected) {
      fail("DATABASE_URL must match the isolated URL");
    }
    return { stage, target };
  }
  for (const key of ["DATABASE_URL", "E2E_DATABASE_URL", "TEST_DATABASE_URL"]) {
    const value = String(source[key] || "");
    if (value.includes(`:${SHARED_POSTGRES_PORT}/`) || value.includes(`:${SHARED_POSTGRES_PORT}?`)) {
      fail("create_instance must not point at port 5432");
    }
  }
  return { stage, target: null };
}

module.exports = {
  SHARED_POSTGRES_PORT,
  ISOLATED_POSTGRES_PORT,
  ISOLATED_HOST,
  TARGET_DATABASE_NAME,
  G78_HTTP_DATABASE,
  TARGET_ROLE,
  ISOLATED_DIR_NAME,
  SHARED_DATA_MARKERS,
  ROLE_ATTRIBUTES,
  ISOLATED_INSTANCE_ID,
  ROLE_PRIVILEGE_DECLARATION,
  STAGE_FLAGS,
  repoRoot,
  isolationRoot,
  expectedRoleCatalogSnapshot,
  isolatedBootstrapEnv,
  isolatedConnectionString,
  assertProjectLocalIsolationPath,
  assertRoleCatalogSnapshot,
  assertIsolatedBootstrapLaunch,
  assertIsolatedConnectionTarget,
  assertIsolatedDataDirectory,
  assertIsolatedHba,
  assertDedicatedRole,
  assertTeardownPlan,
  assertFutureStageAuthorized,
};

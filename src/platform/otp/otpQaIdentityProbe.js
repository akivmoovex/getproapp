"use strict";

/**
 * Database identity probe for a future BlessBoard QA send.
 * Construction does not open PostgreSQL. A positive observation is built
 * only from a query result. Expected names are compared later by the gate;
 * they are not sent as claims and they are not copied from environment
 * variables into the observation.
 */

const path = require("path");
const {
  APPROVED_QA_SOCKET_DIRECTORY,
  QA_DATABASE_HOST,
  QA_DATABASE_NAME,
  QA_DATABASE_PORT,
  QA_DATABASE_ROLE,
  QA_SHARED_PORT,
} = require("./otpQaLiveDelivery");

const OBSERVATION_SQL = `
SELECT current_database() AS current_database,
       inet_server_port()::text AS inet_server_port,
       host(inet_server_addr()) AS server_addr,
       current_user AS current_user,
       current_setting('data_directory') AS data_directory,
       current_setting('unix_socket_directories') AS unix_socket_directories,
       current_setting('cluster_name') AS cluster_name,
       di.identity_key AS identity_key,
       di.environment_code AS environment_code
FROM platform.database_identity di
WHERE di.id = 1
`.trim();

let livePgClientConstructions = 0;

function refused(reason) {
  return Object.freeze({
    ok: false,
    evidence: "probe_refused",
    reason,
  });
}

function guardConnect(request) {
  const connect = request && request.connect;
  if (!request || !connect || typeof connect !== "object") return "database_identity_unverified";
  if (connect.password || request.password || request.identityKey || request.dataDirectory || request.instanceId) {
    return "database_identity_unverified";
  }
  const host = String(connect.host || "");
  if (host.startsWith("/") || host.includes("\\")) return "database_socket_rejected";
  if (host !== QA_DATABASE_HOST) return "database_host_not_loopback";
  const port = String(connect.port || "");
  if (port === QA_SHARED_PORT) return "database_port_shared";
  if (port !== QA_DATABASE_PORT) return "database_port_not_isolated";
  if (connect.database !== QA_DATABASE_NAME || connect.username !== QA_DATABASE_ROLE) {
    return "database_identity_mismatch";
  }
  return null;
}

function passwordFromEnv(env) {
  const raw = String((env && env.DATABASE_URL) || "").trim();
  if (!raw || /[?&](?:database|db)=/i.test(raw)) return "";
  try {
    const parsed = new URL(raw.replace(/^postgresql:/i, "postgres:"));
    return decodeURIComponent(parsed.password || "");
  } catch {
    return "";
  }
}

function defaultClientFactory(config) {
  livePgClientConstructions += 1;
  const { Client } = require("pg");
  return new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: 2000,
    ssl: false,
  });
}

async function defaultLiveQuery(sql, connect, env, clientFactory) {
  const password = passwordFromEnv(env);
  if (!password) {
    const error = new Error("database_identity_unverified");
    error.code = "database_identity_unverified";
    throw error;
  }
  const factory = typeof clientFactory === "function" ? clientFactory : defaultClientFactory;
  const client = factory({
    host: connect.host,
    port: Number(connect.port),
    database: connect.database,
    user: connect.username,
    password,
  });
  if (!client || typeof client.connect !== "function" || typeof client.query !== "function") {
    const error = new Error("database_identity_unverified");
    error.code = "database_identity_unverified";
    throw error;
  }
  await client.connect();
  try {
    const result = await client.query(sql);
    const rows = result && result.rows;
    return rows && rows[0] ? rows[0] : null;
  } finally {
    if (typeof client.end === "function") await client.end();
  }
}

async function observeApprovedDatabaseIdentity(request, deps) {
  const blocked = guardConnect(request);
  if (blocked) return refused(blocked);
  const options = deps || {};
  if (typeof options.query !== "function") return refused("database_identity_unverified");
  let row;
  try {
    row = await options.query(OBSERVATION_SQL, request.connect);
  } catch {
    return refused("database_identity_unverified");
  }
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return refused("database_identity_malformed");
  }
  const socketRaw = String(row.unix_socket_directories || "").split(",")[0].trim();
  let socketDirectory = "";
  try {
    socketDirectory = socketRaw ? path.resolve(socketRaw) : "";
  } catch {
    socketDirectory = "";
  }
  return {
    ok: true,
    evidence: "postgresql_observation",
    nonce: request.nonce,
    currentDatabase: row.current_database,
    inetServerPort: row.inet_server_port != null ? String(row.inet_server_port) : "",
    host: row.server_addr != null ? String(row.server_addr) : "",
    currentUser: row.current_user,
    identityKey: row.identity_key,
    identityEnv: row.environment_code,
    instanceId: row.cluster_name,
    dataDirectory: row.data_directory,
    socketDirectory,
  };
}

function createDatabaseIdentityProbe(deps) {
  const options = deps || {};
  return async function databaseIdentityProbe(request) {
    const query =
      typeof options.query === "function"
        ? options.query
        : (sql, connect) => defaultLiveQuery(sql, connect, options.env, options.clientFactory);
    return observeApprovedDatabaseIdentity(request, { query });
  };
}

function qaProbeDiagnostics() {
  return Object.freeze({ livePgClientConstructions });
}

module.exports = {
  OBSERVATION_SQL,
  APPROVED_QA_SOCKET_DIRECTORY,
  guardConnect,
  observeApprovedDatabaseIdentity,
  createDatabaseIdentityProbe,
  qaProbeDiagnostics,
};

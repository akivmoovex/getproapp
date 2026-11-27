"use strict";

/**
 * Database identity probe for a future BlessBoard QA send.
 * Construction does not open PostgreSQL. Database name, port, role, and
 * identity come from the query. Data-directory and socket-directory values
 * come only from the listener postmaster.pid. Expected names are compared
 * later by the gate. They are not sent as claims and they are not copied
 * from environment variables into the observation.
 */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const {
  LISTENER_PATH_EVIDENCE,
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

function execFileText(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 2000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(String(stdout || ""));
    });
  });
}

function parseLoopbackListenerPid(lsofText, port) {
  const needle = `127.0.0.1:${port}`;
  const pids = [];
  for (const line of String(lsofText || "").split("\n")) {
    if (!line.includes(needle) || !line.includes("(LISTEN)")) continue;
    if (line.includes(`*:${port}`) || line.includes(`[::]:${port}`)) return "";
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== "postgres" || !/^\d+$/.test(fields[1] || "")) return "";
    pids.push(fields[1]);
  }
  const unique = [...new Set(pids)];
  return unique.length === 1 ? unique[0] : "";
}

function parseDataDirectoryArg(argsText) {
  const match = String(argsText || "").match(/(?:^|\s)-D\s+(\S+)/);
  if (!match) return "";
  try {
    return path.resolve(match[1]);
  } catch {
    return "";
  }
}

function readPostmasterIdentity(pidFileText, listenerPid, port, dataDirectory) {
  const lines = String(pidFileText || "").split("\n");
  const recordedPid = String(lines[0] || "").trim();
  const recordedData = String(lines[1] || "").trim();
  const recordedPort = String(lines[3] || "").trim();
  const recordedSocket = String(lines[4] || "").trim();
  if (!recordedPid || recordedPid !== String(listenerPid)) return null;
  if (recordedPort !== String(port) || !recordedSocket || !recordedData) return null;
  let resolvedData = "";
  let resolvedSocket = "";
  try {
    resolvedData = path.resolve(recordedData);
    resolvedSocket = path.resolve(recordedSocket);
  } catch {
    return null;
  }
  if (resolvedData !== dataDirectory) return null;
  return {
    evidence: LISTENER_PATH_EVIDENCE,
    port: recordedPort,
    dataDirectory: resolvedData,
    socketDirectory: resolvedSocket,
  };
}

async function defaultObserveListener(host, port) {
  if (host !== QA_DATABASE_HOST || String(port) === QA_SHARED_PORT || !/^\d{2,5}$/.test(String(port))) {
    return null;
  }
  const lsofText = await execFileText("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  const pid = parseLoopbackListenerPid(lsofText, String(port));
  if (!pid) return null;
  const argsText = await execFileText("ps", ["-ww", "-o", "args=", "-p", pid]);
  const dataDirectory = parseDataDirectoryArg(argsText);
  if (!dataDirectory) return null;
  const pidFileText = await fs.promises.readFile(path.join(dataDirectory, "postmaster.pid"), "utf8");
  return readPostmasterIdentity(pidFileText, pid, String(port), dataDirectory);
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
  const observeListener =
    typeof options.observeListener === "function" ? options.observeListener : defaultObserveListener;
  let listener;
  try {
    listener = await observeListener(request.connect.host, request.connect.port);
  } catch {
    return refused("database_identity_unverified");
  }
  if (
    !listener ||
    listener.evidence !== LISTENER_PATH_EVIDENCE ||
    String(listener.port || "") !== String(request.connect.port)
  ) {
    return refused("database_identity_unverified");
  }
  let dataDirectory = "";
  let socketDirectory = "";
  try {
    dataDirectory = path.resolve(String(listener.dataDirectory || ""));
    socketDirectory = path.resolve(String(listener.socketDirectory || ""));
  } catch {
    return refused("database_identity_malformed");
  }
  return {
    ok: true,
    evidence: "postgresql_observation",
    pathEvidence: LISTENER_PATH_EVIDENCE,
    nonce: request.nonce,
    currentDatabase: row.current_database,
    inetServerPort: row.inet_server_port != null ? String(row.inet_server_port) : "",
    host: row.server_addr != null ? String(row.server_addr) : "",
    currentUser: row.current_user,
    identityKey: row.identity_key,
    identityEnv: row.environment_code,
    instanceId: row.cluster_name,
    dataDirectory,
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
    return observeApprovedDatabaseIdentity(request, {
      query,
      observeListener: options.observeListener,
    });
  };
}

function qaProbeDiagnostics() {
  return Object.freeze({ livePgClientConstructions });
}

module.exports = {
  OBSERVATION_SQL,
  guardConnect,
  parseLoopbackListenerPid,
  parseDataDirectoryArg,
  readPostmasterIdentity,
  observeApprovedDatabaseIdentity,
  createDatabaseIdentityProbe,
  qaProbeDiagnostics,
};

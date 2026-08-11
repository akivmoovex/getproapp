"use strict";

/**
 * Safe DATABASE_URL fingerprint helpers — never log credentials or full URLs.
 */

/**
 * @param {unknown} rawUrl
 * @returns {{
 *   ok: boolean,
 *   protocol: string|null,
 *   hostname: string|null,
 *   port: string|null,
 *   database: string|null,
 *   error: string|null,
 * }}
 */
function parseDatabaseUrlFingerprint(rawUrl) {
  const empty = {
    ok: false,
    protocol: null,
    hostname: null,
    port: null,
    database: null,
    error: "missing",
  };
  if (rawUrl == null || String(rawUrl).trim() === "") return empty;
  try {
    // URL() requires a scheme; postgres:// is valid in WHATWG URL in Node.
    const u = new URL(String(rawUrl).trim());
    let database = u.pathname || "";
    if (database.startsWith("/")) database = database.slice(1);
    // Drop query/path extras for safety
    database = database.split("?")[0].split("/")[0] || null;
    return {
      ok: true,
      protocol: u.protocol ? u.protocol.replace(/:$/, "") : null,
      hostname: u.hostname || null,
      port: u.port || null,
      database,
      error: null,
    };
  } catch (_err) {
    return {
      ok: false,
      protocol: null,
      hostname: null,
      port: null,
      database: null,
      error: "unparseable",
    };
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   sourceVar: string,
 *   fingerprint: ReturnType<typeof parseDatabaseUrlFingerprint>,
 * }}
 */
function fingerprintEffectiveDatabaseUrl(env) {
  const source = env || process.env;
  if (source.DATABASE_URL != null && String(source.DATABASE_URL).trim() !== "") {
    return {
      sourceVar: "DATABASE_URL",
      fingerprint: parseDatabaseUrlFingerprint(source.DATABASE_URL),
    };
  }
  if (source.GETPRO_DATABASE_URL != null && String(source.GETPRO_DATABASE_URL).trim() !== "") {
    return {
      sourceVar: "GETPRO_DATABASE_URL",
      fingerprint: parseDatabaseUrlFingerprint(source.GETPRO_DATABASE_URL),
    };
  }
  return {
    sourceVar: "(none)",
    fingerprint: parseDatabaseUrlFingerprint(""),
  };
}

/**
 * One greppable log line — no secrets.
 * @param {string} phase
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ sourceKind?: string }} [opts]
 */
function formatDatabaseUrlFingerprintLog(phase, env, opts) {
  const { sourceVar, fingerprint } = fingerprintEffectiveDatabaseUrl(env);
  const kind = (opts && opts.sourceKind) || "process.env";
  if (!fingerprint.ok) {
    return (
      `[getpro] dbUrlFingerprint phase=${phase} sourceVar=${sourceVar} sourceKind=${kind} ` +
      `ok=no error=${fingerprint.error}`
    );
  }
  return (
    `[getpro] dbUrlFingerprint phase=${phase} sourceVar=${sourceVar} sourceKind=${kind} ` +
    `protocol=${fingerprint.protocol || "(none)"} ` +
    `hostname=${fingerprint.hostname || "(none)"} ` +
    `port=${fingerprint.port || "(default)"} ` +
    `database=${fingerprint.database || "(none)"}`
  );
}

module.exports = {
  parseDatabaseUrlFingerprint,
  fingerprintEffectiveDatabaseUrl,
  formatDatabaseUrlFingerprintLog,
};

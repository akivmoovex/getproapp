"use strict";

/** Advisory lock id — only one Hostinger worker runs heavy bootstrap at a time. */
const BOOTSTRAP_ADVISORY_LOCK_ID = 84590231;

/**
 * Run bootstrap tasks once across concurrent workers (LiteSpeed lsnode).
 * @param {import("pg").Pool} pool
 * @param {() => Promise<void>} runTasks
 */
async function runBootstrapWithAdvisoryLock(pool, runTasks) {
  if (!pool) {
    await runTasks();
    return;
  }

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[getpro] Bootstrap: could not acquire DB client:", err.message);
    return;
  }

  try {
    const lock = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [
      BOOTSTRAP_ADVISORY_LOCK_ID,
    ]);
    if (!lock.rows[0]?.locked) {
      // eslint-disable-next-line no-console
      console.log("[getpro] Bootstrap skipped — another worker is initializing.");
      return;
    }

    // eslint-disable-next-line no-console
    console.log("[getpro] Bootstrap starting (advisory lock acquired).");
    await runTasks();
  } catch (err) {
    throw err;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [BOOTSTRAP_ADVISORY_LOCK_ID]);
    } catch {
      /* ignore unlock errors */
    }
    client.release();
  }
}

module.exports = {
  BOOTSTRAP_ADVISORY_LOCK_ID,
  runBootstrapWithAdvisoryLock,
};

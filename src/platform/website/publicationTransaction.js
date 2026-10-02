"use strict";

/**
 * Shared publication transaction helpers (PC10).
 *
 * Platform owns transaction-boundary mechanics for website publication.
 * Product adapters use these helpers inside their governance workflows;
 * they do not invent divergent SAVEPOINT / soft-failure patterns.
 */

/**
 * Soft savepoint: run `fn` inside SAVEPOINT; on error roll back to it and
 * optionally invoke `onError`. Does not abort the outer transaction.
 *
 * Used for compatibility projections that must not undo a successful
 * publish version mint (PC10C).
 *
 * @param {{ query: Function }} client
 * @param {string} savepointName — ^[a-z][a-z0-9_]*$
 * @param {() => Promise<T>} fn
 * @param {{ onError?: (err: Error) => void|Promise<void> }} [opts]
 * @returns {Promise<{ ok: true, value: T } | { ok: false, error: Error }>}
 * @template T
 */
async function runSoftSavepoint(client, savepointName, fn, opts) {
  const name = String(savepointName || "");
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error("invalid_savepoint_name");
  }
  if (!client || typeof client.query !== "function") {
    throw new Error("query_client_required");
  }
  await client.query(`SAVEPOINT ${name}`);
  try {
    const value = await fn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: true, value };
  } catch (error) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    } catch {
      /* outer TX handler decides if savepoint missing / aborted */
    }
    if (opts && typeof opts.onError === "function") {
      await opts.onError(error);
    }
    return { ok: false, error };
  }
}

module.exports = {
  runSoftSavepoint,
};

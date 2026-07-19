"use strict";

/**
 * Shared transaction composability for BlessBoard / platform provisioning services.
 *
 * Contract (Option A):
 *   service(db, input, { manageTransaction?: boolean })
 *
 * - manageTransaction defaults to true (standalone): acquire client, BEGIN, COMMIT/ROLLBACK, release.
 * - manageTransaction: false requires a connected Client (not a Pool). No BEGIN/COMMIT/ROLLBACK/release.
 *
 * Invalid:
 * - manageTransaction: false with a Pool
 * - manageTransaction: false without query capability
 */

/**
 * @param {unknown} db
 * @returns {boolean}
 */
function isPool(db) {
  return Boolean(db && typeof db.connect === "function" && typeof db.release !== "function");
}

/**
 * Checked-out pool client (or compatible) — has query + release.
 * @param {unknown} db
 * @returns {boolean}
 */
function isConnectedClient(db) {
  return Boolean(db && typeof db.query === "function" && typeof db.release === "function");
}

/**
 * @param {unknown} db
 * @param {{ manageTransaction?: boolean }} [options]
 * @returns {{
 *   ok: true,
 *   manageTransaction: boolean,
 *   db: object,
 * } | {
 *   ok: false,
 *   message: string,
 * }}
 */
function resolveManageTransactionOption(db, options) {
  const opts = options && typeof options === "object" ? options : {};
  const manageTransaction =
    opts.manageTransaction === undefined ? true : Boolean(opts.manageTransaction);

  if (!db || (typeof db.connect !== "function" && typeof db.query !== "function")) {
    return { ok: false, message: "database client or pool required" };
  }

  if (!manageTransaction) {
    // A Pool has connect but not release; a checked-out client has release.
    if (isPool(db)) {
      return {
        ok: false,
        message: "connected client required when manageTransaction is false",
      };
    }
    if (typeof db.query !== "function") {
      return { ok: false, message: "connected client required when manageTransaction is false" };
    }
  }

  return { ok: true, manageTransaction, db };
}

/**
 * Open a provisioning session (optionally BEGIN).
 * @param {object} resolved — from resolveManageTransactionOption (ok:true)
 * @returns {Promise<{
 *   client: { query: Function, release?: Function },
 *   manageTransaction: boolean,
 *   owned: boolean,
 *   beginIfManaged: () => Promise<void>,
 *   commitIfManaged: () => Promise<void>,
 *   rollbackIfManaged: () => Promise<void>,
 *   releaseIfOwned: () => void,
 *   safeRollbackOnError: () => Promise<void>,
 * }>}
 */
async function openProvisioningSession(resolved) {
  const manageTransaction = resolved.manageTransaction;
  let client = null;
  let owned = false;

  if (manageTransaction) {
    if (typeof resolved.db.connect === "function") {
      client = await resolved.db.connect();
      owned = true;
    } else {
      client = resolved.db;
      owned = false;
    }
  } else {
    client = resolved.db;
    owned = false;
  }

  const session = {
    client,
    manageTransaction,
    owned,
    async beginIfManaged() {
      if (manageTransaction) await client.query("BEGIN");
    },
    async commitIfManaged() {
      if (manageTransaction) await client.query("COMMIT");
    },
    async rollbackIfManaged() {
      if (manageTransaction) await client.query("ROLLBACK");
    },
    releaseIfOwned() {
      if (owned && client && typeof client.release === "function") {
        client.release();
        owned = false;
      }
    },
    async safeRollbackOnError() {
      if (!manageTransaction) return;
      try {
        await client.query("ROLLBACK");
      } catch {
        /* never replace the original error */
      }
    },
  };

  await session.beginIfManaged();
  return session;
}

/**
 * Standalone wrapper: one outer BEGIN/COMMIT/ROLLBACK/release around `fn(client)`.
 * Used by tests and future orchestrators. Does not nest if caller already owns a TX —
 * pass a Client with manageTransaction false via openProvisioningSession instead.
 *
 * @param {{ connect?: Function, query?: Function }} poolOrClient
 * @param {(client: object) => Promise<*>} fn
 */
async function withProvisioningTransaction(poolOrClient, fn) {
  const resolved = resolveManageTransactionOption(poolOrClient, { manageTransaction: true });
  if (!resolved.ok) {
    throw new Error(resolved.message);
  }
  const session = await openProvisioningSession(resolved);
  try {
    const result = await fn(session.client);
    await session.commitIfManaged();
    return result;
  } catch (err) {
    await session.safeRollbackOnError();
    throw err;
  } finally {
    session.releaseIfOwned();
  }
}

/**
 * Insert helper that recovers from unique violations without aborting the outer TX.
 * PostgreSQL marks the TX aborted after an error unless rolled back to a savepoint.
 *
 * @param {{ query: Function }} client
 * @param {string} savepointName — must match ^[a-z][a-z0-9_]*$
 * @param {() => Promise<T>} insertFn
 * @returns {Promise<{ ok: true, value: T } | { ok: false, uniqueViolation: true, error: Error }>}
 * @template T
 */
async function runInsertWithUniqueRecovery(client, savepointName, insertFn) {
  const name = String(savepointName || "");
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error("invalid_savepoint_name");
  }
  await client.query(`SAVEPOINT ${name}`);
  try {
    const value = await insertFn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: true, value };
  } catch (error) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    } catch {
      /* outer caller handles aborted TX */
    }
    const code = error && error.code ? String(error.code) : "";
    if (code === "23505") {
      return { ok: false, uniqueViolation: true, error };
    }
    throw error;
  }
}

module.exports = {
  isPool,
  isConnectedClient,
  resolveManageTransactionOption,
  openProvisioningSession,
  withProvisioningTransaction,
  runInsertWithUniqueRecovery,
};

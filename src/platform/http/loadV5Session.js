"use strict";

/**
 * Fail-open V5 session loader. Invalid/expired session → unauthenticated, not process failure.
 */

const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const { readV5Session } = require("../session/readV5Session");
const { readV5SessionCookie } = require("../session/v5SessionCookie");

/**
 * @param {{
 *   getPool?: () => { query: Function } | null | undefined,
 *   getDeploymentCode?: () => { ok: boolean, code: string | null },
 *   readSession?: Function,
 * }} [deps]
 */
function createLoadV5Session(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getPool = options.getPool;
  const getDeployment =
    options.getDeploymentCode || (() => getPlatformDeploymentCode());
  const readSession = options.readSession || readV5Session;

  return async function loadV5Session(req, res, next) {
    req.v5Session = { authenticated: false, reason: "none", session: null };
    try {
      const identity = getDeployment();
      if (!identity || !identity.ok || !identity.code) {
        req.v5Session = { authenticated: false, reason: "deployment_unavailable", session: null };
        return next();
      }
      const rawToken = readV5SessionCookie(req);
      if (!rawToken) {
        return next();
      }
      if (typeof getPool !== "function") {
        req.v5Session = { authenticated: false, reason: "pool_unavailable", session: null };
        return next();
      }
      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        req.v5Session = { authenticated: false, reason: "pool_unavailable", session: null };
        return next();
      }
      const result = await readSession(pool, {
        rawToken,
        deploymentCode: identity.code,
        touch: true,
      });
      if (!result.ok) {
        req.v5Session = { authenticated: false, reason: result.code || "unauthenticated", session: null };
        return next();
      }
      req.v5Session = { authenticated: true, reason: "ok", session: result.session };
    } catch {
      req.v5Session = { authenticated: false, reason: "lookup_error", session: null };
    }
    return next();
  };
}

module.exports = {
  createLoadV5Session,
};

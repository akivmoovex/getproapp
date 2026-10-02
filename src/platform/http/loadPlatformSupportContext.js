"use strict";

/**
 * Load active Platform Admin support context from cookie (does not replace session).
 */

const {
  readSupportContextCookie,
  clearSupportContextCookie,
} = require("./supportContextCookie");
const {
  resolveActiveSupportContext,
} = require("../services/platformSupportModeService");

/**
 * @param {{
 *   getPool: () => { query: Function } | null | undefined,
 *   env?: object,
 *   isProduction?: boolean,
 * }} deps
 */
function createLoadPlatformSupportContext(deps) {
  const getPool = deps.getPool;
  const env = deps.env || process.env;
  const isProduction = Boolean(deps.isProduction);

  return async function loadPlatformSupportContext(req, res, next) {
    req.platformSupportContext = {
      active: false,
      context: null,
      expired: false,
    };
    try {
      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;
      if (!session || !session.userId) {
        return next();
      }
      const rawToken = readSupportContextCookie(req, env);
      if (!rawToken) {
        return next();
      }
      if (typeof getPool !== "function") {
        return next();
      }
      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        return next();
      }
      const resolved = await resolveActiveSupportContext(pool, {
        rawToken,
        actorUserId: session.userId,
        env,
      });
      if (!resolved.ok) {
        return next();
      }
      if (resolved.expired || !resolved.active) {
        clearSupportContextCookie(res, { secure: isProduction, env });
        req.platformSupportContext = {
          active: false,
          context: resolved.context || null,
          expired: Boolean(resolved.expired),
        };
        return next();
      }
      req.platformSupportContext = {
        active: true,
        context: resolved.context,
        expired: false,
        rawToken,
      };
      return next();
    } catch {
      return next();
    }
  };
}

module.exports = {
  createLoadPlatformSupportContext,
};

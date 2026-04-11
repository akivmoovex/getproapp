"use strict";

const helmet = require("helmet");
const { PLATFORM_REGION_SLUGS } = require("../tenants");

/**
 * GET /join?embed=1 is loaded in an iframe from apex / other regional hosts. Default Helmet CSP
 * uses frame-ancestors 'self' plus X-Frame-Options, which blocks cross-subdomain embed (blank iframe).
 *
 * Local dev: when BASE_DOMAIN is unset, frame-ancestors only include 'self' and
 * http://localhost:3000 / http://127.0.0.1:3000 — not other ports. Set BASE_DOMAIN for full parity.
 */
function isJoinEmbedGet(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if ((req.path || "") !== "/join") return false;
  try {
    const u = new URL(req.originalUrl || req.url || "", "http://localhost");
    const embed = u.searchParams.get("embed");
    return embed === "1" || embed === "true";
  } catch {
    return false;
  }
}

function joinEmbedFrameAncestors() {
  const scheme = (process.env.PUBLIC_SCHEME || "https").trim().toLowerCase();
  const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
  const ancestors = ["'self'"];
  if (!base) {
    ancestors.push("http://localhost:3000", "http://127.0.0.1:3000");
    return ancestors;
  }
  ancestors.push(`${scheme}://${base}`, `${scheme}://www.${base}`);
  for (const slug of PLATFORM_REGION_SLUGS) {
    ancestors.push(`${scheme}://${slug}.${base}`);
  }
  return ancestors;
}

function createJoinEmbedHelmetMiddleware() {
  const helmetJoinEmbed = helmet({
    frameguard: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        frameAncestors: joinEmbedFrameAncestors(),
      },
    },
  });

  const helmetDefault = helmet();

  return function joinEmbedHelmet(req, res, next) {
    if (isJoinEmbedGet(req)) {
      return helmetJoinEmbed(req, res, next);
    }
    return helmetDefault(req, res, next);
  };
}

module.exports = {
  isJoinEmbedGet,
  joinEmbedFrameAncestors,
  createJoinEmbedHelmetMiddleware,
};

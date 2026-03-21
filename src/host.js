function sanitizeSubdomain(input) {
  if (!input) return null;
  const cleaned = String(input).toLowerCase().trim();
  if (!cleaned) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,61}$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Public hostname for this request (no port). Prefer X-Forwarded-Host when trust proxy is on —
 * many panels send Host: 127.0.0.1:PORT to Node while the browser host is in X-Forwarded-Host.
 */
function resolveHostname(req) {
  const trust = req.app && req.app.get("trust proxy");
  const forwarded = req.headers["x-forwarded-host"];
  if (forwarded && trust) {
    const first = String(forwarded).split(",")[0].trim().split(":")[0];
    if (first) return first.toLowerCase();
  }
  const raw = (req.get("host") || "").trim();
  if (raw) return raw.split(":")[0].toLowerCase();
  return String(req.hostname || "").toLowerCase();
}

function getSubdomain(req) {
  if (req.query && req.query.subdomain) {
    return sanitizeSubdomain(req.query.subdomain);
  }

  const host = resolveHostname(req);
  if (!host || host === "localhost") return null;

  const baseDomain = (process.env.BASE_DOMAIN || "").toLowerCase().trim();
  if (!baseDomain) return null;

  if (host === baseDomain || host === `www.${baseDomain}`) return null;

  if (!host.endsWith(baseDomain)) return null;

  const prefix = host.slice(0, host.length - baseDomain.length);
  const trimmed = prefix.endsWith(".") ? prefix.slice(0, -1) : prefix;
  if (!trimmed) return null;

  return sanitizeSubdomain(trimmed.split(".")[0]);
}

module.exports = { getSubdomain, resolveHostname };

function sanitizeSubdomain(input) {
  if (!input) return null;
  const cleaned = String(input).toLowerCase().trim();
  if (!cleaned) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,61}$/.test(cleaned)) return null;
  return cleaned;
}

function getSubdomain(req) {
  // Local development fallback: /?subdomain=mybiz
  if (req.query && req.query.subdomain) {
    return sanitizeSubdomain(req.query.subdomain);
  }

  const host = (req.hostname || "").toLowerCase();
  if (!host || host === "localhost") return null;

  const baseDomain = (process.env.BASE_DOMAIN || "").toLowerCase();
  if (!baseDomain) return null;

  if (host === baseDomain || host === `www.${baseDomain}`) return null;

  if (!host.endsWith(baseDomain)) return null;

  // Example: "mybiz.getproapp.org" => "mybiz"
  const prefix = host.slice(0, host.length - baseDomain.length);
  const trimmed = prefix.endsWith(".") ? prefix.slice(0, -1) : prefix;
  if (!trimmed) return null;

  return sanitizeSubdomain(trimmed.split(".")[0]);
}

module.exports = { getSubdomain };


"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");

const certDir = process.env.BB_TLS_CERT_DIR;
const allowedHosts = new Set(
  String(process.env.BB_TLS_ALLOWED_HOSTS || "local.test,admin.local.test")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const upstreamPort = Number(process.env.BB_HTTP_UPSTREAM_PORT || 4185);
const bindHost = "127.0.0.1";
const bindPort = 443;

function isAllowedHost(rawHost) {
  const value = String(rawHost || "");
  if (/[^\x21-\x7e]/.test(value) || value.includes("@") || value.includes(":")) return false;
  const host = value.toLowerCase();
  if (allowedHosts.has(host)) return true;
  const labels = host.split(".");
  return labels.length === 3 && labels[0].length > 0 && /^[a-z0-9-]+$/.test(labels[0]) &&
    labels[1] === "local" && labels[2] === "test";
}

if (require.main === module) {
if (!certDir) throw new Error("BB_TLS_CERT_DIR is required");
const key = fs.readFileSync(`${certDir}/local.test.key`);
const cert = fs.readFileSync(`${certDir}/local.test.crt`);
const server = https.createServer({ key, cert }, (request, response) => {
  const rawHost = String(request.headers.host || "");
  const host = rawHost.toLowerCase();
  if (!isAllowedHost(rawHost)) {
    response.writeHead(421, { "content-type": "text/plain" });
    response.end("Unrecognized CI testing host");
    return;
  }

  const headers = { ...request.headers, host };
  delete headers["x-forwarded-host"];
  delete headers["x-forwarded-proto"];
  headers["x-forwarded-host"] = host;
  headers["x-forwarded-proto"] = "https";
  const upstream = http.request(
    {
      host: bindHost,
      port: upstreamPort,
      method: request.method,
      path: request.url,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    }
  );
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502);
    response.end("CI upstream unavailable");
  });
  request.pipe(upstream);
});

server.on("tlsClientError", (error) => {
  process.stderr.write(`[local-tls-proxy] TLS client error: ${error.code || error.message}\n`);
});
server.listen(bindPort, bindHost, () => {
  process.stdout.write(`[local-tls-proxy] listening on https://${bindHost}:${bindPort}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
}

module.exports = { isAllowedHost };

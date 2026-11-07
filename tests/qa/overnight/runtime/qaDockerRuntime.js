"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const QA_ROOT = path.resolve(__dirname, "../..");
const EXPECTED_SHA = "1c79bd77bd76a968fe69aff678e0380e2a5be463";
const EXPECTED_TREE = "2ab57811f443dfe32e04b95a48b0c7567b1b6815";

function loadVerifiedManifest(file) {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!value || typeof value !== "object") throw new Error(`invalid manifest: ${file}`);
  return value;
}

function verifySourceIdentity(manifest) {
  if (manifest.source_sha !== EXPECTED_SHA && manifest.sourceSha !== EXPECTED_SHA) throw new Error("source SHA mismatch");
  if (manifest.source_tree && manifest.source_tree !== EXPECTED_TREE) throw new Error("source tree mismatch");
  return true;
}

function verifyPersistentDatabase(manifest, dockerInspect) {
  const db = manifest.database || {};
  const actual = dockerInspect(db.container);
  if (!actual || actual.Id !== db.container_id) throw new Error("persistent database container mismatch");
  if (actual.Config && actual.Config.Env && actual.Config.Env.some((x) => /DATABASE_URL|POSTGRES_PASSWORD/i.test(x))) {
    throw new Error("database inspection exposed forbidden credential material");
  }
  return { name: db.name, container: db.container, containerId: actual.Id };
}

function verifyDockerNetwork(manifest, networks) {
  const expected = manifest.database && manifest.database.network;
  if (!expected || !networks.includes(expected)) throw new Error("approved Docker network mismatch");
  return expected;
}

function loadProtectedCredentials(file, stat = fs.statSync) {
  const s = stat(file);
  if ((s.mode & 0o077) !== 0) throw new Error("credential file permissions are unsafe");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function verifyLocalRunnerImage(image, images) {
  if (!images.includes(image)) throw new Error(`approved local image unavailable: ${image}`);
  return image;
}

function docker(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { cwd: options.cwd || QA_ROOT, env: options.env || process.env });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (x) => { stdout += x; });
    child.stderr.on("data", (x) => { stderr += x; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || `docker exit ${code}`)));
  });
}

async function startQaApplication(spec, runId, exec = docker) {
  if (!spec.image || !spec.network || !spec.command) throw new Error("application startup contract is incomplete");
  const name = `qa-${spec.product}-app-${runId}`;
  await exec(["run", "-d", "--name", name, "--network", spec.network, "--label", `qa.owner=${runId}`, "--label", `qa.source=${EXPECTED_SHA}`, "--label", `qa.product=${spec.product}`, spec.image, ...spec.command]);
  return { name, product: spec.product, network: spec.network, runId };
}

async function startQaBrowserRunner(spec, runId, exec = docker) {
  if (!spec.image || !spec.network || !spec.command) throw new Error("browser startup contract is incomplete");
  const name = `qa-${spec.product}-browser-${runId}`;
  await exec(["run", "-d", "--name", name, "--network", spec.network, "--label", `qa.owner=${runId}`, "--label", `qa.source=${EXPECTED_SHA}`, "--label", `qa.product=${spec.product}`, spec.image, ...spec.command]);
  return { name, product: spec.product, network: spec.network, runId };
}

async function waitForHealth(url, fetchImpl = fetch, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const response = await fetchImpl(url); if (response.status === 200) return true; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`health timeout: ${url}`);
}

async function verifyInternalHostname(host, expectedAddress, lookup = require("dns").promises.lookup) {
  const result = await lookup(host);
  if (result.address !== expectedAddress) throw new Error(`hostname mapping mismatch: ${host}`);
  return true;
}

async function stopOwnedResources(resources, exec = docker) {
  for (const resource of resources || []) {
    if (resource.runId && resource.name) await exec(["rm", "-f", resource.name]);
  }
}

module.exports = {
  loadVerifiedManifest, verifySourceIdentity, verifyPersistentDatabase,
  verifyDockerNetwork, loadProtectedCredentials, verifyLocalRunnerImage,
  startQaApplication, startQaBrowserRunner, waitForHealth,
  verifyInternalHostname, stopOwnedResources,
};

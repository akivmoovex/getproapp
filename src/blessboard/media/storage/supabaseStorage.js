"use strict";

/**
 * Supabase Storage adapter via REST (service role). Never used unless env credentials exist.
 * Does not run against hosted Supabase from tests — factory selects local instead.
 */

const { isSafeStorageKey } = require("../generateStorageKey");

/**
 * @param {{
 *   supabaseUrl: string,
 *   serviceRoleKey: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
function createSupabaseStorage(opts) {
  const baseUrl = String(opts.supabaseUrl || "")
    .trim()
    .replace(/\/$/, "");
  const serviceRoleKey = String(opts.serviceRoleKey || "").trim();
  const fetchImpl = opts.fetchImpl || globalThis.fetch;

  if (!baseUrl || !serviceRoleKey) {
    throw new Error("supabase_storage_credentials_required");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch_unavailable");
  }

  function objectUrl(bucket, storageKey) {
    if (!isSafeStorageKey(storageKey)) {
      const err = new Error("unsafe_storage_key");
      err.code = "UNSAFE_KEY";
      throw err;
    }
    const encodedKey = storageKey
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    return `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey}`;
  }

  function authHeaders(extra) {
    return {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      ...(extra || {}),
    };
  }

  return {
    kind: "supabase",

    /**
     * @param {{ bucket: string, storageKey: string, buffer: Buffer, contentType: string }} input
     */
    async upload(input) {
      const bucket = String(input.bucket || "");
      const storageKey = String(input.storageKey || "");
      const url = objectUrl(bucket, storageKey);
      const res = await fetchImpl(url, {
        method: "POST",
        headers: authHeaders({
          "Content-Type": String(input.contentType || "application/octet-stream"),
          "x-upsert": "false",
        }),
        body: input.buffer,
      });
      if (res.status === 409 || res.status === 400) {
        const text = await res.text().catch(() => "");
        if (/already exists|Duplicate|409/i.test(text) || res.status === 409) {
          const conflict = new Error("key_exists");
          conflict.code = "KEY_EXISTS";
          throw conflict;
        }
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`supabase_upload_failed:${res.status}:${text.slice(0, 200)}`);
        err.code = "UPLOAD_FAILED";
        throw err;
      }
      return { bucket, storageKey };
    },

    /**
     * @param {{ bucket: string, storageKey: string }} input
     */
    async delete(input) {
      const bucket = String(input.bucket || "");
      const storageKey = String(input.storageKey || "");
      const url = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`;
      const res = await fetchImpl(url, {
        method: "DELETE",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prefixes: [storageKey] }),
      });
      if (!res.ok && res.status !== 404) {
        const text = await res.text().catch(() => "");
        const err = new Error(`supabase_delete_failed:${res.status}:${text.slice(0, 200)}`);
        err.code = "DELETE_FAILED";
        throw err;
      }
    },

    /**
     * Prefer app-mediated delivery; public CDN URL available when bucket is public.
     * @param {{ bucket: string, storageKey: string }} input
     */
    resolvePublicUrl(input) {
      const bucket = String(input.bucket || "");
      const storageKey = String(input.storageKey || "");
      if (!isSafeStorageKey(storageKey)) return null;
      const encodedKey = storageKey
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
      return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedKey}`;
    },

    /**
     * @param {{ bucket: string, storageKey: string, expiresInSeconds?: number }} input
     */
    async resolveSignedUrl(input) {
      const bucket = String(input.bucket || "");
      const storageKey = String(input.storageKey || "");
      const expiresIn = Number(input.expiresInSeconds) > 0 ? Number(input.expiresInSeconds) : 3600;
      if (!isSafeStorageKey(storageKey)) return null;
      const url = `${baseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${storageKey
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/")}`;
      const res = await fetchImpl(url, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ expiresIn }),
      });
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      const signed = body && (body.signedURL || body.signedUrl);
      if (!signed) return null;
      if (String(signed).startsWith("http")) return String(signed);
      return `${baseUrl}/storage/v1${String(signed).startsWith("/") ? "" : "/"}${signed}`;
    },

    async read() {
      const err = new Error("supabase_read_via_signed_url_only");
      err.code = "NOT_SUPPORTED";
      throw err;
    },
  };
}

module.exports = {
  createSupabaseStorage,
};

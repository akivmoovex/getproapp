"use strict";

/**
 * Shared CMS media-folder HTTP helpers (PC11).
 *
 * Platform owns folder notice copy + redirect query shaping over
 * mediaFoldersService. Product routes retain auth gates, CSRF, tenant
 * resolve, and media base paths.
 */

const mediaFoldersService = require("../mediaFoldersService");

/**
 * Map a shared media-folder result / success code to admin-facing copy.
 * @param {unknown} code
 * @returns {string|null}
 */
function folderNoticeMessage(code) {
  const key = String(code || "").trim();
  if (!key) return null;
  const messages = {
    folder_created: "Folder created.",
    folder_renamed: "Folder renamed.",
    folder_deleted: "Folder deleted. Its files moved to Unfiled.",
    media_moved: "File moved.",
    [mediaFoldersService.RESULT.NAME_TAKEN]: "A folder with that name already exists.",
    [mediaFoldersService.RESULT.INVALID_INPUT]: "Enter a folder name of up to 80 characters.",
    [mediaFoldersService.RESULT.FOLDER_NOT_FOUND]: "That folder no longer exists.",
    [mediaFoldersService.RESULT.MEDIA_NOT_FOUND]: "That file no longer exists.",
    [mediaFoldersService.RESULT.LIMIT_REACHED]: "You have reached the folder limit.",
    [mediaFoldersService.RESULT.TENANT_MISMATCH]: "That folder is not available.",
  };
  return messages[key] || null;
}

/**
 * 303 redirect back to the product media library with optional folder + notice.
 * @param {import('express').Response} res
 * @param {{ mediaPath: string, code?: string|null, folderId?: string|null }} opts
 */
function folderRedirect(res, opts) {
  const mediaPath = String((opts && opts.mediaPath) || "").replace(/\?.*$/, "");
  const params = [];
  const folderId = opts && opts.folderId != null && String(opts.folderId).trim()
    ? String(opts.folderId).trim()
    : "";
  const code = opts && opts.code != null && String(opts.code).trim()
    ? String(opts.code).trim()
    : "";
  if (folderId) params.push(`folder=${encodeURIComponent(folderId)}`);
  if (code) params.push(`folderNotice=${encodeURIComponent(code)}`);
  const query = params.length ? `?${params.join("&")}` : "";
  return res.redirect(303, `${mediaPath}${query}`);
}

module.exports = {
  folderNoticeMessage,
  folderRedirect,
};

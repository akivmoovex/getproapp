"use strict";

const ENTITY_TYPES = ["organization", "branch", "hq_admin", "branch_admin", "member", "ministry_leader"];

const MIN_NOTE_LENGTH = 3;
const MAX_NOTE_LENGTH = 2000;

function parseSafeReturnTo(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, returnTo: null };
  if (!raw.startsWith("/admin/church") || raw.includes("//") || raw.includes("..")) {
    return { ok: false, returnTo: null, error: "Invalid return path." };
  }
  return { ok: true, returnTo: raw.slice(0, 500), error: null };
}

function validateCreateSupportNoteBody(body) {
  const entityType = String((body && body.entity_type) || "")
    .trim()
    .toLowerCase();
  const entityId = Number(body && body.entity_id);
  const noteBody = String((body && body.note_body) || "").trim();
  const returnParsed = parseSafeReturnTo(body && body.return_to);

  const errors = [];

  if (!ENTITY_TYPES.includes(entityType)) {
    errors.push("Invalid entity type.");
  }
  if (!Number.isFinite(entityId) || entityId <= 0) {
    errors.push("Invalid entity ID.");
  }
  if (noteBody.length < MIN_NOTE_LENGTH) {
    errors.push(`Note must be at least ${MIN_NOTE_LENGTH} characters.`);
  }
  if (noteBody.length > MAX_NOTE_LENGTH) {
    errors.push(`Note must be at most ${MAX_NOTE_LENGTH} characters.`);
  }
  if (!returnParsed.ok) {
    errors.push(returnParsed.error);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      data: {
        entity_type: entityType,
        entity_id: entityId,
        note_body: noteBody,
        return_to: returnParsed.returnTo,
      },
    };
  }

  return {
    ok: true,
    errors: [],
    data: {
      entity_type: entityType,
      entity_id: entityId,
      note_body: noteBody,
      return_to: returnParsed.returnTo,
    },
  };
}

function notePreview(text, maxLen = 80) {
  const raw = String(text || "").trim();
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}…`;
}

module.exports = {
  ENTITY_TYPES,
  MIN_NOTE_LENGTH,
  MAX_NOTE_LENGTH,
  parseSafeReturnTo,
  validateCreateSupportNoteBody,
  notePreview,
};

/**
 * Parse SQLite / ISO-ish timestamps for display relative to "now" (server render time).
 * @param {string|Date|null|undefined} raw
 * @param {Date} [now]
 * @returns {{ relative: string, exact: string }}
 */
function eventTimeParts(raw, now = new Date()) {
  const date = parseEventDate(raw);
  if (!date) {
    const s = raw == null ? "" : String(raw).trim();
    return { relative: s || "—", exact: s || "—" };
  }
  return {
    relative: formatRelativeAgo(date, now),
    exact: formatExactLocal(date),
  };
}

function parseEventDate(raw) {
  if (raw == null) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const t = String(raw).trim();
  if (!t) return null;
  if (t.includes("T")) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatRelativeAgo(date, now) {
  const ms = now - date;
  const secTotal = Math.floor(Math.abs(ms) / 1000);
  if (ms < 0) {
    return formatExactLocal(date);
  }
  if (secTotal < 45) return "Just now";
  const min = Math.floor(secTotal / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const approxMonth = Math.floor(day / 30);
  if (approxMonth < 12) return `${approxMonth} month${approxMonth === 1 ? "" : "s"} ago`;
  const yr = Math.floor(day / 365);
  return `${yr} year${yr === 1 ? "" : "s"} ago`;
}

function formatExactLocal(date) {
  try {
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(date);
  }
}

module.exports = { eventTimeParts, parseEventDate };

"use strict";

function validatePublicContactBody(body) {
  const fullName = String(body?.full_name || body?.contact_name || "").trim();
  const email = String(body?.email || body?.contact_email || "").trim();
  const phone = String(body?.phone || body?.contact_phone || "").trim();
  const message = String(body?.message || body?.contact_message || "").trim();

  if (!fullName) {
    return { ok: false, error: "Please enter your name." };
  }
  if (!email && !phone) {
    return { ok: false, error: "Please enter an email address or phone number." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (message.length < 10) {
    return { ok: false, error: "Please enter a message of at least 10 characters." };
  }
  if (message.length > 5000) {
    return { ok: false, error: "Message is too long." };
  }

  return {
    ok: true,
    data: {
      full_name: fullName.slice(0, 200),
      email: email.slice(0, 200) || null,
      phone: phone.slice(0, 50) || null,
      message: message.slice(0, 5000),
    },
  };
}

const CONTACT_STATUS_OPTIONS = ["new", "read", "resolved"];

function validateContactStatusUpdate(body) {
  const status = String(body?.status || "").trim().toLowerCase();
  if (!CONTACT_STATUS_OPTIONS.includes(status)) {
    return { ok: false, error: "Invalid status." };
  }
  return { ok: true, status };
}

function contactStatusLabel(status) {
  const map = { new: "New", read: "Read", resolved: "Resolved" };
  return map[String(status || "").toLowerCase()] || status;
}

module.exports = {
  validatePublicContactBody,
  validateContactStatusUpdate,
  contactStatusLabel,
  CONTACT_STATUS_OPTIONS,
};

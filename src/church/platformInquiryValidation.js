"use strict";

const INQUIRY_TYPES = ["contact", "register_church"];
const INQUIRY_STATUS_OPTIONS = ["new", "contacted", "closed"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trim(value, max) {
  return String(value || "").trim().slice(0, max);
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function isHoneypotTriggered(body) {
  return Boolean(trim(body?.company_website || body?._gotcha, 200));
}

function validateEmailField(email, { required = false } = {}) {
  const value = trim(email, 200);
  if (!value) {
    return required ? { ok: false, error: "Please enter your email address." } : { ok: true, value: null };
  }
  if (!EMAIL_RE.test(value)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  return { ok: true, value };
}

function validatePhoneField(phone, { required = false, label = "phone number" } = {}) {
  const value = trim(phone, 50);
  if (!value) {
    return required ? { ok: false, error: `Please enter a ${label}.` } : { ok: true, value: null };
  }
  const digits = digitsOnly(value);
  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, error: `Please enter a valid ${label}.` };
  }
  return { ok: true, value };
}

function validatePlatformContactInquiry(body) {
  if (isHoneypotTriggered(body)) {
    return { ok: true, honeypot: true, data: null };
  }

  const fullName = trim(body?.full_name || body?.name, 200);
  const subject = trim(body?.subject, 200);
  const message = trim(body?.message, 5000);

  if (!fullName) {
    return { ok: false, error: "Please enter your name.", field: "full_name" };
  }
  const emailResult = validateEmailField(body?.email, { required: true });
  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error, field: "email" };
  }
  const phoneResult = validatePhoneField(body?.phone, { required: false });
  if (!phoneResult.ok) {
    return { ok: false, error: phoneResult.error, field: "phone" };
  }
  if (!subject) {
    return { ok: false, error: "Please enter a subject.", field: "subject" };
  }
  if (message.length < 10) {
    return { ok: false, error: "Please enter a message of at least 10 characters.", field: "message" };
  }

  return {
    ok: true,
    data: {
      inquiry_type: "contact",
      full_name: fullName,
      email: emailResult.value,
      phone: phoneResult.value,
      subject,
      message,
      consent_contact: true,
    },
  };
}

function validatePlatformRegisterChurchInquiry(body) {
  if (isHoneypotTriggered(body)) {
    return { ok: true, honeypot: true, data: null };
  }

  const churchName = trim(body?.church_name, 200);
  const branchName = trim(body?.branch_name, 200) || null;
  const city = trim(body?.city, 120);
  const country = trim(body?.country, 120);
  const fullName = trim(body?.contact_name || body?.full_name, 200);
  const roleInChurch = trim(body?.role_in_church, 120);
  const branchCount = trim(body?.branch_count, 20) || null;
  const message = trim(body?.message, 5000);

  if (!churchName) {
    return { ok: false, error: "Please enter your church name.", field: "church_name" };
  }
  if (!city) {
    return { ok: false, error: "Please enter a town or city.", field: "city" };
  }
  if (!country) {
    return { ok: false, error: "Please enter a country.", field: "country" };
  }
  if (!fullName) {
    return { ok: false, error: "Please enter the contact person name.", field: "contact_name" };
  }
  if (!roleInChurch) {
    return { ok: false, error: "Please enter your role in the church.", field: "role_in_church" };
  }

  const emailResult = validateEmailField(body?.email, { required: true });
  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error, field: "email" };
  }
  const phoneResult = validatePhoneField(body?.phone, { required: true, label: "phone number" });
  if (!phoneResult.ok) {
    return { ok: false, error: phoneResult.error, field: "phone" };
  }
  const whatsappResult = validatePhoneField(body?.whatsapp, { required: false, label: "WhatsApp number" });
  if (!whatsappResult.ok) {
    return { ok: false, error: whatsappResult.error, field: "whatsapp" };
  }
  if (branchCount && !/^\d{1,3}$/.test(branchCount)) {
    return { ok: false, error: "Number of branches must be a whole number up to 999.", field: "branch_count" };
  }
  if (message.length < 10) {
    return { ok: false, error: "Please enter a short message of at least 10 characters.", field: "message" };
  }
  const consent = body?.consent_contact === "on" || body?.consent_contact === "1" || body?.consent_contact === true;
  if (!consent) {
    return { ok: false, error: "Please confirm that BlessBoard may contact you about this request.", field: "consent_contact" };
  }

  return {
    ok: true,
    data: {
      inquiry_type: "register_church",
      church_name: churchName,
      branch_name: branchName,
      city,
      country,
      full_name: fullName,
      role_in_church: roleInChurch,
      phone: phoneResult.value,
      whatsapp: whatsappResult.value,
      email: emailResult.value,
      branch_count: branchCount,
      message,
      consent_contact: true,
    },
  };
}

function validatePlatformInquiryStatusUpdate(body) {
  const status = trim(body?.status, 20).toLowerCase();
  if (!INQUIRY_STATUS_OPTIONS.includes(status)) {
    return { ok: false, error: "Invalid status." };
  }
  return { ok: true, status };
}

function inquiryStatusLabel(status) {
  const map = { new: "New", contacted: "Contacted", closed: "Closed" };
  return map[String(status || "").toLowerCase()] || status;
}

function inquiryTypeLabel(type) {
  const map = { contact: "Contact", register_church: "Church access request" };
  return map[String(type || "").toLowerCase()] || type;
}

function contactFormFromBody(body) {
  return {
    full_name: trim(body?.full_name || body?.name, 200),
    email: trim(body?.email, 200),
    phone: trim(body?.phone, 50),
    subject: trim(body?.subject, 200),
    message: trim(body?.message, 5000),
  };
}

function registerChurchFormFromBody(body) {
  return {
    church_name: trim(body?.church_name, 200),
    branch_name: trim(body?.branch_name, 200),
    city: trim(body?.city, 120),
    country: trim(body?.country, 120),
    contact_name: trim(body?.contact_name || body?.full_name, 200),
    role_in_church: trim(body?.role_in_church, 120),
    phone: trim(body?.phone, 50),
    whatsapp: trim(body?.whatsapp, 50),
    email: trim(body?.email, 200),
    branch_count: trim(body?.branch_count, 20),
    message: trim(body?.message, 5000),
    consent_contact: body?.consent_contact === "on" || body?.consent_contact === "1" || body?.consent_contact === true,
  };
}

module.exports = {
  INQUIRY_TYPES,
  INQUIRY_STATUS_OPTIONS,
  isHoneypotTriggered,
  validatePlatformContactInquiry,
  validatePlatformRegisterChurchInquiry,
  validatePlatformInquiryStatusUpdate,
  inquiryStatusLabel,
  inquiryTypeLabel,
  contactFormFromBody,
  registerChurchFormFromBody,
};

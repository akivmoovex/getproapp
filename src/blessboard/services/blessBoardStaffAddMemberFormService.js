"use strict";

/**
 * Staff Add Member form presentation + submission (V2.04 BB-M02).
 * Keeps business rules out of EJS; HTTP routes call these helpers.
 */

const {
  createStaffManagedMember,
  RESULT,
} = require("./blessBoardMemberDomainService");
const {
  MEMBERSHIP_STATUS,
  PORTAL_ACCESS_STATUS,
  MARITAL_STATUS,
} = require("./memberDomainConstants");
const {
  normalizePersonPhone,
  normalizePersonEmail,
  normalizePersonDateOfBirth,
} = require("../../platform/person/personNormalization");
const {
  resolveBlessBoardFormPhone,
} = require("./resolveBlessBoardFormPhone");
const memberRepo = require("../repositories/memberIdentityRepository");

const FORM_CODE = Object.freeze({
  OK: "ok",
  VALIDATION: "validation_failed",
  UNAUTHORIZED: "unauthorized",
  DUPLICATE: "duplicate_blocked",
  FAILED: "create_failed",
});

const GENDER_OPTIONS = Object.freeze(["female", "male", "other", "prefer_not_to_say"]);
const RELATIONSHIP_OPTIONS = Object.freeze([
  "spouse",
  "parent",
  "sibling",
  "guardian",
  "child",
  "other",
]);

const INITIAL_MEMBERSHIP_OPTIONS = Object.freeze([
  { value: MEMBERSHIP_STATUS.ACTIVE, label: "Active Member" },
  { value: MEMBERSHIP_STATUS.PENDING, label: "Probationary Member" },
  { value: MEMBERSHIP_STATUS.TRANSFERRED, label: "Transferred In" },
]);

function emptyValues() {
  return {
    fullName: "",
    preferredName: "",
    gender: "",
    dateOfBirth: "",
    phone: "",
    phoneCountry: "",
    phoneNational: "",
    email: "",
    addressLine1: "",
    branchId: "",
    membershipStatus: MEMBERSHIP_STATUS.ACTIVE,
    baptismWater: false,
    baptismSpirit: false,
    occupation: "",
    maritalStatus: "",
    numberOfChildren: "",
    nextOfKinName: "",
    nextOfKinRelationship: "",
    nextOfKinPhone: "",
  };
}

/**
 * Build read-only form model for GET /members/new.
 */
async function buildAddMemberFormModel(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const defaultBranchId = String((input && input.defaultBranchId) || "").trim();
  const preview = await memberRepo.allocateNextChurchId(db, { churchId });
  return {
    ok: true,
    churchIdPreview:
      preview && preview.ok
        ? preview.memberNumber
        : "Assigned on save",
    portalAccessStatus: PORTAL_ACCESS_STATUS.NOT_ACTIVATED,
    membershipOptions: INITIAL_MEMBERSHIP_OPTIONS,
    genderOptions: GENDER_OPTIONS,
    maritalOptions: MARITAL_STATUS,
    relationshipOptions: RELATIONSHIP_OPTIONS,
    values: {
      ...emptyValues(),
      branchId: defaultBranchId,
      ...(input && input.values ? input.values : {}),
    },
    errors: (input && input.errors) || {},
    fieldErrors: (input && input.fieldErrors) || [],
    matches: (input && input.matches) || [],
  };
}

function splitFullName(fullName) {
  const raw = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!raw) return { firstName: "", lastName: "" };
  const parts = raw.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function mapMembershipStatus(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "probationary" || value === "probationary_member") {
    return MEMBERSHIP_STATUS.PENDING;
  }
  if (value === "transferred_in" || value === "transferred") {
    return MEMBERSHIP_STATUS.TRANSFERRED;
  }
  if (value === MEMBERSHIP_STATUS.PENDING) return MEMBERSHIP_STATUS.PENDING;
  if (value === MEMBERSHIP_STATUS.TRANSFERRED) return MEMBERSHIP_STATUS.TRANSFERRED;
  return MEMBERSHIP_STATUS.ACTIVE;
}

/**
 * Parse + validate POST body. Returns values + field errors (no DB writes).
 */
function parseAddMemberFormBody(body) {
  const raw = body && typeof body === "object" ? body : {};
  const values = {
    ...emptyValues(),
    fullName: String(raw.full_name || raw.fullName || "").trim(),
    preferredName: String(raw.preferred_name || raw.preferredName || "").trim(),
    gender: String(raw.gender || "").trim().toLowerCase(),
    dateOfBirth: String(raw.date_of_birth || raw.dateOfBirth || "").trim(),
    phone: String(raw.phone || raw.phone_e164 || "").trim(),
    phoneCountry: String(raw.phone_country || raw.phoneCountry || "").trim(),
    phoneNational: String(raw.phone_national || raw.phoneNational || "").trim(),
    email: String(raw.email || "").trim(),
    addressLine1: String(raw.address_line_1 || raw.addressLine1 || "").trim(),
    branchId: String(raw.branch_id || raw.branchId || "").trim(),
    membershipStatus: mapMembershipStatus(
      raw.membership_status || raw.membershipStatus
    ),
    baptismWater:
      raw.baptism_water === "1" ||
      raw.baptism_water === "on" ||
      raw.baptismWater === true,
    baptismSpirit:
      raw.baptism_spirit === "1" ||
      raw.baptism_spirit === "on" ||
      raw.baptismSpirit === true,
    occupation: String(raw.occupation || "").trim(),
    maritalStatus: String(raw.marital_status || raw.maritalStatus || "")
      .trim()
      .toLowerCase(),
    numberOfChildren: String(raw.number_of_children || raw.numberOfChildren || "").trim(),
    nextOfKinName: String(raw.next_of_kin_name || raw.nextOfKinName || "").trim(),
    nextOfKinRelationship: String(
      raw.next_of_kin_relationship || raw.nextOfKinRelationship || ""
    )
      .trim()
      .toLowerCase(),
    nextOfKinPhone: String(
      raw.next_of_kin_phone || raw.nextOfKinPhone || ""
    ).trim(),
  };

  const fieldErrors = [];
  const { firstName, lastName } = splitFullName(values.fullName);
  if (!values.fullName || values.fullName.length < 2) {
    fieldErrors.push({ field: "full_name", message: "Full legal name is required." });
  }
  if (!values.gender || !GENDER_OPTIONS.includes(values.gender)) {
    fieldErrors.push({ field: "gender", message: "Select a gender." });
  }
  const dob = normalizePersonDateOfBirth(values.dateOfBirth);
  if (!dob.ok) {
    fieldErrors.push({ field: "date_of_birth", message: "Enter a valid date of birth." });
  }
  const phoneResolved = resolveBlessBoardFormPhone(raw, {
    required: true,
    allowLegacyPhone: true,
  });
  const phoneOk = Boolean(phoneResolved && phoneResolved.result && phoneResolved.result.ok);
  if (!phoneOk) {
    fieldErrors.push({
      field: "phone",
      message: "Enter a valid primary phone number.",
    });
  } else {
    values.phone = phoneResolved.result.normalized || phoneResolved.e164 || values.phone;
    values.phoneCountry = phoneResolved.fields.phoneCountry || values.phoneCountry;
    values.phoneNational = phoneResolved.fields.phoneNational || values.phoneNational;
  }
  let emailNorm = null;
  let emailDisplay = null;
  if (values.email) {
    const email = normalizePersonEmail(values.email);
    if (!email.ok) {
      fieldErrors.push({ field: "email", message: "Enter a valid email or leave blank." });
    } else {
      emailNorm = email.normalized;
      emailDisplay = email.display;
    }
  }
  if (!values.addressLine1) {
    fieldErrors.push({ field: "address_line_1", message: "Residential address is required." });
  }
  if (!values.branchId) {
    fieldErrors.push({ field: "branch_id", message: "Assigned branch is required." });
  }
  if (!values.maritalStatus || !MARITAL_STATUS.includes(values.maritalStatus)) {
    fieldErrors.push({ field: "marital_status", message: "Select a marital status." });
  }
  if (!values.nextOfKinName) {
    fieldErrors.push({ field: "next_of_kin_name", message: "Emergency contact name is required." });
  }
  if (
    !values.nextOfKinRelationship ||
    !RELATIONSHIP_OPTIONS.includes(values.nextOfKinRelationship)
  ) {
    fieldErrors.push({
      field: "next_of_kin_relationship",
      message: "Select an emergency relationship.",
    });
  }
  const kinPhone = normalizePersonPhone({ phone: values.nextOfKinPhone });
  if (!kinPhone.ok) {
    fieldErrors.push({
      field: "next_of_kin_phone",
      message: "Enter a valid emergency phone.",
    });
  }

  let numberOfChildren = null;
  if (values.numberOfChildren !== "") {
    const n = Number(values.numberOfChildren);
    if (!Number.isInteger(n) || n < 0 || n > 50) {
      fieldErrors.push({
        field: "number_of_children",
        message: "Number of children must be between 0 and 50.",
      });
    } else {
      numberOfChildren = n;
    }
  }

  return {
    ok: fieldErrors.length === 0,
    code: fieldErrors.length ? FORM_CODE.VALIDATION : FORM_CODE.OK,
    values,
    fieldErrors,
    demographics: {
      firstName,
      lastName,
      preferredName: values.preferredName || null,
      phoneNormalized: phoneOk ? phoneResolved.result.normalized : null,
      phoneDisplay: phoneOk ? phoneResolved.result.display : values.phone,
      emailNormalized: emailNorm,
      emailDisplay,
      dateOfBirth: dob.ok ? dob.dateOfBirth : null,
    },
    profile: {
      dateOfBirth: dob.ok ? dob.dateOfBirth : null,
      occupation: values.occupation || null,
      maritalStatus: values.maritalStatus || null,
      numberOfChildren,
      address: {
        line1: values.addressLine1,
        line2: null,
        city: null,
        district: null,
        province: null,
        countryCode: null,
        postalCode: null,
      },
      nextOfKin: {
        name: values.nextOfKinName,
        relationship: values.nextOfKinRelationship,
        phoneDisplay: kinPhone.ok ? kinPhone.display : values.nextOfKinPhone,
        phoneNormalized: kinPhone.ok ? kinPhone.normalized : null,
      },
    },
    membershipStatus: values.membershipStatus,
    branchId: values.branchId,
    // Collected for Stitch parity; not persisted until schema exists.
    presentationOnly: {
      gender: values.gender,
      baptismWater: values.baptismWater,
      baptismSpirit: values.baptismSpirit,
    },
  };
}

/**
 * Authorize + create member from a parsed form payload.
 */
async function submitStaffAddMember(db, input, deps) {
  const parsed =
    input && input.parsed
      ? input.parsed
      : parseAddMemberFormBody(input && input.body);
  if (!parsed.ok) {
    return {
      ok: false,
      code: FORM_CODE.VALIDATION,
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }

  const created = await createStaffManagedMember(
    db,
    {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: parsed.branchId,
      membershipStatus: parsed.membershipStatus,
      demographics: parsed.demographics,
      profile: parsed.profile,
      source: "staff_add_member_ui",
      selfCreate: false,
      duplicateOverride: input.duplicateOverride === true,
      duplicateOverrideReason: input.duplicateOverrideReason || null,
      reusePersonId: input.reusePersonId || null,
    },
    deps
  );

  if (!created.ok) {
    if (created.code === RESULT.UNAUTHORIZED) {
      return { ok: false, code: FORM_CODE.UNAUTHORIZED, detail: created };
    }
    if (
      created.code === RESULT.DUPLICATE_CHURCH_ID ||
      (created.matches && created.matches.length)
    ) {
      return {
        ok: false,
        code: FORM_CODE.DUPLICATE,
        matches: created.matches || [],
        values: parsed.values,
        detail: created,
      };
    }
    return {
      ok: false,
      code: FORM_CODE.FAILED,
      values: parsed.values,
      fieldErrors: [
        {
          field: "_form",
          message: "Unable to create this membership. Check the details and try again.",
        },
      ],
      detail: created,
    };
  }

  return {
    ok: true,
    code: FORM_CODE.OK,
    memberId: created.memberId,
    productIdentifier: created.productIdentifier,
    membershipStatus: created.membershipStatus,
    portalAccessStatus: created.portalAccessStatus,
    created,
  };
}

module.exports = {
  FORM_CODE,
  GENDER_OPTIONS,
  RELATIONSHIP_OPTIONS,
  INITIAL_MEMBERSHIP_OPTIONS,
  buildAddMemberFormModel,
  parseAddMemberFormBody,
  submitStaffAddMember,
  emptyValues,
  splitFullName,
  mapMembershipStatus,
};

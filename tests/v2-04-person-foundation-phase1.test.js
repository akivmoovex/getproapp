"use strict";

/**
 * V2.04 Phase 1 — platform person foundation contracts.
 * Unit tests only: no Stitch UI, no product record migration, no production DB.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  PERSON_RELATIONSHIP_KEY,
  PERSON_CONTACT_ROLE,
  PERSON_FORBIDDEN_FIELDS,
  normalizePersonName,
  normalizePersonEmail,
  normalizePersonPhone,
  normalizePersonDateOfBirth,
  normalizePersonDemographics,
  normalizePersonAddress,
  normalizeRelatedContact,
  rejectForbiddenPersonFields,
  assertTrustedPersonScope,
  assertProductCode,
  projectPersonDraftFromBlessBoardMember,
  projectPersonDraftFromActiveClinicPatient,
  projectRelatedContactsFromEmergencyContacts,
  createPerson,
  linkPersonProductRelationship,
  setVerificationState,
  addPersonAddress,
  addRelatedContact,
  RESULT,
} = require("../src/platform/person");

const {
  SHARED_AUDIT_ACTION,
  SHARED_AUDIT_ENTITY,
} = require("../src/platform/audit");

const {
  registerPersonProductAdapter,
  getPersonProductAdapter,
  clearProductRuntimeContracts,
  describeProductRuntimeContracts,
} = require("../src/platform/contracts/productRuntimeRegistry");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERSON_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEMBER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PATIENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function createMemoryDb(seed = {}) {
  const state = {
    persons: seed.persons ? [...seed.persons] : [],
    links: seed.links ? [...seed.links] : [],
    addresses: seed.addresses ? [...seed.addresses] : [],
    contacts: seed.contacts ? [...seed.contacts] : [],
  };

  return {
    state,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ");

      if (text.includes("INSERT INTO platform.persons")) {
        const row = {
          id: PERSON_ID,
          organization_id: params[0],
          branch_id: params[1],
          facility_id: params[2],
          platform_identity_id: params[3],
          status: params[4],
          first_name: params[5],
          middle_name: params[6],
          last_name: params[7],
          preferred_name: params[8],
          name_normalized: params[9],
          date_of_birth: params[10],
          phone_display: params[11],
          phone_normalized: params[12],
          phone_verified_at: params[13],
          email_display: params[14],
          email_normalized: params[15],
          email_verified_at: params[16],
          created_by_identity_id: params[17],
          updated_by_identity_id: params[18],
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.persons.push(row);
        return { rows: [row] };
      }

      if (
        text.includes("SELECT * FROM platform.persons") &&
        text.includes("WHERE id = $1 AND organization_id = $2")
      ) {
        const row = state.persons.find(
          (p) => p.id === params[0] && p.organization_id === params[1]
        );
        return { rows: row ? [row] : [] };
      }

      if (text.includes("INSERT INTO platform.person_product_links")) {
        const row = {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          organization_id: params[0],
          person_id: params[1],
          product_code: params[2],
          relationship_key: params[3],
          subject_ref: params[4],
          status: "active",
          branch_id: params[5],
          facility_id: params[6],
          linked_at: new Date(),
          unlinked_at: null,
          created_by_identity_id: params[7],
          updated_by_identity_id: params[8],
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.links.push(row);
        return { rows: [row] };
      }

      if (
        text.includes("SELECT * FROM platform.person_product_links") &&
        text.includes("subject_ref = $4")
      ) {
        const row = state.links.find(
          (l) =>
            l.organization_id === params[0] &&
            l.product_code === params[1] &&
            l.relationship_key === params[2] &&
            l.subject_ref === params[3] &&
            ["active", "inactive"].includes(l.status)
        );
        return { rows: row ? [row] : [] };
      }

      if (
        text.includes("SELECT * FROM platform.person_product_links") &&
        text.includes("person_id = $2")
      ) {
        return {
          rows: state.links.filter(
            (l) =>
              l.organization_id === params[0] && l.person_id === params[1]
          ),
        };
      }

      if (text.includes("UPDATE platform.persons SET") && text.includes("phone_verified_at")) {
        const row = state.persons.find(
          (p) => p.id === params[0] && p.organization_id === params[1]
        );
        if (!row) return { rows: [] };
        if (params[2] === true) row.phone_verified_at = row.phone_verified_at || new Date();
        if (params[3] === true) row.phone_verified_at = null;
        if (params[4] === true) row.email_verified_at = row.email_verified_at || new Date();
        if (params[5] === true) row.email_verified_at = null;
        row.updated_at = new Date();
        return { rows: [row] };
      }

      if (text.includes("INSERT INTO platform.person_addresses")) {
        const row = {
          id: "a1111111-1111-4111-8111-111111111111",
          organization_id: params[0],
          person_id: params[1],
          address_kind: params[2],
          is_primary: params[3],
          line_1: params[4],
          line_2: params[5],
          city: params[6],
          district: params[7],
          province: params[8],
          postal_code: params[9],
          country_code: params[10],
          location_id: params[11],
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.addresses.push(row);
        return { rows: [row] };
      }

      if (text.includes("INSERT INTO platform.person_related_contacts")) {
        const row = {
          id: "b2222222-2222-4222-8222-222222222222",
          organization_id: params[0],
          person_id: params[1],
          contact_role: params[2],
          full_name: params[3],
          relationship_label: params[4],
          phone_display: params[5],
          phone_normalized: params[6],
          email_display: params[7],
          email_normalized: params[8],
          is_primary: params[9],
          consent_to_contact: params[10],
          notes: params[11],
          status: "active",
          created_by_identity_id: params[12],
          updated_by_identity_id: params[13],
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.contacts.push(row);
        return { rows: [row] };
      }

      throw new Error(`Unexpected SQL in memory db: ${text.slice(0, 120)}`);
    },
  };
}

describe("V2.04 person normalization", () => {
  it("normalizes names, email, phone, and DOB", () => {
    assert.equal(normalizePersonName(" Ada ", "  Lovelace ", "Byron"), "ada lovelace byron");
    const email = normalizePersonEmail(" Ada@Example.COM ");
    assert.equal(email.ok, true);
    assert.equal(email.normalized, "ada@example.com");

    const phone = normalizePersonPhone({
      phoneNormalized: "+260971234567",
      phoneDisplay: "0971234567",
    });
    assert.equal(phone.ok, true);
    assert.equal(phone.normalized, "+260971234567");

    const dob = normalizePersonDateOfBirth("1990-05-01");
    assert.equal(dob.ok, true);
    assert.equal(dob.dateOfBirth, "1990-05-01");
    assert.equal(normalizePersonDateOfBirth("2099-01-01").ok, false);
  });

  it("rejects product-domain fields on person demographics", () => {
    for (const field of [
      "patientNumber",
      "member_number",
      "diagnoses",
      "membershipStatus",
    ]) {
      const denied = rejectForbiddenPersonFields({ [field]: "x" });
      assert.equal(denied.ok, false);
      assert.ok(PERSON_FORBIDDEN_FIELDS.includes(field) || denied.fields.includes(field));
    }

    const ok = normalizePersonDemographics({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phoneNormalized: "+260971234567",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.nameNormalized, "jane doe");

    const blocked = normalizePersonDemographics({
      firstName: "Jane",
      lastName: "Doe",
      patientNumber: "AC-2026-000001",
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "forbidden_person_field");
  });

  it("normalizes address and related-contact primitives", () => {
    const address = normalizePersonAddress({
      addressKind: "home",
      line1: "12 Independence Ave",
      city: "Lusaka",
      countryCode: "zm",
      isPrimary: true,
    });
    assert.equal(address.ok, true);
    assert.equal(address.countryCode, "ZM");

    const contact = normalizeRelatedContact({
      contactRole: PERSON_CONTACT_ROLE.EMERGENCY,
      fullName: "John Doe",
      relationship: "spouse",
      phoneNormalized: "+260977000111",
      consentToContact: true,
    });
    assert.equal(contact.ok, true);
    assert.equal(contact.contactRole, "emergency");
  });
});

describe("V2.04 person scope + product code", () => {
  it("rejects forged tenant identifiers and invalid product codes", () => {
    const forged = assertTrustedPersonScope({
      trusted: { organizationId: ORG },
      body: { organizationId: ORG_B },
    });
    assert.equal(forged.ok, false);

    const ok = assertTrustedPersonScope({
      trusted: { organizationId: ORG, facilityId: null },
      body: { firstName: "Ada" },
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.organizationId, ORG);

    assert.equal(assertProductCode("blessboard").ok, true);
    assert.equal(assertProductCode("other").ok, false);
  });
});

describe("V2.04 person compatibility projections", () => {
  it("projects BB member drafts without pulling membership semantics into person", () => {
    const draft = projectPersonDraftFromBlessBoardMember({
      id: MEMBER_ID,
      first_name: "Mary",
      last_name: "Phiri",
      email_display: "mary@example.com",
      phone_normalized: "+260971111111",
      status: "active",
      church_id: "church-1",
    });
    assert.equal(draft.ok, true);
    assert.equal(draft.relationshipKey, PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP);
    assert.equal(draft.subjectRef, MEMBER_ID);
    assert.equal(draft.demographics.firstName, "Mary");
    assert.equal(draft.productOwned.membershipStatus, "active");
    assert.equal(draft.productOwned.churchId, "church-1");
    assert.equal(Object.prototype.hasOwnProperty.call(draft.demographics, "status"), false);
  });

  it("projects AC patient drafts without Patient Number or clinical fields", () => {
    const draft = projectPersonDraftFromActiveClinicPatient({
      id: PATIENT_ID,
      first_name: "James",
      last_name: "Banda",
      phone_normalized: "+260972222222",
      date_of_birth: "1985-03-12",
      address_line_1: "Plot 9",
      city: "Ndola",
      country_code: "ZM",
      patient_number: "AC-2026-000042",
      next_of_kin_name: "Grace Banda",
      next_of_kin_relationship: "spouse",
      next_of_kin_phone_normalized: "+260973333333",
      status: "active",
    });
    assert.equal(draft.ok, true);
    assert.equal(draft.relationshipKey, PERSON_RELATIONSHIP_KEY.AC_PATIENT);
    assert.equal(draft.subjectRef, PATIENT_ID);
    assert.equal(draft.productOwned.patientNumber, "AC-2026-000042");
    assert.ok(draft.address);
    assert.equal(draft.address.city, "Ndola");
    assert.ok(draft.nextOfKin);
    assert.equal(draft.nextOfKin.fullName, "Grace Banda");

    const emergency = projectRelatedContactsFromEmergencyContacts([
      {
        full_name: "Grace Banda",
        relationship: "spouse",
        phone_normalized: "+260973333333",
        is_primary: true,
        consent_to_contact: true,
      },
    ]);
    assert.equal(emergency.contacts.length, 1);
    assert.equal(emergency.contacts[0].contactRole, "emergency");
  });
});

describe("V2.04 person service (in-memory)", () => {
  beforeEach(() => {
    clearProductRuntimeContracts();
    registerPersonProductAdapter("blessboard", {
      relationshipKeys: [PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP],
      defaultRelationshipKey: PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP,
    });
    registerPersonProductAdapter("activeclinic", {
      relationshipKeys: [PERSON_RELATIONSHIP_KEY.AC_PATIENT],
      defaultRelationshipKey: PERSON_RELATIONSHIP_KEY.AC_PATIENT,
    });
  });
  afterEach(() => {
    clearProductRuntimeContracts();
  });

  it("creates a person without portal identity and links product relationships", async () => {
    const db = createMemoryDb();
    const created = await createPerson(db, {
      trusted: { organizationId: ORG },
      demographics: {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phoneNormalized: "+260971234567",
      },
      // Explicitly no platformIdentityId — staff-managed without portal.
    });
    assert.equal(created.ok, true);
    assert.equal(created.person.platformIdentityId, null);
    assert.equal(created.person.organizationId, ORG);

    const linked = await linkPersonProductRelationship(db, {
      trusted: { organizationId: ORG },
      personId: created.person.id,
      productCode: "activeclinic",
      subjectRef: PATIENT_ID,
    });
    assert.equal(linked.ok, true);
    assert.equal(linked.link.relationshipKey, PERSON_RELATIONSHIP_KEY.AC_PATIENT);
    assert.equal(linked.link.subjectRef, PATIENT_ID);

    const dup = await linkPersonProductRelationship(db, {
      trusted: { organizationId: ORG },
      personId: created.person.id,
      productCode: "activeclinic",
      subjectRef: PATIENT_ID,
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.code, RESULT.LINK_EXISTS);
  });

  it("enforces org isolation on person lookup/link", async () => {
    const db = createMemoryDb({
      persons: [
        {
          id: PERSON_ID,
          organization_id: ORG,
          branch_id: null,
          facility_id: null,
          platform_identity_id: null,
          status: "active",
          first_name: "Ada",
          middle_name: null,
          last_name: "Lovelace",
          preferred_name: null,
          name_normalized: "ada lovelace",
          date_of_birth: null,
          phone_display: null,
          phone_normalized: "+260971234567",
          phone_verified_at: null,
          email_display: "ada@example.com",
          email_normalized: "ada@example.com",
          email_verified_at: null,
          created_by_identity_id: null,
          updated_by_identity_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const crossOrg = await linkPersonProductRelationship(db, {
      trusted: { organizationId: ORG_B },
      personId: PERSON_ID,
      productCode: "blessboard",
      subjectRef: MEMBER_ID,
    });
    assert.equal(crossOrg.ok, false);
    assert.equal(crossOrg.code, RESULT.NOT_FOUND);
  });

  it("supports verification state, addresses, and related contacts", async () => {
    const db = createMemoryDb({
      persons: [
        {
          id: PERSON_ID,
          organization_id: ORG,
          branch_id: null,
          facility_id: null,
          platform_identity_id: null,
          status: "active",
          first_name: "Ada",
          middle_name: null,
          last_name: "Lovelace",
          preferred_name: null,
          name_normalized: "ada lovelace",
          date_of_birth: null,
          phone_display: "+260971234567",
          phone_normalized: "+260971234567",
          phone_verified_at: null,
          email_display: "ada@example.com",
          email_normalized: "ada@example.com",
          email_verified_at: null,
          created_by_identity_id: null,
          updated_by_identity_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const verified = await setVerificationState(db, {
      trusted: { organizationId: ORG },
      personId: PERSON_ID,
      markPhoneVerified: true,
      markEmailVerified: true,
    });
    assert.equal(verified.ok, true);
    assert.ok(verified.person.phoneVerifiedAt);
    assert.ok(verified.person.emailVerifiedAt);

    const address = await addPersonAddress(db, {
      trusted: { organizationId: ORG },
      personId: PERSON_ID,
      address: {
        addressKind: "home",
        line1: "1 Tech Road",
        city: "Lusaka",
        countryCode: "ZM",
        isPrimary: true,
      },
    });
    assert.equal(address.ok, true);
    assert.equal(address.address.city, "Lusaka");

    const contact = await addRelatedContact(db, {
      trusted: { organizationId: ORG },
      personId: PERSON_ID,
      contact: {
        contactRole: "next_of_kin",
        fullName: "Kin Person",
        relationshipLabel: "sibling",
        phoneNormalized: "+260977777777",
      },
    });
    assert.equal(contact.ok, true);
    assert.equal(contact.contact.contactRole, "next_of_kin");
  });

  it("rejects forbidden product fields on create", async () => {
    const db = createMemoryDb();
    const created = await createPerson(db, {
      trusted: { organizationId: ORG },
      demographics: {
        firstName: "Ada",
        lastName: "Lovelace",
        patientNumber: "AC-2026-000001",
      },
    });
    assert.equal(created.ok, false);
    assert.equal(created.code, RESULT.FORBIDDEN_FIELD);
  });
});

describe("V2.04 person product adapters + audit catalogue", () => {
  beforeEach(() => {
    clearProductRuntimeContracts();
  });
  afterEach(() => {
    clearProductRuntimeContracts();
  });

  it("registers person adapters without product if-forks in platform person module", () => {
    assert.equal(
      registerPersonProductAdapter("blessboard", {
        relationshipKeys: [PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP],
        defaultRelationshipKey: PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP,
      }),
      true
    );
    assert.equal(
      registerPersonProductAdapter("activeclinic", {
        relationshipKeys: [PERSON_RELATIONSHIP_KEY.AC_PATIENT],
        defaultRelationshipKey: PERSON_RELATIONSHIP_KEY.AC_PATIENT,
      }),
      true
    );
    assert.equal(
      getPersonProductAdapter("blessboard").defaultRelationshipKey,
      PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP
    );
    assert.deepEqual(describeProductRuntimeContracts().personProductAdapters, [
      "activeclinic",
      "blessboard",
    ]);

    const personSrc = fs.readFileSync(
      path.join(__dirname, "../src/platform/person/personService.js"),
      "utf8"
    );
    assert.doesNotMatch(personSrc, /product\s*===\s*["']blessboard["']/);
    assert.doesNotMatch(personSrc, /product\s*===\s*["']activeclinic["']/);
    assert.doesNotMatch(personSrc, /require\(["'].*blessboard/);
    assert.doesNotMatch(personSrc, /require\(["'].*activeclinic/);
  });

  it("exposes person audit action/entity keys", () => {
    assert.equal(SHARED_AUDIT_ACTION.PERSON_CREATED, "person.created");
    assert.equal(SHARED_AUDIT_ACTION.PERSON_PRODUCT_LINKED, "person.product_linked");
    assert.equal(SHARED_AUDIT_ENTITY.PERSON, "person");
    assert.equal(SHARED_AUDIT_ENTITY.PERSON_RELATED_CONTACT, "person_related_contact");
  });

  it("ships additive person foundation migration", () => {
    const migration = fs.readFileSync(
      path.join(
        __dirname,
        "../db/migrations/platform/046_person_foundation.sql"
      ),
      "utf8"
    );
    assert.match(migration, /CREATE TABLE IF NOT EXISTS platform\.persons/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS platform\.person_product_links/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS platform\.person_addresses/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS platform\.person_related_contacts/);
    assert.doesNotMatch(migration, /DROP TABLE.*(members|patients|identities)/i);
    assert.doesNotMatch(migration, /ALTER TABLE blessboard\.members/);
    assert.doesNotMatch(migration, /ALTER TABLE activeclinic\.patients/);
  });
});

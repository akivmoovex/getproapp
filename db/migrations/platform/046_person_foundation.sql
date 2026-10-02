-- V2.04 Phase 1 — Shared person foundation (additive compatibility layer).
--
-- A platform.person is a demographic contact aggregate, NOT:
--   - a login principal (use platform.identities)
--   - a BlessBoard membership (product-owned)
--   - an ActiveClinic patient record (product-owned)
--
-- Product relationships are linked via person_product_links (opaque subject_ref).
-- Staff-created persons may exist with NULL platform_identity_id (no portal).
--
-- Does NOT migrate blessboard.members or activeclinic.patients.
-- Does NOT store Church ID, Patient Number, clinical, or ministry data.
-- Idempotent. Reversible via companion notes at bottom (drop new objects only).

-- ---------------------------------------------------------------------------
-- platform.persons — org-scoped demographic person
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  -- Optional soft location scope (product meaning differs; never trust from client).
  branch_id UUID NULL,
  facility_id UUID NULL,
  -- Optional portal/login link. NULL = staff-managed person without portal activation.
  platform_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  first_name TEXT NOT NULL,
  middle_name TEXT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT NULL,
  -- Normalized for search/dedupe (lower + collapsed whitespace).
  name_normalized TEXT NOT NULL,
  date_of_birth DATE NULL,
  phone_display TEXT NULL,
  phone_normalized TEXT NULL,
  phone_verified_at TIMESTAMPTZ NULL,
  email_display TEXT NULL,
  email_normalized TEXT NULL,
  email_verified_at TIMESTAMPTZ NULL,
  created_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  updated_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT persons_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT persons_first_name_len
    CHECK (char_length(first_name) BETWEEN 1 AND 100),
  CONSTRAINT persons_middle_name_len
    CHECK (middle_name IS NULL OR char_length(middle_name) BETWEEN 1 AND 100),
  CONSTRAINT persons_last_name_len
    CHECK (char_length(last_name) BETWEEN 1 AND 100),
  CONSTRAINT persons_preferred_name_len
    CHECK (preferred_name IS NULL OR char_length(preferred_name) BETWEEN 1 AND 100),
  CONSTRAINT persons_name_normalized_len
    CHECK (char_length(name_normalized) BETWEEN 1 AND 320),
  CONSTRAINT persons_phone_normalized_format
    CHECK (
      phone_normalized IS NULL
      OR (
        phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
        AND char_length(phone_normalized) BETWEEN 8 AND 20
      )
    ),
  CONSTRAINT persons_phone_display_len
    CHECK (phone_display IS NULL OR char_length(phone_display) BETWEEN 1 AND 40),
  CONSTRAINT persons_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    ),
  CONSTRAINT persons_email_display_len
    CHECK (email_display IS NULL OR char_length(email_display) BETWEEN 1 AND 254),
  CONSTRAINT persons_phone_verified_requires_phone
    CHECK (phone_verified_at IS NULL OR phone_normalized IS NOT NULL),
  CONSTRAINT persons_email_verified_requires_email
    CHECK (email_verified_at IS NULL OR email_normalized IS NOT NULL),
  CONSTRAINT persons_updated_after_created
    CHECK (updated_at >= created_at)
);

COMMENT ON TABLE platform.persons IS
  'V2.04 demographic person. Not auth, not membership, not patient. Optional identity link.';

CREATE INDEX IF NOT EXISTS persons_org_status_idx
  ON platform.persons (organization_id, status);

CREATE INDEX IF NOT EXISTS persons_org_name_normalized_idx
  ON platform.persons (organization_id, name_normalized);

CREATE INDEX IF NOT EXISTS persons_org_phone_normalized_idx
  ON platform.persons (organization_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS persons_org_email_normalized_idx
  ON platform.persons (organization_id, email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS persons_org_dob_idx
  ON platform.persons (organization_id, date_of_birth)
  WHERE date_of_birth IS NOT NULL;

CREATE INDEX IF NOT EXISTS persons_identity_idx
  ON platform.persons (platform_identity_id)
  WHERE platform_identity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS persons_org_branch_idx
  ON platform.persons (organization_id, branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS persons_org_facility_idx
  ON platform.persons (organization_id, facility_id)
  WHERE facility_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- platform.person_product_links — Person → product relationship
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.person_product_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  person_id UUID NOT NULL
    REFERENCES platform.persons (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  -- Product-owned key, e.g. bb.membership | ac.patient (not Church ID / Patient Number).
  relationship_key TEXT NOT NULL,
  -- Opaque product record id (blessboard.members.id / activeclinic.patients.id).
  subject_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  -- Soft product location scope (branch/facility); never trust from client.
  branch_id UUID NULL,
  facility_id UUID NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlinked_at TIMESTAMPTZ NULL,
  created_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  updated_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT person_product_links_product_code_check
    CHECK (product_code IN ('blessboard', 'activeclinic')),
  CONSTRAINT person_product_links_relationship_key_len
    CHECK (char_length(relationship_key) BETWEEN 1 AND 120),
  CONSTRAINT person_product_links_subject_ref_len
    CHECK (char_length(subject_ref) BETWEEN 1 AND 200),
  CONSTRAINT person_product_links_status_check
    CHECK (status IN ('active', 'inactive', 'unlinked')),
  CONSTRAINT person_product_links_unlinked_consistent
    CHECK (
      (status = 'unlinked' AND unlinked_at IS NOT NULL)
      OR (status <> 'unlinked' AND unlinked_at IS NULL)
    ),
  CONSTRAINT person_product_links_updated_after_created
    CHECK (updated_at >= created_at)
);

COMMENT ON TABLE platform.person_product_links IS
  'Links platform.persons to product records via opaque subject_ref. No portal required.';

-- One live link per product subject within an org.
CREATE UNIQUE INDEX IF NOT EXISTS person_product_links_org_rel_subject_live_uidx
  ON platform.person_product_links (organization_id, product_code, relationship_key, subject_ref)
  WHERE status IN ('active', 'inactive');

-- One live relationship_key per person+product (a person has at most one BB membership /
-- one AC patient link of a given key within the org — products may relax later).
CREATE UNIQUE INDEX IF NOT EXISTS person_product_links_person_rel_live_uidx
  ON platform.person_product_links (person_id, product_code, relationship_key)
  WHERE status IN ('active', 'inactive');

CREATE INDEX IF NOT EXISTS person_product_links_person_idx
  ON platform.person_product_links (person_id, status);

CREATE INDEX IF NOT EXISTS person_product_links_org_product_idx
  ON platform.person_product_links (organization_id, product_code, relationship_key);

-- ---------------------------------------------------------------------------
-- platform.person_addresses — address primitives (not facility trees)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.person_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  person_id UUID NOT NULL
    REFERENCES platform.persons (id)
    ON DELETE RESTRICT,
  address_kind TEXT NOT NULL DEFAULT 'home',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  line_1 TEXT NULL,
  line_2 TEXT NULL,
  city TEXT NULL,
  district TEXT NULL,
  province TEXT NULL,
  postal_code TEXT NULL,
  country_code TEXT NULL,
  -- Optional catalogue city id (platform.geographic_locations); not required.
  location_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT person_addresses_kind_check
    CHECK (address_kind IN ('home', 'work', 'postal', 'billing', 'other')),
  CONSTRAINT person_addresses_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT person_addresses_line_1_len
    CHECK (line_1 IS NULL OR char_length(line_1) BETWEEN 1 AND 200),
  CONSTRAINT person_addresses_line_2_len
    CHECK (line_2 IS NULL OR char_length(line_2) BETWEEN 1 AND 200),
  CONSTRAINT person_addresses_city_len
    CHECK (city IS NULL OR char_length(city) BETWEEN 1 AND 120),
  CONSTRAINT person_addresses_district_len
    CHECK (district IS NULL OR char_length(district) BETWEEN 1 AND 120),
  CONSTRAINT person_addresses_province_len
    CHECK (province IS NULL OR char_length(province) BETWEEN 1 AND 120),
  CONSTRAINT person_addresses_postal_code_len
    CHECK (postal_code IS NULL OR char_length(postal_code) BETWEEN 1 AND 32),
  CONSTRAINT person_addresses_country_code_len
    CHECK (country_code IS NULL OR char_length(country_code) BETWEEN 2 AND 3),
  CONSTRAINT person_addresses_updated_after_created
    CHECK (updated_at >= created_at)
);

COMMENT ON TABLE platform.person_addresses IS
  'Person address primitives. Not org facility/branch trees.';

CREATE INDEX IF NOT EXISTS person_addresses_person_idx
  ON platform.person_addresses (person_id, status);

CREATE INDEX IF NOT EXISTS person_addresses_org_idx
  ON platform.person_addresses (organization_id, person_id);

-- ---------------------------------------------------------------------------
-- platform.person_related_contacts — related / next-of-kin / emergency primitives
-- ---------------------------------------------------------------------------
-- Generic contact graph only. Not guardianship. Not clinical consent authority.
-- ActiveClinic may keep patient_emergency_contacts as product-local clinical UI source;
-- this table is the optional shared mechanism products may adopt.
CREATE TABLE IF NOT EXISTS platform.person_related_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  person_id UUID NOT NULL
    REFERENCES platform.persons (id)
    ON DELETE RESTRICT,
  contact_role TEXT NOT NULL,
  full_name TEXT NOT NULL,
  relationship_label TEXT NULL,
  phone_display TEXT NULL,
  phone_normalized TEXT NULL,
  email_display TEXT NULL,
  email_normalized TEXT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  consent_to_contact BOOLEAN NULL,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  updated_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT person_related_contacts_role_check
    CHECK (contact_role IN ('related', 'next_of_kin', 'emergency')),
  CONSTRAINT person_related_contacts_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT person_related_contacts_full_name_len
    CHECK (char_length(full_name) BETWEEN 1 AND 200),
  CONSTRAINT person_related_contacts_relationship_label_len
    CHECK (
      relationship_label IS NULL
      OR char_length(relationship_label) BETWEEN 1 AND 80
    ),
  CONSTRAINT person_related_contacts_phone_normalized_format
    CHECK (
      phone_normalized IS NULL
      OR (
        phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
        AND char_length(phone_normalized) BETWEEN 8 AND 20
      )
    ),
  CONSTRAINT person_related_contacts_phone_display_len
    CHECK (phone_display IS NULL OR char_length(phone_display) BETWEEN 1 AND 40),
  CONSTRAINT person_related_contacts_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    ),
  CONSTRAINT person_related_contacts_email_display_len
    CHECK (
      email_display IS NULL
      OR char_length(email_display) BETWEEN 1 AND 254
    ),
  CONSTRAINT person_related_contacts_notes_len
    CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 500),
  CONSTRAINT person_related_contacts_updated_after_created
    CHECK (updated_at >= created_at)
);

COMMENT ON TABLE platform.person_related_contacts IS
  'Related / next-of-kin / emergency contact primitives. Not guardianship or clinical consent.';

CREATE INDEX IF NOT EXISTS person_related_contacts_person_idx
  ON platform.person_related_contacts (person_id, status);

CREATE INDEX IF NOT EXISTS person_related_contacts_org_role_idx
  ON platform.person_related_contacts (organization_id, contact_role, status);

-- ---------------------------------------------------------------------------
-- Reversal (manual / non-production): drop new objects only — never legacy tables.
--   DROP TABLE IF EXISTS platform.person_related_contacts;
--   DROP TABLE IF EXISTS platform.person_addresses;
--   DROP TABLE IF EXISTS platform.person_product_links;
--   DROP TABLE IF EXISTS platform.persons;
-- ---------------------------------------------------------------------------

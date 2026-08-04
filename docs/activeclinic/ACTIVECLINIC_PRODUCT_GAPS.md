# ActiveClinic — Product Gaps & Blocked Features

**Last updated:** 2026-08-04  
**Context:** Phase 04 clinical foundation implementation

## Overview

This document records known product limitations, blocked features, and clinical safety constraints in ActiveClinic. These are **intentional gaps** based on clinical safety requirements, product decisions, or deferred advanced features.

## Clinical decision support (CDS) — BLOCKED

**Status:** PRODUCT_DECISION / CLINICAL_SAFETY

**Blocked features:**
- Auto-diagnose algorithms
- Treatment recommendations
- Silent risk scores / auto-escalation
- Auto-prescribing / dose calculation
- Drug interaction checking
- Clinical pathway automation
- Predictive analytics for patient outcomes

**Rationale:**
- Clinical decision support requires external medical knowledge bases, regulatory compliance, and clinical validation
- Auto-prescribing + drug interactions require licensed drug databases (e.g. First Databank, Lexicomp)
- Silent risk scoring without clinician review is unsafe
- ActiveClinic P04 focuses on documentation workflows, not autonomous clinical decisions

**Current behavior:**
- Clinician manually enters diagnoses, prescriptions, triage categories
- System provides data entry fields and workflow support only
- All clinical judgments remain with licensed healthcare providers

**Future consideration:**
- External CDS integration (API-based, explicit approval required)
- Manual reference lookup tools (non-prescriptive)
- Audit trails for CDS suggestions (never auto-apply)

## Drug interaction checking — BLOCKED ADVANCED

**Status:** PRODUCT_DECISION

**Blocked features:**
- Real-time drug-drug interaction alerts
- Drug-allergy contraindication warnings
- Dose range validation
- Renal/hepatic dosing adjustments
- Duplicate therapy detection

**Rationale:**
- Requires subscription to commercial drug interaction databases
- Requires real-time medication history (current medications list may be incomplete)
- False-positive alerts cause alert fatigue

**Current behavior:**
- Clinician enters drug name, dose, frequency, duration manually
- System stores prescription as JSONB (structured fields)
- No validation warnings at prescription entry

**Future consideration:**
- Optional drug interaction API integration (opt-in per facility)
- Basic duplicate therapy detection (same generic name)
- Dosing reference links (external resources)

## Vital sign auto-flagging / escalation — WARN ONLY

**Status:** CLINICAL_SAFETY

**Current behavior:**
- Exceptional vital sign values (out-of-range) MAY warn clinician in UI (soft warning)
- NO hard blocks on exceptional values (clinician can record intentionally)
- NO auto-escalation to alerts (manual alert raise required)

**Rationale:**
- Vital sign thresholds vary by patient age, condition, clinical context
- False-positive auto-escalation creates alert fatigue
- Clinician judgment required to interpret exceptional values

**Future consideration:**
- Configurable facility-specific vital sign thresholds
- Manual review of exceptional values (flagged for attention, not auto-escalated)

## Structured diagnosis code lookup — DEFERRED

**Status:** PRODUCT_DECISION

**Blocked features:**
- ICD-10 / SNOMED CT code search
- Diagnosis code validation
- Auto-complete for diagnosis codes
- Integration with external terminology services

**Rationale:**
- Requires large terminology datasets (ICD-10: 70k+ codes, SNOMED: 350k+ concepts)
- Requires UI for code search + selection
- Free text diagnosis sufficient for initial clinical documentation

**Current behavior:**
- Diagnosis code field accepts free text (optional)
- Diagnosis text field is required (free text)
- Clinician enters ICD-10 / local code manually if needed

**Future consideration:**
- Local code lookup (facility-specific code lists)
- External terminology service integration (API-based)

## Order fulfillment / result entry — P05/P06

**Status:** DEFERRED TO FUTURE PHASES

**P04 scope (order creation only):**
- Lab orders: clinician creates order with test code + instructions
- Prescription orders: clinician creates prescription with drug/dose/frequency
- Radiology orders: clinician creates imaging request with type + body part

**NOT in P04:**
- Lab result entry (P05 Lab module)
- Medication dispensing / pharmacy fulfillment (P05 Pharmacy module)
- Radiology report entry (P06 Imaging module)
- Order status tracking (submitted → in_progress → completed)
- Result acknowledgment / sign-off

**Rationale:**
- Order fulfillment requires additional workflows, roles, and integrations
- Lab/pharmacy/radiology modules are separate phases with distinct schemas

**Current behavior:**
- Orders created with status `draft` or `submitted`
- No result entry in P04
- Fulfillment documented in future phases

## Cross-facility encounter transfers — NOT SUPPORTED

**Status:** PRODUCT_DECISION

**Current behavior:**
- Encounter scoped to single facility
- No transfer workflow between facilities
- Manual coordination required for inter-facility referrals

**Rationale:**
- Cross-facility transfers require complex RBAC (staff access to multiple facilities)
- Patient consent / data sharing policies vary by facility
- Initial scope: single-facility encounter workflows

**Future consideration:**
- Referral notes + patient data export
- Inter-facility encounter handoff (with explicit consent)

## Auto-triage / risk stratification — BLOCKED

**Status:** CLINICAL_SAFETY

**Current behavior:**
- Triage category assigned manually by clinician
- No auto-triage algorithm (e.g. ESI, CTAS, MTS)
- Pain level is self-reported (0-10 scale), not auto-scored

**Rationale:**
- Auto-triage requires clinical validation of algorithms
- Risk stratification algorithms (e.g. MEWS, NEWS) require regulatory approval
- Silent risk scores without clinician review are unsafe

**Future consideration:**
- Manual triage protocol adherence (checklist support, not auto-decision)

## Clinical pathways / care plans — NOT IMPLEMENTED

**Status:** DEFERRED

**Blocked features:**
- Standardized care plans (e.g. diabetes management, post-op care)
- Clinical pathway automation
- Care plan adherence tracking
- Outcome measurement

**Rationale:**
- Care plans require clinical protocol definitions
- Pathway automation requires workflow engine + decision logic
- Initial scope: encounter documentation, not longitudinal care management

**Current behavior:**
- Clinician documents plan in consultation note (free text)
- No structured care plan tracking

**Future consideration:**
- Care plan templates (facility-specific protocols)
- Task lists for care plan adherence

## Advanced reporting / analytics — NOT IMPLEMENTED

**Status:** DEFERRED

**Blocked features:**
- Clinical quality indicators (CQI)
- Population health analytics
- Adverse event tracking
- Clinical audit reports

**Rationale:**
- Requires data warehouse + analytics infrastructure
- Requires clinical measure definitions (e.g. HEDIS, PQRS)

**Current behavior:**
- Basic audit trails in `platform.audit_events` + `encounter_events`
- No aggregated reporting in P04

**Future consideration:**
- Facility-level clinical dashboards
- Export to external analytics tools

## Encounter continuity / longitudinal records — BASIC ONLY

**Status:** INITIAL IMPLEMENTATION

**Current behavior:**
- Encounter-scoped documentation (triage, vitals, consultation, orders)
- Patient medical history summary in triage (free text, clinician-entered)
- No automatic summary of prior encounters

**Future consideration:**
- Encounter timeline (all encounters for patient)
- Auto-populate medical history from prior encounters
- Longitudinal view of diagnoses, medications, allergies

## Conclusion

These gaps are **documented and intentional**. They reflect clinical safety constraints, product priorities, and phased implementation scope. No fabricated features or unsafe automation included in P04.

Future phases may address selected gaps based on clinical validation, regulatory requirements, and product roadmap.

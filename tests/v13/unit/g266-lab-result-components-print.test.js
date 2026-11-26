"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  loadActiveClinicLaboratoryRequestDetailScreen,
} = require("../../../src/activeclinic/services/loadActiveClinicDiagnosticsScreens");

function makePool(handler) {
  return {
    connect: async () => ({
      query: async (sql, params) => handler(sql, params),
      release() {},
    }),
  };
}

describe("G266 laboratory result components print readiness", () => {
  it("loads persisted components onto the request detail for print-ready read-back", async () => {
    const calls = [];
    const pool = makePool(async (sql) => {
      calls.push(sql);
      if (sql.includes("FROM activeclinic.laboratory_requests lr")) {
        return {
          rows: [
            {
              id: "req-1",
              request_number: "LR-1",
              test_panel_name: "FBC",
              urgency: "routine",
              status: "resulted",
              requested_at: new Date().toISOString(),
              clinical_notes: null,
              patient_display_name: "Lab Journey",
            },
          ],
        };
      }
      if (sql.includes("FROM activeclinic.laboratory_results")) {
        return {
          rows: [
            {
              id: "res-1",
              status: "resulted",
              result_summary: "FBC recorded",
              patient_id: "pat-1",
              entered_by_staff_id: "staff-1",
            },
          ],
        };
      }
      if (sql.includes("FROM activeclinic.laboratory_result_components")) {
        return {
          rows: [
            {
              test_name: "Hemoglobin",
              test_code: "HGB",
              value_numeric: 12.4,
              value_text: null,
              unit: "g/dL",
              reference_range_low: null,
              reference_range_high: null,
              reference_range_text: null,
              interpretation: null,
              is_abnormal: null,
              component_order: 1,
            },
          ],
        };
      }
      if (sql.includes("FROM activeclinic.specimen_events")) {
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${sql.slice(0, 80)}`);
    });

    const loaded = await loadActiveClinicLaboratoryRequestDetailScreen(pool, {
      auth: {
        organization: { id: "org-1" },
        healthcareOrganization: { id: "hco-1" },
        selectedFacility: { id: "fac-1" },
      },
      requestId: "req-1",
    });

    assert.equal(loaded.ok, true);
    assert.equal(loaded.request.result.summary, "FBC recorded");
    assert.equal(loaded.request.result.components.length, 1);
    assert.equal(loaded.request.result.components[0].testName, "Hemoglobin");
    assert.equal(loaded.request.result.components[0].valueNumeric, 12.4);
    assert.equal(loaded.request.actions.canPrint, true);
    assert.ok(calls.some((sql) => sql.includes("laboratory_result_components")));
  });

  it("keeps the laboratory result print region markup bound to component rows", () => {
    const template = fs.readFileSync(
      path.join(
        __dirname,
        "../../../views/activeclinic/app/diagnostics-laboratory-request-detail-content.ejs"
      ),
      "utf8"
    );
    assert.match(template, /data-ac-print-region="laboratory-result"/);
    assert.match(template, /data-ac-lab-components="1"/);
    assert.match(template, /data-ac-lab-component="1"/);
    assert.match(template, /data-ac-print="laboratory-result"/);
    assert.ok(
      !/reference range invented|normal 12-16/i.test(template),
      "print markup must not invent clinical reference ranges"
    );
  });
});

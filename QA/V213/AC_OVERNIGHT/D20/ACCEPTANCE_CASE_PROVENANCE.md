# Acceptance case provenance

## Sources

| Source | Cases | Where |
|---|---|---|
| Uploaded PDF `ActiveClinic_QA_Acceptance_Matrix_V1.pdf`, 14 November 2026, status PROPOSED, NOT EXECUTED | 84 unique IDs, 0 duplicates | `~/Downloads/ActiveClinic_QA_Acceptance_Matrix_V1.pdf` |
| Repository traceability CSV | 84 unique IDs, same set, 0 duplicates, every row `NOT_RUN` and citing the PDF | V9 workspace `QA/V213/AC_OVERNIGHT/STAGE_01/ACCEPTANCE_TRACEABILITY.csv` |
| Claimed 69-case matrix | No file | Not in the V13 tree, the V9 workspace, or Downloads |

The PDF and the CSV contain the same 84 IDs. Twenty-eight requirement phrases spread across the areas were checked against the CSV text and matched. Every CSV `source_reference` contains its own ID and the 14 Nov 2026 citation. No changed expected outcome, owner, or requirement was found between those two copies.

The CSV adds audit columns (`implementation_location`, `test_location`, `current_status`, `missing_evidence`). Those are traceability notes. They are not extra acceptance cases.

## Why 69 appears

No 69-row document was found. The arithmetic `84 - 9 PLT - 6 BBF = 69` is exact. PLT rows are shared-platform cases with owner AC. BBF rows are BlessBoard cases with owner BB. They are inside the same PDF, not a second matrix. Treating 69 as the authoritative set would drop those 15 cases. They stay in the preserved 84.

That 69 figure is `UNVERIFIED` as a separate matrix. It is only a possible subset label.

## D19 and earlier V2.13 reports

D16’s feature matrix has 32 engineering IDs (`BB-*`, `INV-01`, `AC-*`, `PF-*`). D17, D18, and D19 discuss AC-05, patient activation, appointment conflict, and OTP. None of those reports is the 84-case acceptance matrix, and none replaces a PDF row.

## Preserved cases

All 84 PDF IDs are preserved. Classification is in `ACCEPTANCE_MATRIX_69_VS_84.csv`. Owner `BB` is only the six `BBF-*` rows. Every other row is owner `AC` as printed in the PDF. Area groups: TEN 3, ID 6, VIS 6, NUR 3, CLN 3, ORD 3, LAB 3, RX 3, FIN 3, DOC 3, RET 3, SEC 6, PAT 3, APT 3, OTP 9, PLT 9, BBF 6, OPS 6, JUF 3.

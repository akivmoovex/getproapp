# D59 final report

ActiveClinic Stage A runs 14 cases and can fail the job when one of those cases fails. It does not run the D22–D58 unit, contract, or AC-05 files. A missing npm script exits 1. A forced failing test exits 1. A skipped test is counted as skipped.

Database, browser, and authenticated jobs stay `if: ${{ false }}`. The dispatch input does not turn them on. There is no release job and no deploy step. A full SHA is optional, and the ActiveClinic workflow stores no artifact. No workflow file was edited, and CI was not dispatched.

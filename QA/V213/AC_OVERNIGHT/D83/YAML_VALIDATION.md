# YAML validation

`actionlint` is not installed. Ruby `YAML.load_file` loaded both repaired workflows at `2026-11-15T03:34:32+0200`.

| Check | Result |
|---|---|
| Trigger keys | `workflow_dispatch` only |
| Held jobs | 3 in each file, each `if: ${{ false }}` |
| `push`, `pull_request`, `schedule` keys | Absent |
| Write flags | Both `"0"` |
| D18, D19, and D67 | 9 passed, 0 failed |

The files GitHub parsed at `c2cd146b` are still the unquoted versions. This local parse does not change that remote file.

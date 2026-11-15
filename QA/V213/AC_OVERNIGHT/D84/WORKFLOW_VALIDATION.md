# Workflow validation

Ruby loaded both workflow files at `2026-11-15T03:37:49+0200`.

| File | Triggers | Quoted echo commands | `push` key | Held jobs |
|---|---|---|---|---|
| `v13-ac-qa-regression.yml` | `workflow_dispatch` | 3 | absent | 3 |
| `v13-platform-qa-regression.yml` | `workflow_dispatch` | 3 | absent | 3 |

`if: ${{ false }}` parses. The checkout expression remains `inputs.target_sha || github.ref` until the patch is approved. `actionlint` is not installed. The proposed `if: "${{ github.event_name == 'workflow_dispatch' }}"` is quoted so the braces are a YAML string. It is not in the file yet.

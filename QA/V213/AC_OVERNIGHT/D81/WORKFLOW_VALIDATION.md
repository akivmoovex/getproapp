# Workflow validation

Ruby `YAML.load_file` reproduces the GitHub annotation:

| File | Before the quote | After the quote |
|---|---|---|
| `v13-ac-qa-regression.yml` | `mapping values are not allowed in this context at line 84 column 28` | Parses. Trigger is only `workflow_dispatch` |
| `v13-platform-qa-regression.yml` | `mapping values are not allowed in this context at line 85 column 28` | Parses. Trigger is only `workflow_dispatch` |
| `v13-bb-qa-regression.yml` | Parses | Unchanged |
| `v13-bb-bug-regressions.yml` | Parses | Unchanged |

Column 28 is the colon in `hold:`. The value is a plain YAML scalar. The double quotes belong to the shell command, so they do not quote the YAML value. A colon followed by a space ends that scalar.

After the change, the three held jobs in each repaired file still have `if: ${{ false }}`. Stage A still has no `if`. The workflow env still sets both write flags to `"0"`.

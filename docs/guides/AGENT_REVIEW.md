# Agent Review

Use this guide when reviewing pull requests or making changes as an agent.

## High-Risk Areas

- `java/opendataloader-pdf-core`: parser behavior, safety filters, output generation
- `java/opendataloader-pdf-cli`: option definitions and CLI contract
- `python/opendataloader-pdf` and `node/opendataloader-pdf`: generated wrapper surfaces
- `content/docs`: release-facing product docs
- `tests/benchmark`: regression thresholds and benchmark logic

## Review Checklist

- If `code-review-graph` is installed, build or update it before broad repo exploration. Use it to find likely impact radius, nearby callers, and related tests.
- Confirm the change stays inside the layer rules in [../architecture/LAYERS.md](../architecture/LAYERS.md).
- If CLI options changed, confirm `npm run sync` was run and regenerated files were included.
- If parser behavior changed, confirm benchmark validation ran or the reason it could not run is explicit.
- If wrappers changed, confirm they stayed thin and did not grow parser-specific logic.
- If public docs changed, review them as shipped user-facing content.

## What The Graph Does Not Replace

- Required repo docs such as `AGENTS.md`, `docs/architecture/LAYERS.md`, and this guide.
- Sync checks after Java CLI option changes.
- Benchmark validation for parser behavior changes.
- Public-surface review for `content/docs/`.
- Judgment around generated files, scripts, CI, or release wiring that may sit outside the structural impact radius.

## Validation Expectations

- Repo structure and doc-map changes: `npm run check:harness`
- Parser or CLI changes: add Java validation and benchmark checks as appropriate
- Python wrapper changes: `./scripts/test-python.sh` or the narrowest equivalent
- Node wrapper changes: `./scripts/build-node.sh` or the narrowest equivalent that includes the packaged JAR setup
- UI changes: run the relevant backend or frontend tests and, when possible, start `python apps/ui/scripts/run_dev.py`

## Escalate Instead Of Guessing

- Missing Java or package-manager tooling on the machine
- Regenerated artifacts that do not match the Java option change
- UI code trying to import repo-internal wrapper sources
- Benchmark regressions or threshold changes without justification

## Optional Graph Workflow

1. Install and register `code-review-graph` using [CODE_REVIEW_GRAPH.md](CODE_REVIEW_GRAPH.md).
2. Build or update the graph for the current checkout.
3. Ask for the impact radius or review context for the changed files.
4. Read the suggested files plus any repo-mandated docs and generated outputs that the checklist requires.
5. Run the narrowest validation that proves the change still works.

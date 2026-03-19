# Agent Review

Use this guide when reviewing pull requests or making changes as an agent.

## High-Risk Areas

- `java/opendataloader-pdf-core`: parser behavior, safety filters, output generation
- `java/opendataloader-pdf-cli`: option definitions and CLI contract
- `python/opendataloader-pdf` and `node/opendataloader-pdf`: generated wrapper surfaces
- `content/docs`: release-facing product docs
- `tests/benchmark`: regression thresholds and benchmark logic

## Review Checklist

- Confirm the change stays inside the layer rules in [../architecture/LAYERS.md](../architecture/LAYERS.md).
- If CLI options changed, confirm `npm run sync` was run and regenerated files were included.
- If parser behavior changed, confirm benchmark validation ran or the reason it could not run is explicit.
- If wrappers changed, confirm they stayed thin and did not grow parser-specific logic.
- If public docs changed, review them as shipped user-facing content.

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

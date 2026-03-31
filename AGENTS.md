# AGENTS.md

Read this file first. It is the repo entry point for agents and reviewers.

## Stack

- Java parser engine in `java/opendataloader-pdf-core`
- Java CLI and option definitions in `java/opendataloader-pdf-cli`
- Generated Node wrapper in `node/opendataloader-pdf`
- Generated Python wrapper and hybrid server in `python/opendataloader-pdf`
- Local browser UI in `apps/ui`
- Release-facing docs in `content/docs`
- Benchmark harness in `tests/benchmark`

## Architecture

- Layer map: [docs/architecture/LAYERS.md](docs/architecture/LAYERS.md)
- Coding rules: [generated artifacts](docs/golden-principles/generated-artifacts.md), [thin wrappers and entry points](docs/golden-principles/thin-wrappers.md), [validation](docs/golden-principles/validation.md), [public surface](docs/golden-principles/public-surface.md)
- Review routing: [docs/guides/AGENT_REVIEW.md](docs/guides/AGENT_REVIEW.md)
- Optional review helper: [docs/guides/CODE_REVIEW_GRAPH.md](docs/guides/CODE_REVIEW_GRAPH.md)

## Must Know

- After changing CLI options in Java, run `npm run sync`. This regenerates `options.json` plus the Python and Node bindings.
- `content/docs/` syncs to opendataloader.org on release. Treat edits there as public product changes.
- `--enrich-formula` and `--enrich-picture-description` only work in hybrid mode when the client also uses `--hybrid-mode full`.
- The Java modules are the source of truth. Wrappers should stay thin and should not reimplement parsing behavior.
- `code-review-graph` is optional context narrowing for agents. It does not replace the review checklist, boundary rules, or required validation.

## Core Commands

- `npm run check:harness` runs the repo boundary and doc-link checks.
- `./scripts/build-all.sh` runs the release-style Java, Python, and Node build flow.
- `./scripts/test-java.sh`, `./scripts/test-python.sh`, and `./scripts/test-node.sh` run stack-specific local tests.
- `cd tests/benchmark && uv run python run.py --check-regression` runs the benchmark gate.
- `python apps/ui/scripts/run_dev.py` starts the local UI.

## Observability

- Java uses `java.util.logging`.
- Python services and the benchmark harness use the standard `logging` module.
- Use the CLI `--quiet` flag when comparing outputs or running wrapper integration tests without log noise.

## Where To Look First

| Task | Start here |
| --- | --- |
| Parser behavior, output shape, safety filters | `java/opendataloader-pdf-core` |
| CLI flags, option wiring, generated bindings | `java/opendataloader-pdf-cli` then `npm run sync` |
| Python wrapper or hybrid server | `python/opendataloader-pdf/src/opendataloader_pdf` |
| Node wrapper | `node/opendataloader-pdf/src` |
| Local browser workflow | `apps/ui/backend/app` and `apps/ui/frontend/src` |
| Public docs or website content | `content/docs` |
| Accuracy or regression checks | `tests/benchmark` |

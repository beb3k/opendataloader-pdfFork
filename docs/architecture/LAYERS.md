# Layers

This repo is a multi-language packaging tree around one parser core. Keep dependencies flowing downward from product surfaces to the Java engine, not sideways between surfaces.

## Layer Map

1. Java core: `java/opendataloader-pdf-core`
2. Java CLI: `java/opendataloader-pdf-cli`
3. Generated wrappers: `python/opendataloader-pdf`, `node/opendataloader-pdf`
4. Local UI: `apps/ui/backend`, `apps/ui/frontend`
5. Supporting surfaces: `tests`, `examples`, `content/docs`, `docs`

## Allowed Dependency Directions

| Layer | Purpose | Allowed to depend on | Must not depend on |
| --- | --- | --- | --- |
| Java core | Parsing, structure extraction, safety logic, format generation | libraries and internal core packages | CLI module, wrappers, UI code, docs, tests |
| Java CLI | Command-line entry point and option definitions | Java core | wrappers, UI code |
| Generated wrappers | Thin language bindings over the packaged CLI | their own package code, generated option files, packaged CLI artifact | UI source trees, benchmark code, docs, test helpers |
| Local UI backend | FastAPI layer for the browser UI | installed `opendataloader-pdf` package, backend-local modules | repo-internal wrapper source hacks, Node source, Java source |
| Local UI frontend | React browser client | frontend-local modules, backend HTTP API | backend Python modules, Java source, wrapper source |
| Tests, examples, docs | Validation and guidance | any runtime layer they exercise | becoming the source of truth for runtime behavior |

## Source Of Truth Rules

- Parser behavior lives in Java core.
- CLI flags live in the Java CLI. Generated bindings are derived artifacts, not hand-maintained APIs.
- The UI talks to the installed Python package boundary, not to repo-internal source paths.
- Docs explain behavior but do not replace tests, scripts, or CI checks.

## Generated Artifact Flow

1. Change CLI options in `java/opendataloader-pdf-cli`.
2. Run `npm run sync`.
3. Commit regenerated `options.json`, Python bindings, and Node bindings together.

## Common Violations And Fixes

- Wrapper starts adding parsing logic:
  Move the behavior into Java core or CLI, then regenerate bindings if the API changed.
- UI imports repo source from the Python wrapper:
  Depend on the installed `opendataloader-pdf` package interface instead.
- Core starts importing CLI classes:
  Move shared code into Java core and keep CLI as a thin adapter.
- Docs or tests become the only place a rule exists:
  Encode it in a script, test, or workflow and link back here.

## Enforcement

- Run `npm run check:harness` for boundary and doc-link validation.
- The boundary checker fails with file-specific messages that point back to this document.

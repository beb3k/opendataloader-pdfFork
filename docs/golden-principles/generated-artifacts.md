# Generated Artifacts

## Do

- Treat the Java CLI option definitions as the source of truth.
- Regenerate `options.json` and both language bindings with `npm run sync` after option changes.
- Review generated files together with the Java option change that caused them.

## Don't

- Hand-edit generated Python or Node option files as a standalone change.
- Land Java CLI option changes without the regenerated outputs.
- Hide binding drift inside unrelated commits.

## Why

This repo ships one CLI surface through multiple language wrappers. Drift between Java and the generated wrappers creates silent breakage.

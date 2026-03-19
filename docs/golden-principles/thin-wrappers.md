# Thin Wrappers And Entry Points

## Do

- Keep Java core as the home of parsing, structure, and output behavior.
- Keep the Java CLI focused on argument parsing and config wiring.
- Keep the Python and Node packages thin adapters over the packaged CLI.
- Keep the UI backend focused on request handling and job orchestration.

## Don't

- Reimplement parser behavior in Python, Node, or the UI backend.
- Reach across package boundaries because a local import feels convenient.
- Make tests or docs the only place a runtime rule is enforced.

## Why

The repo has several delivery surfaces, but only one parser engine. Thin boundaries make fixes land once and stay consistent everywhere.

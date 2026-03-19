# Public Surface

## Do

- Treat `content/docs/` as release-facing content.
- Keep option names, examples, and wrapper behavior aligned across Java, Python, Node, and docs.
- Flag changes that affect published APIs, CLI help text, generated bindings, or benchmark claims.

## Don't

- Edit `content/docs/` casually as if it were internal notes.
- Change wrapper or CLI behavior without checking whether examples and docs still match.
- Leave public claims unverified after changing parser output or benchmarks.

## Why

This repo ships code, wrappers, benchmarks, and website content from one tree. Public-facing drift is easy to create and expensive to unwind.

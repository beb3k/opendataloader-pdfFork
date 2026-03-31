# CLAUDE.md

Read [AGENTS.md](AGENTS.md) first. It is the canonical repo map.

## Review Focus

- If `code-review-graph` is available, use it to narrow the first pass of review, then fall back to direct file reads as needed.
- Use [docs/architecture/LAYERS.md](docs/architecture/LAYERS.md) for package boundaries.
- Use [docs/guides/AGENT_REVIEW.md](docs/guides/AGENT_REVIEW.md) for validation and escalation rules.
- If Java CLI options changed, confirm `npm run sync` was run.
- If parsing behavior changed, expect benchmark validation or a clear reason it was skipped.
- If `content/docs/` changed, review it as release-facing product copy.
- Do not treat graph output as permission to skip required docs, generated-artifact checks, benchmark checks, or public-surface review.

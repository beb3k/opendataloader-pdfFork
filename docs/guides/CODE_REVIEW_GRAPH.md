# Code Review Graph

Use this guide when you want `code-review-graph` to help an agent review this repo with less broad file-reading.

## Purpose

`code-review-graph` is an optional helper. It can narrow the first pass of review to likely callers, dependents, and nearby tests.

It does **not** replace:

- [AGENTS.md](../../AGENTS.md)
- [../architecture/LAYERS.md](../architecture/LAYERS.md)
- [AGENT_REVIEW.md](AGENT_REVIEW.md)
- `npm run sync` after Java CLI option changes
- benchmark checks for parser behavior changes
- public-surface review for `content/docs/`

## Install

For Codex desktop or Codex CLI, register it as a global MCP server:

```text
codex mcp add code-review-graph -- code-review-graph serve
```

If `code-review-graph` is not on `PATH`, point Codex at the full executable path instead.

Install the package first if needed:

```text
pip install code-review-graph
```

Claude users can still use the upstream Claude plugin flow:

```text
claude plugin marketplace add tirth8205/code-review-graph
claude plugin install code-review-graph@code-review-graph
```

Restart the app after changing Codex or Claude MCP configuration. Upstream requires Python 3.10+ and `uv`.

## Repo Setup

- The repo commits `.code-review-graphignore` so the graph skips build outputs, caches, benchmark predictions, and bulky generated experiment artifacts.
- The graph stores local state in `.code-review-graph/`, which is gitignored.

## Recommended Use In This Repo

1. Build or update the graph for the current checkout.
2. Ask for the impact radius or review context for the files you changed.
3. Read the suggested files first.
4. Then read any repo-mandated docs or generated outputs the normal review checklist requires.
5. Run the narrowest validation that proves the change still works.

## When To Distrust A Narrow Graph Result

Read beyond the graph result when the change touches:

- `java/opendataloader-pdf-cli`, because wrapper regeneration may be required
- `content/docs/`, because those changes ship publicly
- `tests/benchmark`, because parser changes can move regression gates
- `scripts/`, `.github/workflows/`, or repo docs, because release and review wiring is not just code structure
- generated wrapper outputs, because the Java CLI remains the source of truth

## Useful Upstream Commands

```text
code-review-graph build
code-review-graph update
code-review-graph status
code-review-graph visualize
```

Claude can also use the upstream slash commands after the plugin is installed:

```text
/code-review-graph:build-graph
/code-review-graph:review-delta
/code-review-graph:review-pr
```

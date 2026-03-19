# Validation

## Do

- Run the narrowest command that proves the area you changed still works.
- Run the benchmark gate for parser changes or threshold-sensitive work.
- Run `npm run check:harness` after moving files, changing repo docs, or editing boundaries.
- Call out when a command depends on local tooling such as Java, Maven, `uv`, or `pnpm`.

## Don't

- Assume wrapper changes are safe without exercising the package entry point.
- Change parser behavior without checking whether the benchmark expectations moved.
- Rely on memory for repo rules when a script can check them.

## Useful Commands

- `npm run check:harness`
- `./scripts/build-all.sh`
- `./scripts/test-java.sh`
- `./scripts/test-python.sh`
- `./scripts/test-node.sh`
- `cd tests/benchmark && uv run python run.py --check-regression`

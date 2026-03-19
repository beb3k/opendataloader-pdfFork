#!/usr/bin/env python3
"""Repo harness checks for architecture boundaries and doc links."""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
LAYERS_DOC = REPO_ROOT / "docs" / "architecture" / "LAYERS.md"

REQUIRED_DOCS = [
    REPO_ROOT / "AGENTS.md",
    REPO_ROOT / "CLAUDE.md",
    LAYERS_DOC,
    REPO_ROOT / "docs" / "golden-principles" / "generated-artifacts.md",
    REPO_ROOT / "docs" / "golden-principles" / "thin-wrappers.md",
    REPO_ROOT / "docs" / "golden-principles" / "validation.md",
    REPO_ROOT / "docs" / "golden-principles" / "public-surface.md",
    REPO_ROOT / "docs" / "guides" / "AGENT_REVIEW.md",
]

MARKDOWN_LINK_SOURCES = REQUIRED_DOCS

JAVA_CORE_ROOTS = [
    REPO_ROOT / "java" / "opendataloader-pdf-core" / "src" / "main" / "java",
    REPO_ROOT / "java" / "opendataloader-pdf-core" / "src" / "test" / "java",
]

PYTHON_RULES = [
    (
        REPO_ROOT / "python" / "opendataloader-pdf" / "src" / "opendataloader_pdf",
        {"app", "apps", "tests", "docs", "examples"},
        "Python wrapper code must stay independent of UI, docs, and tests.",
    ),
    (
        REPO_ROOT / "apps" / "ui" / "backend" / "app",
        {"tests", "docs", "examples"},
        "UI backend code should depend on installed package interfaces, not test or docs modules.",
    ),
]

TS_RULES = [
    (
        REPO_ROOT / "node" / "opendataloader-pdf" / "src",
        "Node wrapper source must not reach outside its own src tree. See docs/architecture/LAYERS.md.",
    ),
    (
        REPO_ROOT / "apps" / "ui" / "frontend" / "src",
        "UI frontend source must stay inside frontend/src and the backend HTTP boundary.",
    ),
]

JAVA_IMPORT_RE = re.compile(r"^\s*import\s+([a-zA-Z0-9_.]+);", re.MULTILINE)
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
FROM_IMPORT_RE = re.compile(r"""from\s+["']([^"']+)["']""")
SIDE_EFFECT_IMPORT_RE = re.compile(r"""import\s+["']([^"']+)["']""")


def main() -> int:
    errors: list[str] = []
    check_required_docs(errors)
    check_markdown_links(errors)
    check_java_boundaries(errors)
    check_python_boundaries(errors)
    check_ts_boundaries(errors)

    if errors:
        print("Harness checks failed:")
        for error in errors:
            print(f"- {error}")
        print(f"See {LAYERS_DOC.relative_to(REPO_ROOT)} for the dependency rules.")
        return 1

    print("Harness checks passed.")
    return 0


def check_required_docs(errors: list[str]) -> None:
    for path in REQUIRED_DOCS:
        if not path.exists():
            errors.append(f"Missing required harness file: {path.relative_to(REPO_ROOT)}")


def check_markdown_links(errors: list[str]) -> None:
    for path in MARKDOWN_LINK_SOURCES:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for raw_target in MARKDOWN_LINK_RE.findall(text):
            target = raw_target.split("#", 1)[0].strip()
            if not target or "://" in target or target.startswith("mailto:"):
                continue
            resolved = (path.parent / target).resolve()
            if not resolved.exists():
                errors.append(
                    f"{path.relative_to(REPO_ROOT)} has a broken local link: {raw_target}"
                )


def check_java_boundaries(errors: list[str]) -> None:
    for root in JAVA_CORE_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*.java"):
            text = path.read_text(encoding="utf-8")
            for imported in JAVA_IMPORT_RE.findall(text):
                if imported.startswith("org.opendataloader.pdf.cli"):
                    errors.append(
                        f"{path.relative_to(REPO_ROOT)} imports CLI code into java core. "
                        "Move shared code into java/opendataloader-pdf-core instead."
                    )


def check_python_boundaries(errors: list[str]) -> None:
    for root, forbidden, message in PYTHON_RULES:
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        first = alias.name.split(".", 1)[0]
                        if first in forbidden:
                            errors.append(
                                f"{path.relative_to(REPO_ROOT)} imports '{alias.name}'. {message}"
                            )
                elif isinstance(node, ast.ImportFrom):
                    if node.level > 0 or node.module is None:
                        continue
                    first = node.module.split(".", 1)[0]
                    if first in forbidden:
                        errors.append(
                            f"{path.relative_to(REPO_ROOT)} imports '{node.module}'. {message}"
                        )


def check_ts_boundaries(errors: list[str]) -> None:
    for root, message in TS_RULES:
        if not root.exists():
            continue
        for path in iter_source_files(root, {".ts", ".tsx"}):
            text = path.read_text(encoding="utf-8")
            specifiers = FROM_IMPORT_RE.findall(text) + SIDE_EFFECT_IMPORT_RE.findall(text)
            for specifier in specifiers:
                if not specifier.startswith("."):
                    continue
                resolved = (path.parent / specifier).resolve()
                if not is_relative_to(resolved, root.resolve()):
                    errors.append(
                        f"{path.relative_to(REPO_ROOT)} imports '{specifier}' outside {root.relative_to(REPO_ROOT)}. {message}"
                    )


def iter_source_files(root: Path, suffixes: set[str]) -> list[Path]:
    return [
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix in suffixes
    ]


def is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


if __name__ == "__main__":
    sys.exit(main())

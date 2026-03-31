from __future__ import annotations

from pathlib import Path
from subprocess import CompletedProcess

import pytest

from opendataloader_pdf import runner


def test_java_command_from_home_returns_java_binary(tmp_path: Path) -> None:
    java_home = tmp_path / "jdk-22"
    java_bin = java_home / "bin" / runner.java_binary_name()
    java_bin.parent.mkdir(parents=True, exist_ok=True)
    java_bin.write_text("", encoding="utf-8")

    assert runner.java_command_from_home(str(java_home)) == str(java_bin)


def test_parse_java_major_version_supports_legacy_and_modern_versions() -> None:
    assert runner.parse_java_major_version('java version "1.8.0_451"\n') == 8
    assert runner.parse_java_major_version('openjdk version "17.0.10" 2024-01-16\n') == 17


def test_ensure_supported_java_version_rejects_java_8(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(*_args: object, **_kwargs: object) -> CompletedProcess[str]:
        return CompletedProcess(
            args=["java", "-version"],
            returncode=0,
            stdout="",
            stderr='java version "1.8.0_451"\n',
        )

    monkeypatch.setattr(runner.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="Java 11 or newer"):
        runner.ensure_supported_java_version("java")

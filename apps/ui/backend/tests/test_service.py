from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pytest

from app.models import JobOptions, JobRecord, utc_now
from app.service import (
    InvalidJobRequestError,
    JobService,
    build_convert_kwargs,
    configure_java_runtime,
    normalize_conversion_error,
)

MINIMAL_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def fake_converter(input_path: str, **kwargs: object) -> None:
    output_dir = Path(str(kwargs["output_dir"]))
    formats = kwargs["format"]
    assert isinstance(formats, list)
    base_name = Path(input_path).stem
    page_suffix = _page_suffix(kwargs)

    for fmt in formats:
        extension = _output_extension(str(fmt))

        match str(fmt):
            case "markdown" | "markdown-with-html" | "markdown-with-images":
                (output_dir / f"{base_name}.{extension}").write_text(
                    f"# Preview{page_suffix}\n\nConverted",
                    encoding="utf-8",
                )
            case "json":
                (output_dir / f"{base_name}.{extension}").write_text(
                    f'{{"page": {_page_number(kwargs)}}}',
                    encoding="utf-8",
                )
            case "html":
                (output_dir / f"{base_name}.{extension}").write_text(
                    f"<p>Converted{page_suffix}</p>",
                    encoding="utf-8",
                )
            case "text":
                (output_dir / f"{base_name}.{extension}").write_text(
                    f"Converted{page_suffix}",
                    encoding="utf-8",
                )
            case _:
                (output_dir / f"{base_name}.{extension}").write_text("placeholder", encoding="utf-8")


def _page_suffix(kwargs: dict[str, Any]) -> str:
    pages = kwargs.get("pages")
    if not pages:
        return ""

    return f" page {pages}"


def _page_number(kwargs: dict[str, Any]) -> int:
    pages = kwargs.get("pages")
    if not pages:
        return 0

    return int(str(pages))


def _output_extension(fmt: str) -> str:
    if fmt.startswith("markdown"):
        return "md"
    if fmt == "text":
        return "txt"

    return fmt


def test_build_convert_kwargs_maps_core_options(tmp_path: Path) -> None:
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    options = JobOptions(
        output_formats=["markdown", "json", "html"],
        pages="1,3-4",
        sanitize=True,
        keep_line_breaks=True,
        include_header_footer=True,
        use_struct_tree=True,
        table_method="cluster",
        reading_order="xycut",
        image_output="external",
        image_format="png",
    )

    kwargs = build_convert_kwargs(options, output_dir)

    assert kwargs["output_dir"] == str(output_dir)
    assert kwargs["format"] == ["markdown", "json", "html"]
    assert kwargs["pages"] == "1,3-4"
    assert kwargs["sanitize"] is True
    assert kwargs["keep_line_breaks"] is True
    assert kwargs["include_header_footer"] is True
    assert kwargs["use_struct_tree"] is True
    assert kwargs["table_method"] == "cluster"
    assert kwargs["reading_order"] == "xycut"
    assert kwargs["image_output"] == "external"
    assert kwargs["image_format"] == "png"
    assert kwargs["image_dir"] == str(output_dir / "images")


def test_build_convert_kwargs_only_passes_hybrid_when_enabled(tmp_path: Path) -> None:
    output_dir = tmp_path / "output"
    output_dir.mkdir()

    disabled_kwargs = build_convert_kwargs(
        JobOptions(
            output_formats=["markdown"],
            hybrid_enabled=False,
            hybrid_backend="docling-fast",
            hybrid_url="http://localhost:8000",
            hybrid_timeout=1234,
            hybrid_fallback=True,
        ),
        output_dir,
    )
    assert "hybrid" not in disabled_kwargs
    assert "hybrid_url" not in disabled_kwargs
    assert "hybrid_timeout" not in disabled_kwargs
    assert "hybrid_fallback" not in disabled_kwargs

    enabled_kwargs = build_convert_kwargs(
        JobOptions(
            output_formats=["markdown"],
            hybrid_enabled=True,
            hybrid_backend="docling-fast",
            hybrid_mode="full",
            hybrid_url="http://localhost:8000",
            hybrid_timeout=1234,
            hybrid_fallback=True,
        ),
        output_dir,
    )
    assert enabled_kwargs["hybrid"] == "docling-fast"
    assert enabled_kwargs["hybrid_mode"] == "full"
    assert enabled_kwargs["hybrid_url"] == "http://localhost:8000"
    assert enabled_kwargs["hybrid_timeout"] == "1234"
    assert enabled_kwargs["hybrid_fallback"] is True


def test_normalize_conversion_error_makes_java_version_failures_readable() -> None:
    raw_error = RuntimeError(
        "Error running opendataloader-pdf CLI.\n"
        "Return code: 1\n"
        "Stderr: Exception in thread \"main\" java.lang.UnsupportedClassVersionError: ..."
    )

    message = normalize_conversion_error(raw_error)

    assert "Java 11 or newer" in message
    assert "UnsupportedClassVersionError" not in message


def test_configure_java_runtime_puts_preferred_java_first(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    java_home = tmp_path / "jdk-22"
    java_bin = java_home / "bin"
    java_bin.mkdir(parents=True, exist_ok=True)
    (java_bin / "java.exe").write_text("", encoding="utf-8")

    monkeypatch.setattr("app.service.find_preferred_java_home", lambda: java_home)
    monkeypatch.setenv("PATH", r"C:\legacy-java;C:\tools")
    monkeypatch.delenv("JAVA_HOME", raising=False)

    configure_java_runtime()

    assert Path(str(os.environ["JAVA_HOME"])) == java_home
    assert os.environ["PATH"].split(";")[0] == str(java_bin)


def test_build_page_preview_returns_selected_page_content(tmp_path: Path) -> None:
    service = JobService(base_dir=tmp_path / "jobs", converter=fake_converter)
    workspace = tmp_path / "jobs" / "job-1"
    input_path = workspace / "input" / "sample.pdf"
    output_dir = workspace / "output"
    input_path.parent.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    input_path.write_bytes(MINIMAL_PDF)
    (output_dir / "sample.md").write_text("# Preview\n\nConverted", encoding="utf-8")
    (output_dir / "sample.txt").write_text("Converted", encoding="utf-8")
    (output_dir / "sample.json").write_text('{"page": 0}', encoding="utf-8")

    service._jobs["job-1"] = JobRecord(
        id="job-1",
        filename="sample.pdf",
        options=JobOptions(output_formats=["markdown", "text", "json"]),
        workspace_dir=workspace,
        input_path=input_path,
        output_dir=output_dir,
        status="succeeded",
        created_at=utc_now(),
        updated_at=utc_now(),
    )

    markdown_preview = service.build_page_preview("job-1", "sample.md", 2)
    text_preview = service.build_page_preview("job-1", "sample.txt", 3)
    json_preview = service.build_page_preview("job-1", "sample.json", 4)

    assert markdown_preview.kind == "markdown"
    assert markdown_preview.content == "# Preview page 2\n\nConverted"
    assert text_preview.kind == "text"
    assert text_preview.content == "Converted page 3"
    assert json_preview.kind == "json"
    assert json_preview.content == '{"page": 4}'


def test_build_page_preview_returns_html_content_for_selected_page(tmp_path: Path) -> None:
    service = JobService(base_dir=tmp_path / "jobs", converter=fake_converter)
    workspace = tmp_path / "jobs" / "job-1"
    input_path = workspace / "input" / "sample.pdf"
    output_dir = workspace / "output"
    input_path.parent.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    input_path.write_bytes(MINIMAL_PDF)
    (output_dir / "sample.html").write_text("<p>Converted</p>", encoding="utf-8")

    service._jobs["job-1"] = JobRecord(
        id="job-1",
        filename="sample.pdf",
        options=JobOptions(output_formats=["html"]),
        workspace_dir=workspace,
        input_path=input_path,
        output_dir=output_dir,
        status="succeeded",
        created_at=utc_now(),
        updated_at=utc_now(),
    )

    html_preview = service.build_page_preview("job-1", "sample.html", 2)

    assert html_preview.kind == "html"
    assert html_preview.content == "<p>Converted page 2</p>"


def test_build_page_preview_rejects_page_numbers_below_one(tmp_path: Path) -> None:
    service = JobService(base_dir=tmp_path / "jobs", converter=fake_converter)

    with pytest.raises(InvalidJobRequestError, match="Page number must be positive"):
        service.build_page_preview("job-1", "sample.html", 0)

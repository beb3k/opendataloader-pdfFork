from __future__ import annotations

from pathlib import Path

from app.models import JobOptions
from app.service import build_convert_kwargs, normalize_conversion_error


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

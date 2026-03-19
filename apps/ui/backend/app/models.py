from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

OUTPUT_FORMATS = {
    "json",
    "text",
    "html",
    "pdf",
    "markdown",
    "markdown-with-html",
    "markdown-with-images",
}
TABLE_METHODS = {"default", "cluster"}
READING_ORDERS = {"off", "xycut"}
IMAGE_OUTPUTS = {"off", "embedded", "external"}
IMAGE_FORMATS = {"png", "jpeg"}
HYBRID_BACKENDS = {"docling-fast"}
HYBRID_MODES = {"auto", "full"}
PREVIEW_EXTENSIONS = {
    ".md": "markdown",
    ".markdown": "markdown",
    ".json": "json",
    ".html": "html",
    ".htm": "html",
    ".txt": "text",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class JobOptions(BaseModel):
    output_formats: list[str] = Field(default_factory=lambda: ["markdown"])
    pages: str | None = None
    sanitize: bool = False
    keep_line_breaks: bool = False
    include_header_footer: bool = False
    use_struct_tree: bool = False
    table_method: str | None = None
    reading_order: str | None = None
    image_output: str | None = None
    image_format: str | None = None
    advanced_enabled: bool = False
    hybrid_enabled: bool = False
    hybrid_backend: str | None = None
    hybrid_mode: str | None = None
    hybrid_url: str | None = None
    hybrid_timeout: int | None = None
    hybrid_fallback: bool = False

    @field_validator("output_formats")
    @classmethod
    def validate_output_formats(cls, value: list[str]) -> list[str]:
        cleaned = []
        seen = set()
        for item in value:
            if item not in OUTPUT_FORMATS:
                raise ValueError(f"Unsupported output format: {item}")
            if item not in seen:
                cleaned.append(item)
                seen.add(item)
        if not cleaned:
            raise ValueError("Select at least one output format")
        return cleaned

    @field_validator("pages")
    @classmethod
    def validate_pages(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        parts = [part.strip() for part in value.split(",")]
        if not all(parts):
            raise ValueError("Page range contains an empty segment")
        for part in parts:
            if "-" in part:
                start, end, *rest = part.split("-")
                if rest or not start.isdigit() or not end.isdigit():
                    raise ValueError("Page range must use numbers like 1,3,5-7")
                if int(start) < 1 or int(end) < int(start):
                    raise ValueError("Page range must be positive and ordered")
            else:
                if not part.isdigit() or int(part) < 1:
                    raise ValueError("Page range must use positive page numbers")
        return value

    @field_validator("table_method")
    @classmethod
    def validate_table_method(cls, value: str | None) -> str | None:
        if value is None or value in TABLE_METHODS:
            return value
        raise ValueError(f"Unsupported table method: {value}")

    @field_validator("reading_order")
    @classmethod
    def validate_reading_order(cls, value: str | None) -> str | None:
        if value is None or value in READING_ORDERS:
            return value
        raise ValueError(f"Unsupported reading order: {value}")

    @field_validator("image_output")
    @classmethod
    def validate_image_output(cls, value: str | None) -> str | None:
        if value is None or value in IMAGE_OUTPUTS:
            return value
        raise ValueError(f"Unsupported image output mode: {value}")

    @field_validator("image_format")
    @classmethod
    def validate_image_format(cls, value: str | None) -> str | None:
        if value is None or value in IMAGE_FORMATS:
            return value
        raise ValueError(f"Unsupported image format: {value}")

    @field_validator("hybrid_backend")
    @classmethod
    def validate_hybrid_backend(cls, value: str | None) -> str | None:
        if value is None or value in HYBRID_BACKENDS:
            return value
        raise ValueError(f"Unsupported hybrid backend: {value}")

    @field_validator("hybrid_mode")
    @classmethod
    def validate_hybrid_mode(cls, value: str | None) -> str | None:
        if value is None or value in HYBRID_MODES:
            return value
        raise ValueError(f"Unsupported hybrid mode: {value}")

    @field_validator("hybrid_timeout")
    @classmethod
    def validate_hybrid_timeout(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value < 1:
            raise ValueError("Hybrid timeout must be a positive number")
        return value

    @model_validator(mode="after")
    def validate_hybrid_settings(self) -> "JobOptions":
        if self.hybrid_enabled and not self.hybrid_backend:
            raise ValueError("Choose a hybrid backend before enabling hybrid mode")
        if self.image_format and self.image_output == "off":
            raise ValueError("Image format cannot be set when image output is off")
        return self


class PreviewPayload(BaseModel):
    kind: Literal["markdown", "json", "html", "text"]
    content: str


class JobFile(BaseModel):
    name: str
    kind: Literal["markdown", "json", "html", "text", "pdf", "image", "other"]
    sizeLabel: str | None = None
    preview: PreviewPayload | None = None


class JobResponse(BaseModel):
    id: str
    status: Literal["queued", "running", "complete", "failed"]
    progress: int
    message: str
    sourceName: str
    files: list[JobFile] = Field(default_factory=list)


class JobRecord(BaseModel):
    id: str
    filename: str
    options: JobOptions
    workspace_dir: Path
    input_path: Path
    output_dir: Path
    status: Literal["queued", "running", "succeeded", "failed"] = "queued"
    error: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

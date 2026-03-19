from __future__ import annotations

import importlib
import importlib.metadata as metadata
import json
import mimetypes
import shutil
import tempfile
import threading
import uuid
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from pydantic import ValidationError

from .models import JobFile, JobOptions, JobRecord, JobResponse, PREVIEW_EXTENSIONS, PreviewPayload, utc_now

MAX_PREVIEW_BYTES = 250_000


class ActiveJobError(RuntimeError):
    """Raised when a new job is submitted while another is still running."""


class JobNotFoundError(RuntimeError):
    """Raised when a job id cannot be found."""


class InvalidJobRequestError(RuntimeError):
    """Raised when the request payload is invalid."""


def normalize_conversion_error(error: Exception) -> str:
    message = str(error)
    if "UnsupportedClassVersionError" in message:
        return (
            "OpenDataLoader PDF needs Java 11 or newer. "
            "This machine is currently using an older Java runtime, so the conversion could not start."
        )
    if "Error running opendataloader-pdf CLI." in message:
        lines = [line.strip() for line in message.splitlines() if line.strip()]
        stderr_lines = [line for line in lines if not line.startswith("Return code:")]
        if len(stderr_lines) > 1:
            return stderr_lines[-1]
        return "OpenDataLoader PDF could not complete the conversion."
    return message


def repo_root_from_here() -> Path:
    return Path(__file__).resolve().parents[4]


def load_installed_converter() -> Callable[..., None]:
    repo_root = repo_root_from_here()
    source_package_dir = repo_root / "python" / "opendataloader-pdf" / "src" / "opendataloader_pdf"
    try:
        metadata.distribution("opendataloader-pdf")
    except metadata.PackageNotFoundError as exc:
        raise RuntimeError(
            "The published opendataloader-pdf package is not installed. Install it with pip before starting the local UI."
        ) from exc

    module = importlib.import_module("opendataloader_pdf")
    module_path = Path(module.__file__).resolve()
    if source_package_dir == module_path.parent.resolve():
        raise RuntimeError(
            "The opendataloader-pdf import resolves inside this repository. "
            "Install the published package and start the UI without pointing Python at the repo sources."
        )

    return getattr(module, "convert")


def parse_options(raw_options: str | None) -> JobOptions:
    if not raw_options:
        return JobOptions()
    try:
        payload = json.loads(raw_options)
    except json.JSONDecodeError as exc:
        raise InvalidJobRequestError("Options must be valid JSON") from exc

    normalized_payload = normalize_ui_options(payload)

    try:
        return JobOptions.model_validate(normalized_payload)
    except ValidationError as exc:
        error = exc.errors()[0]
        raise InvalidJobRequestError(error["msg"]) from exc


def normalize_ui_options(payload: dict[str, Any]) -> dict[str, Any]:
    if "output_formats" in payload:
        return payload

    formats = list(payload.get("formats", []))
    markdown_style = payload.get("markdownStyle", "plain")
    output_formats: list[str] = []

    for item in formats:
        if item == "markdown":
            if markdown_style == "html":
                output_formats.append("markdown-with-html")
            elif markdown_style == "images":
                output_formats.append("markdown-with-images")
            else:
                output_formats.append("markdown")
        else:
            output_formats.append(item)

    hybrid = payload.get("hybrid", {}) or {}
    hybrid_enabled = bool(hybrid.get("enabled"))

    normalized: dict[str, Any] = {
        "output_formats": output_formats or ["markdown"],
        "pages": payload.get("pageRange"),
        "sanitize": payload.get("sanitize", False),
        "keep_line_breaks": payload.get("keepLineBreaks", False),
        "include_header_footer": payload.get("includeHeaderFooter", False),
        "use_struct_tree": payload.get("useStructTree", False),
        "table_method": payload.get("tableMethod"),
        "reading_order": payload.get("readingOrder"),
        "image_output": payload.get("imageOutput"),
        "image_format": payload.get("imageFormat"),
        "advanced_enabled": True,
        "hybrid_enabled": hybrid_enabled,
    }

    if hybrid_enabled:
        normalized.update(
            {
                "hybrid_backend": hybrid.get("engine"),
                "hybrid_mode": hybrid.get("mode"),
                "hybrid_url": hybrid.get("url") or None,
                "hybrid_timeout": int(hybrid["timeoutMs"]) if hybrid.get("timeoutMs") else None,
                "hybrid_fallback": hybrid.get("fallback", False),
            }
        )

    return normalized


def build_convert_kwargs(options: JobOptions, output_dir: Path) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "output_dir": str(output_dir),
        "format": options.output_formats,
        "quiet": True,
    }

    if options.pages:
        kwargs["pages"] = options.pages
    if options.sanitize:
        kwargs["sanitize"] = True
    if options.keep_line_breaks:
        kwargs["keep_line_breaks"] = True
    if options.include_header_footer:
        kwargs["include_header_footer"] = True
    if options.use_struct_tree:
        kwargs["use_struct_tree"] = True
    if options.table_method:
        kwargs["table_method"] = options.table_method
    if options.reading_order:
        kwargs["reading_order"] = options.reading_order
    if options.image_output:
        kwargs["image_output"] = options.image_output
    if options.image_format:
        kwargs["image_format"] = options.image_format
    if options.image_output == "external":
        kwargs["image_dir"] = str(output_dir / "images")

    if options.hybrid_enabled:
        kwargs["hybrid"] = options.hybrid_backend
        kwargs["hybrid_mode"] = options.hybrid_mode or "auto"
        if options.hybrid_url:
            kwargs["hybrid_url"] = options.hybrid_url
        if options.hybrid_timeout is not None:
            kwargs["hybrid_timeout"] = str(options.hybrid_timeout)
        if options.hybrid_fallback:
            kwargs["hybrid_fallback"] = True

    return kwargs


class JobService:
    def __init__(
        self,
        base_dir: Path | None = None,
        converter: Callable[..., None] | None = None,
    ) -> None:
        self.base_dir = base_dir or Path(tempfile.gettempdir()) / "opendataloader-pdf-ui"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.converter = converter or load_installed_converter()
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()
        self.cleanup_workspace_root()

    def cleanup_workspace_root(self) -> None:
        for child in self.base_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                child.unlink(missing_ok=True)

    def _cleanup_finished_jobs_locked(self) -> None:
        removable = [job_id for job_id, job in self._jobs.items() if job.status not in {"queued", "running"}]
        for job_id in removable:
            workspace = self._jobs[job_id].workspace_dir
            shutil.rmtree(workspace, ignore_errors=True)
            del self._jobs[job_id]

    def create_job(self, upload: UploadFile, options: JobOptions) -> JobRecord:
        if not upload.filename or not upload.filename.lower().endswith(".pdf"):
            raise InvalidJobRequestError("Upload a single PDF file")

        with self._lock:
            active = [job for job in self._jobs.values() if job.status in {"queued", "running"}]
            if active:
                raise ActiveJobError("Only one active job is supported right now")

            self._cleanup_finished_jobs_locked()

            job_id = uuid.uuid4().hex
            workspace_dir = self.base_dir / job_id
            input_dir = workspace_dir / "input"
            output_dir = workspace_dir / "output"
            input_dir.mkdir(parents=True, exist_ok=True)
            output_dir.mkdir(parents=True, exist_ok=True)

            safe_name = Path(upload.filename).name
            input_path = input_dir / safe_name
            with input_path.open("wb") as handle:
                shutil.copyfileobj(upload.file, handle)

            record = JobRecord(
                id=job_id,
                filename=safe_name,
                options=options,
                workspace_dir=workspace_dir,
                input_path=input_path,
                output_dir=output_dir,
            )
            self._jobs[job_id] = record
            return record

    def run_job(self, job_id: str) -> None:
        with self._lock:
            record = self._require_job(job_id)
            record.status = "running"
            record.updated_at = utc_now()

        try:
            kwargs = build_convert_kwargs(record.options, record.output_dir)
            self.converter(str(record.input_path), **kwargs)
        except Exception as exc:  # pragma: no cover
            with self._lock:
                record = self._require_job(job_id)
                record.status = "failed"
                record.error = normalize_conversion_error(exc)
                record.updated_at = utc_now()
            return

        with self._lock:
            record = self._require_job(job_id)
            record.status = "succeeded"
            record.updated_at = utc_now()

    def get_job_response(self, job_id: str) -> JobResponse:
        with self._lock:
            record = self._require_job(job_id)
            files = self._collect_files(record)
            return JobResponse(
                id=record.id,
                status=self._public_status(record.status),
                progress=self._progress(record.status),
                message=self._message(record),
                sourceName=record.filename,
                files=files,
            )

    def resolve_file_path(self, job_id: str, relative_name: str) -> Path:
        with self._lock:
            record = self._require_job(job_id)
            target = (record.output_dir / relative_name).resolve()
            output_root = record.output_dir.resolve()
            if output_root not in target.parents and target != output_root:
                raise JobNotFoundError("File not found")
            if not target.exists() or not target.is_file():
                raise JobNotFoundError("File not found")
            return target

    def build_bundle(self, job_id: str) -> Path:
        with self._lock:
            record = self._require_job(job_id)
            bundle_path = record.workspace_dir / "bundle.zip"
            if bundle_path.exists():
                bundle_path.unlink()

            files = [path for path in record.output_dir.rglob("*") if path.is_file()]
            if not files:
                raise JobNotFoundError("No output files are available yet")

            with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for file_path in files:
                    archive.write(file_path, arcname=file_path.relative_to(record.output_dir))

            return bundle_path

    def _require_job(self, job_id: str) -> JobRecord:
        try:
            return self._jobs[job_id]
        except KeyError as exc:
            raise JobNotFoundError("Job not found") from exc

    def _collect_files(self, record: JobRecord) -> list[JobFile]:
        results: list[JobFile] = []
        for file_path in sorted(record.output_dir.rglob("*")):
            if not file_path.is_file():
                continue
            relative = file_path.relative_to(record.output_dir).as_posix()
            preview_kind = PREVIEW_EXTENSIONS.get(file_path.suffix.lower())
            kind = self._file_kind(file_path, preview_kind)
            size_label = self._format_size(file_path.stat().st_size)
            results.append(
                JobFile(
                    name=relative,
                    kind=kind,
                    sizeLabel=size_label,
                    preview=self._build_preview(file_path, preview_kind),
                )
            )
        return results

    def _build_preview(self, file_path: Path, preview_kind: str | None) -> PreviewPayload | None:
        if not preview_kind:
            return None
        raw = file_path.read_bytes()
        content = raw[:MAX_PREVIEW_BYTES].decode("utf-8", errors="replace")
        return PreviewPayload(kind=preview_kind, content=content)

    def _file_kind(self, file_path: Path, preview_kind: str | None) -> str:
        if preview_kind:
            return preview_kind
        if file_path.suffix.lower() == ".pdf":
            return "pdf"
        mime_type = mimetypes.guess_type(file_path.name)[0] or ""
        if mime_type.startswith("image/"):
            return "image"
        return "other"

    def _format_size(self, size_bytes: int) -> str:
        if size_bytes < 1024:
            return f"{size_bytes} B"
        if size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        return f"{size_bytes / (1024 * 1024):.1f} MB"

    def _public_status(self, status: str) -> str:
        if status == "succeeded":
            return "complete"
        return status

    def _progress(self, status: str) -> int:
        if status == "queued":
            return 5
        if status == "running":
            return 55
        return 100

    def _message(self, record: JobRecord) -> str:
        if record.status == "queued":
            return "Queued for conversion."
        if record.status == "running":
            return "Conversion is in progress."
        if record.status == "succeeded":
            return "Conversion finished successfully."
        return record.error or "Conversion failed."

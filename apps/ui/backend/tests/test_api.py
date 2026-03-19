from __future__ import annotations

import io
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import JobOptions, JobRecord, utc_now
from app.service import JobService

MINIMAL_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def fake_converter(input_path: str, **kwargs: object) -> None:
    output_dir = Path(str(kwargs["output_dir"]))
    formats = kwargs["format"]
    assert isinstance(formats, list)
    base_name = Path(input_path).stem
    for fmt in formats:
        match fmt:
            case "markdown":
                (output_dir / f"{base_name}.md").write_text("# Preview\n\nConverted", encoding="utf-8")
            case "json":
                (output_dir / f"{base_name}.json").write_text('{"ok": true}', encoding="utf-8")
            case "html":
                (output_dir / f"{base_name}.html").write_text("<p>Converted</p>", encoding="utf-8")
            case "text":
                (output_dir / f"{base_name}.txt").write_text("Converted", encoding="utf-8")
            case _:
                (output_dir / f"{base_name}.{fmt}").write_text("placeholder", encoding="utf-8")


def make_client(tmp_path: Path) -> tuple[TestClient, JobService]:
    service = JobService(base_dir=tmp_path / "jobs", converter=fake_converter)
    client = TestClient(create_app(service))
    return client, service


def post_job(client: TestClient, options: dict[str, object] | None = None):
    payload = json.dumps(
        options
        or {
            "formats": ["markdown", "json", "html"],
            "markdownStyle": "plain",
            "pageRange": "",
            "sanitize": False,
            "keepLineBreaks": True,
            "includeHeaderFooter": False,
            "useStructTree": True,
            "tableMethod": "default",
            "readingOrder": "xycut",
            "imageOutput": "external",
            "imageFormat": "png",
            "hybrid": {
                "enabled": False,
                "engine": "docling-fast",
                "mode": "auto",
                "url": "",
                "timeoutMs": "30000",
                "fallback": False,
            },
        }
    )
    return client.post(
        "/jobs",
        files={
            "file": ("sample.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf"),
            "options": (None, payload),
        },
    )


def test_create_job_returns_outputs_and_previews(tmp_path: Path) -> None:
    client, _service = make_client(tmp_path)

    response = post_job(client)

    assert response.status_code == 202
    body = response.json()
    assert body["status"] in {"queued", "complete"}
    job_id = body["id"]

    status_response = client.get(f"/jobs/{job_id}")
    assert status_response.status_code == 200
    body = status_response.json()
    assert body["status"] == "complete"
    assert body["sourceName"] == "sample.pdf"
    assert body["progress"] == 100
    files = body["files"]
    assert {file["name"] for file in files} == {
        "sample.html",
        "sample.json",
        "sample.md",
    }
    assert {file["kind"] for file in files} == {"html", "json", "markdown"}
    assert {file["preview"]["kind"] for file in files if file.get("preview")} == {
        "html",
        "json",
        "markdown",
    }


def test_invalid_pages_return_readable_error(tmp_path: Path) -> None:
    client, _service = make_client(tmp_path)

    response = post_job(
        client,
        {
            "formats": ["markdown"],
            "markdownStyle": "plain",
            "pageRange": "4-2",
            "sanitize": False,
            "keepLineBreaks": True,
            "includeHeaderFooter": False,
            "useStructTree": True,
            "tableMethod": "default",
            "readingOrder": "xycut",
            "imageOutput": "external",
            "imageFormat": "png",
            "hybrid": {"enabled": False, "engine": "docling-fast", "mode": "auto", "url": "", "timeoutMs": "30000", "fallback": False},
        },
    )

    assert response.status_code == 400
    assert "Page range" in response.json()["detail"]


def test_non_pdf_upload_is_rejected(tmp_path: Path) -> None:
    client, _service = make_client(tmp_path)

    response = client.post(
        "/jobs",
        files={
            "file": ("notes.txt", io.BytesIO(b"hello"), "text/plain"),
            "options": (
                None,
                json.dumps(
                    {
                        "formats": ["markdown"],
                        "markdownStyle": "plain",
                        "pageRange": "",
                        "sanitize": False,
                        "keepLineBreaks": True,
                        "includeHeaderFooter": False,
                        "useStructTree": True,
                        "tableMethod": "default",
                        "readingOrder": "xycut",
                        "imageOutput": "external",
                        "imageFormat": "png",
                        "hybrid": {"enabled": False, "engine": "docling-fast", "mode": "auto", "url": "", "timeoutMs": "30000", "fallback": False},
                    }
                ),
            ),
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Upload a single PDF file"


def test_finished_job_cleanup_happens_before_next_job(tmp_path: Path) -> None:
    client, service = make_client(tmp_path)

    first = post_job(client, {"formats": ["markdown"], "markdownStyle": "plain"})
    first_id = first.json()["id"]
    first_workspace = service._jobs[first_id].workspace_dir
    assert first_workspace.exists()

    second = post_job(client, {"formats": ["json"], "markdownStyle": "plain"})
    second_id = second.json()["id"]

    assert second.status_code == 202
    assert second_id != first_id
    assert not first_workspace.exists()


def test_active_job_returns_conflict(tmp_path: Path) -> None:
    client, service = make_client(tmp_path)
    stuck_workspace = tmp_path / "jobs" / "stuck"
    stuck_input = stuck_workspace / "input" / "sample.pdf"
    stuck_output = stuck_workspace / "output"
    stuck_output.mkdir(parents=True)
    stuck_input.parent.mkdir(parents=True, exist_ok=True)
    stuck_input.write_bytes(MINIMAL_PDF)
    service._jobs["stuck"] = JobRecord(
        id="stuck",
        filename="sample.pdf",
        options=JobOptions(output_formats=["markdown"]),
        workspace_dir=stuck_workspace,
        input_path=stuck_input,
        output_dir=stuck_output,
        status="running",
        created_at=utc_now(),
        updated_at=utc_now(),
    )

    response = post_job(client, {"formats": ["markdown"], "markdownStyle": "plain"})

    assert response.status_code == 409
    assert "Only one active job" in response.json()["detail"]


def test_download_routes_work(tmp_path: Path) -> None:
    client, _service = make_client(tmp_path)
    response = post_job(client, {"formats": ["markdown", "json"], "markdownStyle": "plain"})
    job_id = response.json()["id"]

    file_response = client.get(f"/jobs/{job_id}/files/sample.md")
    assert file_response.status_code == 200
    assert "# Preview" in file_response.text

    bundle_response = client.get(f"/jobs/{job_id}/bundle")
    assert bundle_response.status_code == 200
    assert bundle_response.headers["content-type"] == "application/zip"

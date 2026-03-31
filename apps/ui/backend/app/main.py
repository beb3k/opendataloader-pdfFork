from __future__ import annotations

from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .models import JobResponse, PreviewPayload
from .service import ActiveJobError, InvalidJobRequestError, JobNotFoundError, JobService, parse_options


def create_app(service: JobService | None = None) -> FastAPI:
    job_service = service or JobService()
    app = FastAPI(title="OpenDataLoader PDF Local UI Backend")
    app.state.job_service = job_service
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/jobs", response_model=JobResponse, status_code=202)
    async def create_job(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        options: str | None = Form(default=None),
    ) -> JobResponse:
        try:
            parsed_options = parse_options(options)
            record = job_service.create_job(file, parsed_options)
        except InvalidJobRequestError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except ActiveJobError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        finally:
            await file.close()

        background_tasks.add_task(job_service.run_job, record.id)
        return job_service.get_job_response(record.id)

    @app.get("/jobs/{job_id}", response_model=JobResponse)
    def get_job(job_id: str) -> JobResponse:
        try:
            return job_service.get_job_response(job_id)
        except JobNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/jobs/{job_id}/files/{name:path}/preview", response_model=PreviewPayload)
    def preview_file(job_id: str, name: str, page: int = Query(..., ge=1)) -> PreviewPayload:
        try:
            return job_service.build_page_preview(job_id, name, page)
        except InvalidJobRequestError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except JobNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/jobs/{job_id}/files/{name:path}")
    def download_file(job_id: str, name: str) -> FileResponse:
        try:
            path = job_service.resolve_file_path(job_id, name)
        except JobNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return FileResponse(path, filename=Path(name).name)

    @app.get("/jobs/{job_id}/bundle")
    def download_bundle(job_id: str) -> FileResponse:
        try:
            bundle_path = job_service.build_bundle(job_id)
        except JobNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return FileResponse(bundle_path, filename=f"{job_id}.zip", media_type="application/zip")

    return app

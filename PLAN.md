# Local Web UI For OpenDataLoader PDF

## Summary
Build a separate local web app that wraps the installed `opendataloader-pdf` Python package so you can use the tool in a browser instead of the command line. V1 will optimize for a single-PDF flow, expose all output formats, keep advanced/hybrid options tucked behind an expandable panel, and show inline previews plus downloads.

## Implementation Changes
- Create a standalone wrapper app in a new `apps/ui` area with:
  - A small Python backend using FastAPI.
  - A React + Vite frontend for the browser UI.
- Make the backend call the installed Python package entrypoint (`opendataloader_pdf.convert(...)`), not the repo’s source-build path. This avoids the Java source-build problem and matches the working `pip install` path.
- Define a simple local-only job model:
  - `POST /jobs` accepts one uploaded PDF plus selected options.
  - Backend writes the upload and outputs into a per-job temp folder.
  - Conversion runs in a background task so the browser request does not hang on slow PDFs.
  - `GET /jobs/{id}` returns status, output file list, and previewable content when available.
  - `GET /jobs/{id}/files/{name}` downloads a specific output file.
  - `GET /jobs/{id}/bundle` downloads all outputs as a zip.
- Frontend flow:
  - Landing screen with drag-and-drop PDF upload and a file picker.
  - Main options visible by default: output formats, page range, output style choices that matter most.
  - Advanced drawer for: sanitize, line breaks, header/footer inclusion, struct tree, table method, reading order, image options, and hybrid settings.
  - Results screen with:
    - status/progress state,
    - inline preview tabs for Markdown, JSON, HTML, and text when generated,
    - download buttons for every output,
    - one “download all” action.
- Visual direction:
  - Keep the layout simple and local-tool focused, but polished rather than utilitarian.
  - Use a bright neutral base, strong typography, a distinct upload area, and clear step separation: Upload, Options, Results.
  - Avoid an admin-dashboard feel; design it like a focused document utility.
- Defaults:
  - Local mode is the default.
  - Hybrid controls are hidden in Advanced and disabled unless explicitly turned on.
  - Output goes to app-managed temp storage for the session; the user downloads results rather than choosing a filesystem output folder in v1.
  - One active job at a time in the UI; no job history in v1.

## Public Interfaces
- New local backend API:
  - `POST /jobs`
  - `GET /jobs/{id}`
  - `GET /jobs/{id}/files/{name}`
  - `GET /jobs/{id}/bundle`
- New app entrypoint:
  - one dev command to start backend + frontend locally,
  - one user-facing command or script to launch the local UI in a browser.
- No changes to the existing CLI or Python package behavior in v1.

## Test Plan
- Backend tests:
  - option mapping from UI payload to `convert(...)` arguments,
  - successful single-PDF conversion into one and multiple formats,
  - hybrid options only passed when advanced hybrid mode is enabled,
  - invalid input handling: no file, bad page range, unsupported option combinations,
  - temp-folder cleanup behavior.
- Frontend tests:
  - upload form validation,
  - option state behavior,
  - advanced drawer persistence during a session,
  - results rendering for previewable vs download-only outputs.
- End-to-end checks:
  - upload a sample PDF, request Markdown + JSON + HTML, verify previews and downloads,
  - run a local-only job with default settings,
  - run a hybrid-configured job and confirm the backend receives the hybrid settings,
  - verify a failed conversion shows a readable error instead of raw process output.

## Assumptions And Defaults
- This is a local-only tool for one user on their own machine. No auth, multi-user support, or remote hosting in v1.
- Batch folder processing is out of scope for v1.
- Inline preview is limited to text-like outputs; generated PDF/image artifacts are download-only.
- The backend depends on the already working `pip install opendataloader-pdf` path and a local Java runtime being available at runtime.
- If the UI later needs packaging, that is a phase-two concern after the browser-based local app works cleanly.

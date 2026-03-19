# Local UI Checkpoint

This file records the current state of the local web UI work in `apps/ui/`.

It is written as a handoff for another agent or developer who may need to:

- continue feature work
- debug the UI
- troubleshoot the local launcher
- troubleshoot backend conversion failures
- improve the workflow or polish the interface

Last updated: 2026-03-19

## Latest Session Update

This checkpoint now includes the latest UI polish work and the preparation for bounding box visualization.

### What Changed In This Session

The main UI changes were:

- moved advanced options into a normal inline panel below the options card
- made the advanced panel close when the user clicks outside it
- added smooth open and close animation for the advanced panel
- made the advanced options button visibly react on hover
- stopped the results panel from stretching taller when advanced options open
- removed the extra hero card from the header to reduce visual clutter
- fixed long download filenames so they wrap inside the download card instead of spilling out

These changes were kept intentionally simple in the code:

- explicit open and close functions
- explicit mounted versus open animation state
- early returns for the close behavior
- straightforward CSS classes for hover and transition behavior

### What Was Verified In This Session

Verified successfully:

- frontend tests pass after the UI polish changes
- live browser checks confirm the advanced panel opens below the options card
- live browser checks confirm outside click closes the advanced panel
- live browser checks confirm the results panel no longer stretches when advanced options open
- live browser checks confirm the advanced button hover state is visible
- live browser checks confirm long download filenames stay inside the card
- live browser checks confirm the hero card is gone

### Frontend Test Status

Most recent frontend test result:

- `6 passed`

This supersedes the earlier `4 passed` result recorded below.

### Bounding Box Integration Preparation

Bounding box visualization was investigated using the official OpenDataLoader site and documentation.

Practical conclusion:

- use the JSON output as the source of truth
- each JSON element can include `page number` and `bounding box`
- the JSON document is a tree under `kids`
- the browser UI should overlay boxes on top of the rendered PDF page rather than inventing a separate layout model

Recommended implementation path:

1. keep the existing PDF output or preview as the visual base layer
2. load the JSON output for the same document
3. flatten the `kids` tree into drawable elements
4. group elements by `page number`
5. convert each `bounding box` from PDF points into viewer pixel coordinates
6. draw overlay rectangles on top of the current PDF page
7. start with text and table boxes first
8. add picture boxes and descriptions later if needed

Important data notes from the docs:

- bounding boxes are documented as coordinates such as `[left, bottom, right, top]`
- hybrid picture enrichment can add a `description` alongside a picture bounding box
- this is best treated as an annotated PDF overlay for debugging and inspection

Official references:

- `https://opendataloader.org/`
- `https://opendataloader.org/docs`
- `https://www.opendataloader.org/docs/json-schema`
- `https://opendataloader.org/docs/hybrid-mode`
- `https://opendataloader.org/docs/rag-integration`

### Suggested Next Step

If the next session continues this work, the cleanest next feature is:

- add a PDF page viewer with a simple overlay layer fed by the JSON bounding boxes

That can be built without changing the conversion backend contract, because the needed data should already be in the JSON output.

## Goal Of This Work

The goal was to add a local browser-based interface for `opendataloader-pdf` so a user can:

- upload a PDF
- choose common and advanced conversion options
- run a single conversion locally
- see job status and previews
- download individual outputs or a zip bundle

This is a local development UI, not a deployed production app.

## What Exists Now

The UI work lives under `apps/ui/` and has three main parts:

- `apps/ui/backend/`
  - FastAPI backend
- `apps/ui/frontend/`
  - React + Vite frontend
- `apps/ui/scripts/run_dev.py`
  - local launcher that starts both backend and frontend

Root `package.json` also has helper commands:

- `npm run ui:dev`
- `npm run ui:launch`

## What Was Built

### Backend

Implemented routes:

- `POST /jobs`
- `GET /jobs/{id}`
- `GET /jobs/{id}/files/{name}`
- `GET /jobs/{id}/bundle`
- `GET /health`

Implemented behavior:

- accepts one uploaded PDF plus UI options
- stores each job in its own temporary workspace
- only allows one active job at a time
- runs conversion in the background
- returns previewable text outputs inline
- exposes download routes for files and zip bundles
- maps frontend form options into `opendataloader_pdf.convert(...)`
- only includes hybrid arguments when hybrid is actually enabled
- blocks importing the repo source-tree Python package by mistake
- rewrites Java version failures into plain-English backend errors

### Frontend

Implemented UI flow:

- single-file PDF upload
- main conversion options visible immediately
- advanced drawer for secondary controls
- hybrid settings section
- result panel with status, progress, preview tabs, and downloads
- session persistence for advanced drawer open/closed state

### Launcher

Implemented launcher behavior:

- starts backend and frontend together
- prefers `apps/ui/backend/.venv/Scripts/python.exe` when present
- sets `VITE_API_BASE_URL`
- tries to prefer a newer Java installation automatically
- can optionally open the browser via `--open`

## Important Files

Backend:

- `apps/ui/backend/app/main.py`
- `apps/ui/backend/app/service.py`
- `apps/ui/backend/app/models.py`
- `apps/ui/backend/tests/test_api.py`
- `apps/ui/backend/tests/test_service.py`
- `apps/ui/backend/pyproject.toml`

Frontend:

- `apps/ui/frontend/src/App.tsx`
- `apps/ui/frontend/src/lib/api.ts`
- `apps/ui/frontend/src/lib/types.ts`
- `apps/ui/frontend/src/App.test.tsx`
- `apps/ui/frontend/package.json`

Launcher:

- `apps/ui/scripts/run_dev.py`

Documentation:

- `apps/ui/README.md`
- `apps/ui/CHECKPOINT.md`

## What Changed In The Most Recent Session

This session picked up from an earlier pause and focused on verification plus fixing anything verification exposed.

### Verified Again

Confirmed successfully:

- backend tests pass
- frontend tests pass
- frontend production build passes
- real sample PDF conversion works through the backend API
- launcher can start both backend and frontend successfully

### New Issue Found And Fixed

A real launcher problem was discovered on Windows:

- the launcher started the backend
- the launcher failed to start the frontend
- cause: it tried to execute `npm` directly
- on Windows that can fail because the executable available on PATH is usually `npm.cmd`

Fix applied:

- `apps/ui/scripts/run_dev.py` now resolves the correct npm command using PATH lookup
- on Windows it prefers `npm.cmd`
- otherwise it falls back to `npm`
- if neither exists, it raises a readable error

This was the only code change made in this session.

## Verification Summary

### Backend Tests

Command that passed:

- from `apps/ui/backend`
- `.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest-tmp-verify-20260319-0142 -o cache_dir=.pytest-cache-verify-20260319-0142`

Result:

- `9 passed`

Important note:

- an earlier rerun failed, but that turned out to be stale or inaccessible pytest temp directories, not an app logic failure
- using a fresh temp directory fixed that and the backend suite passed cleanly

### Frontend Tests

Command that passed:

- from `apps/ui/frontend`
- `npm test`

Result:

- `4 passed`

### Frontend Build

Command that passed:

- from `apps/ui/frontend`
- `npm run build`

Result:

- production build completed successfully

### Real Backend Conversion

A real sample PDF was run through the backend API using:

- sample file: `samples/pdf/lorem.pdf`
- formats: markdown + json

Result:

- upload accepted
- job completed successfully
- output files returned:
  - `lorem.md`
  - `lorem.json`

This verified the real conversion path beyond mocks.

### Launcher Startup

Launcher was started on throwaway ports and both sides responded successfully:

- backend health endpoint returned OK
- frontend returned HTTP 200

This confirmed the launcher fix.

## Exact Problems Encountered

These are the main issues discovered across the work so far.

### 1. Wrong Java On PATH

Observed behavior:

- real conversion failed with a Java class version error
- the published `opendataloader-pdf` package requires Java 11 or newer
- machine PATH was sometimes resolving to Java 8

What was done:

- backend error handling was updated earlier to rewrite this into a readable message
- launcher logic prefers a newer Java installation when available
- real conversion was re-tested with Java 22 and succeeded

Important learning:

- do not assume the machine PATH points to a modern Java
- if conversion fails immediately, check `java -version`

### 2. `C:\Program Files\Java\latest` Is Not Guaranteed To Be Real

Observed behavior:

- earlier troubleshooting assumed `C:\Program Files\Java\latest` was a usable Java home
- on this machine, that path existed in directory listings but did not actually contain `bin\java.exe`
- when forced manually, Windows fell back to Java 8 from PATH and conversion still failed

Important learning:

- only trust a Java home if `bin\java.exe` actually exists
- the launcher code already checks for that before using a candidate

### 3. Windows Launcher Could Not Start Frontend

Observed behavior:

- backend came up
- frontend did not start
- the process failed with file-not-found on Windows

Cause:

- `subprocess.Popen([... "npm", ...])` is not reliable on Windows

Fix:

- launcher now resolves `npm.cmd` via PATH

### 4. Pytest Temp Directory Failures

Observed behavior:

- backend pytest reruns failed with permission errors against `.pytest-tmp` and cache directories

Interpretation:

- this did not point to broken backend behavior
- it was a temp-directory cleanup issue during reruns

Practical workaround:

- use a fresh `--basetemp` and a fresh cache directory name when rerunning backend tests

### 5. Sandbox-Specific Tooling Failures

Observed behavior in the agent environment:

- frontend Vite and Vitest failed inside the sandbox with `spawn EPERM`

Interpretation:

- this was an environment restriction of the agent sandbox
- when rerun with normal machine permissions, frontend tests and build passed

Important learning:

- if another agent sees Vite spawn failures inside the sandbox, treat that as an environment issue first, not necessarily a project bug

## Current Status

As of this checkpoint:

- the UI codebase exists and is functional
- backend automated tests pass
- frontend automated tests pass
- frontend production build passes
- a real PDF conversion through the backend API works
- the launcher starts both services after the Windows npm fix

## What Has Not Been Fully Verified Yet

The following are still not fully exercised in a manual, human-clicked browser session:

- uploading through the visible browser UI rather than through backend API test calls
- clicking through every advanced setting combination
- hybrid settings against a real hybrid backend
- visual polish and layout behavior across more viewport sizes
- manual download/opening of every output type through the browser

So the current confidence is good for the local stack and the core flow, but not yet full end-to-end browser QA.

## How To Run It

From the repo root:

- `python apps/ui/scripts/run_dev.py`
- or `python apps/ui/scripts/run_dev.py --open`

Expected default URLs:

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8008`

Root shortcut commands:

- `npm run ui:dev`
- `npm run ui:launch`

Recommended first manual test file:

- `samples/pdf/lorem.pdf`

## Recommended Manual Test Flow

If another agent or person wants to continue manually:

1. Start the launcher from repo root.
2. Open the browser UI.
3. Upload `samples/pdf/lorem.pdf`.
4. Leave defaults on for the first run.
5. Confirm the job reaches a finished state.
6. Confirm previews appear.
7. Confirm downloads work.
8. Try a second run with different formats.
9. Try opening and closing the advanced drawer and confirm its state persists.

## Suggested Troubleshooting Checklist

If conversion fails:

1. Run `java -version`.
2. Confirm Java 11+ is being used.
3. Confirm the published `opendataloader-pdf` package is installed in `apps/ui/backend/.venv`.
4. Check whether the backend error message is the readable Java-version message or something else.
5. If needed, inspect `apps/ui/backend/app/service.py`.

If launcher starts backend but not frontend:

1. Confirm Node.js is installed.
2. Confirm `npm.cmd` is on PATH.
3. Re-run `python apps/ui/scripts/run_dev.py`.
4. If it still fails, inspect `apps/ui/scripts/run_dev.py`.

If backend tests fail with temp-directory permission errors:

1. Re-run pytest with a fresh `--basetemp`.
2. Use a fresh cache directory name.
3. Do not assume the backend logic is broken unless failures persist with a fresh temp path.

If frontend tests or build fail only inside an agent sandbox:

1. Retry outside the sandbox.
2. Treat `spawn EPERM` as an environment restriction first.

## Context For Future Improvements

Good next areas for work:

- add proper browser-level end-to-end tests
- improve visual polish and layout behavior
- make conversion progress feel more informative
- support richer previews
- add clearer empty, running, and failure states
- make launcher diagnostics more explicit when prerequisites are missing
- add manual testing notes to `apps/ui/README.md`
- expand support beyond the current single-active-job model if needed

## Known Constraints And Project Gotchas

Repo-wide gotchas that still matter here:

- after changing CLI options in Java, run `npm run sync`
- this regenerates `options.json` and the wrapper bindings
- forgetting that can silently break wrappers

Hybrid-specific gotcha:

- when using `--enrich-formula` or `--enrich-picture-description` on the hybrid server, the client must use `--hybrid-mode full`
- otherwise enrichments are silently skipped

Docs convention:

- `content/docs/` auto-syncs to opendataloader.org on release

## Files Most Likely To Matter Next

If the next agent is troubleshooting behavior:

- `apps/ui/backend/app/service.py`
- `apps/ui/backend/app/main.py`
- `apps/ui/backend/app/models.py`
- `apps/ui/scripts/run_dev.py`
- `apps/ui/frontend/src/App.tsx`
- `apps/ui/frontend/src/lib/api.ts`
- `apps/ui/frontend/src/lib/types.ts`

## Minimal Carry-Forward Summary

If someone only reads one short section, read this:

- A local UI was built under `apps/ui/` with FastAPI backend, React frontend, and a Python launcher.
- Backend tests pass, frontend tests pass, and frontend build passes.
- Real backend conversion of `samples/pdf/lorem.pdf` succeeded and produced markdown and json outputs.
- A Windows launcher bug was found in this session and fixed: the launcher now resolves `npm.cmd` instead of assuming `npm` works directly.
- The launcher now starts both backend and frontend successfully.
- The biggest remaining gap is full manual browser QA and any UI refinement or additional functionality work.

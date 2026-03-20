# Local UI Checkpoint

This file records the current state of the local web UI work in `apps/ui/`.

It is written as a handoff for another agent or developer who may need to:

- continue feature work
- debug the UI
- troubleshoot the local launcher
- troubleshoot backend conversion failures
- improve the workflow or polish the interface

Last updated: 2026-03-20

## Current Handoff

This is the latest and most relevant checkpoint for the UI work. Older sections below describe earlier viewer experiments and should be treated as history, not the current target.

### Current Goal

The UI is being changed into a sequential full-width workflow:

- only the upload card is visible on first load
- the options card appears after a PDF is selected
- the results card appears after the user clicks `Create Job`
- all cards use the full page width
- the results card is the viewer
- the viewer has a fixed-width thumbnail rail on the left
- the viewer has a tabbed content panel on the right
- the tab order is fixed as `PDF`, `Annot`, `Preview`, `HTML`, `MD`, `JSON`

### What Has Already Been Changed

The current frontend rewrite is already in progress and the main files have been reshaped around the new flow.

Files with active work:

- `apps/ui/frontend/src/App.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/styles.css`
- `apps/ui/frontend/src/App.test.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`

What the current code is trying to do:

- `App.tsx` now uses a single-column full-width workflow instead of the old page layout
- the page reveals cards in sequence based on user progress
- the results area now drives a fixed viewer-tab model instead of separate preview widgets
- `BoundingBoxPreview.tsx` now owns the left thumbnail rail and the right tabbed panel
- the right panel includes the download control in the tab row
- text-style tabs are wired for copy behavior inside the panel
- `styles.css` was rebuilt to support the full-width stacked cards and the new viewer shell
- the frontend tests were rewritten to match the new staged workflow and the new viewer contract

### Important Current State

This work is not yet fully closed out.

What is already true:

- the old detached or floating viewer direction is no longer the active target
- the new sequential full-width card flow has been coded
- the new viewer structure has been coded
- `npm test` now passes after the latest viewer fixes
- `npm run build` now passes after the latest viewer fixes

What is still pending:

- the live browser layout still needs another visual check after tests are green
- final manual browser QA is still open for the sequential flow and overlay alignment on a real document

### Known Resume Point

The exact next steps for the next session are:

1. Open the local UI and confirm the page behaves like the intended full-width sequential workflow.
2. Upload a real sample PDF and visually confirm the bounding boxes line up in the viewer.
3. Sanity-check the page rail toggle, tab switching, and downloads in the live UI.

### Most Likely Problem Area If Tests Still Fail

The most recent bug was not about the tab model. It was about the document canvas never appearing because the render effect needed a canvas element to exist before it could render, but the canvas element was only mounted after a rendered page existed.

That circular dependency was broken by changing the component so the canvas is mounted immediately inside the document stage. If anything is still broken, start there.

### Practical Notes For The Next Agent

- do not revert unrelated repo changes; this checkout is dirty
- use `apply_patch` for edits
- keep the viewer as a single integrated results card
- do not bring back the old floating viewer design
- do not move parser logic into the React layout; keep the frontend focused on display
- after UI changes, verify both tests and the live page before reporting back

### Verification Status At Handoff

Verified recently:

- the new sequential full-width workflow code is in place
- the frontend test suite passes after the latest viewer fixes
- the frontend build passes after the latest viewer fixes

Not yet re-verified after the latest canvas fix:

- final live browser behavior

### Latest Session Update

This session closed out the pending frontend verification and cleaned up the viewer behavior.

What changed:

- fixed the viewer so its page layout state is established as soon as a page viewport is known instead of waiting until the full render promise finishes
- added the missing `.bbox-stage-shell` styling for loading and ready states
- fixed the page rail toggle so it actually hides the thumbnail rail instead of only flipping button state
- corrected the viewer test harness so it keeps the uploaded PDF stable across tab clicks
- added coverage for collapsing the page rail

What was verified:

- frontend tests pass in `apps/ui/frontend`
- frontend build passes in `apps/ui/frontend`

Most recent frontend test result:

- `20 passed`

## Latest Session Update

This checkpoint now includes the detached floating bounding box viewer, the symbol-based control refresh, and the repo-local fix for the code review graph MCP startup issue.

### What Changed In The Latest Session

The main UI changes were:

- moved the bounding box viewer out of the results card so it now lives beside the card in the results column
- changed the viewer so opening it creates a floating panel over the results area instead of an inline block inside the card
- kept the page rail, zoom, rotation, and page navigation behavior working while making the component easier to read and follow
- changed the requested theme and viewer controls to symbols only
- kept plain text names on those controls through accessibility labels and tooltips
- tightened the theme toggle so it only wraps its own buttons and no longer stretches visually toward the edge
- added mobile fallback styling so the floating viewer becomes a contained full-width panel when space is tight

The code review graph setup was also fixed for this repo:

- replaced the repo-local `uvx` MCP launcher with a small wrapper script
- made the wrapper always start the installed graph tool from the repo root
- avoided the earlier failures caused by sandbox-sensitive `uvx` startup and the wrong working directory

Files added or changed for this session:

- `apps/ui/frontend/src/App.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/styles.css`
- `apps/ui/frontend/src/App.test.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`
- `.mcp.json`
- `scripts/code-review-graph-mcp.cmd`

### What Was Verified In The Latest Session

Verified successfully:

- frontend tests pass after the detached viewer and symbol-control changes
- frontend production build passes after the UI refactor
- the new repo-local graph launcher can read graph status from the repo root
- the same graph launcher also works when started from `C:\Windows\System32`, which confirms the working-directory problem is fixed

Most recent frontend test result:

- `13 passed`

### What Changed In This Session

The main UI changes were:

- added a new read-only bounding box viewer inside the results panel
- made the viewer appear when both PDF and JSON outputs are available for the same job
- rendered the PDF page in the browser and drew overlay rectangles on top of it
- added previous and next page controls for multi-page documents
- added simple on and off filters for text boxes and table boxes
- kept the existing text previews and download links unchanged
- added a small helper layer that flattens the JSON tree into drawable boxes grouped by page
- added frontend tests for the new viewer wiring and the bounding box parsing math

One small package change was needed:

- added `pdfjs-dist` to the frontend so the browser UI can draw PDF pages locally

Implementation notes that matter for the next session:

- the viewer uses the JSON output as the source of truth for boxes
- the frontend only converts coordinates for display
- the first version only shows text and table boxes
- picture boxes and descriptions were intentionally left for a later pass
- there is now a second in-progress component file under `apps/ui/frontend/src/components/` named `BoundingBoxInspector.tsx`
- the app is using `BoundingBoxPreview.tsx` for the active implementation path

### What Was Verified In This Session

Verified successfully:

- frontend tests pass after the bounding box work
- frontend production build passes after the bounding box work
- the new viewer is only shown when both PDF and JSON outputs are present
- the JSON tree flattening and coordinate conversion logic are covered by focused unit tests

### Frontend Test Status

Most recent frontend test result:

- `9 passed`

This supersedes the earlier `6 passed` and `4 passed` results recorded below.

### Harness Follow-Up For Bounding Box Work

Separate repo-harness work was completed after this UI checkpoint and has since been merged to `main`.

Important practical consequence:

- the repo should now treat the harness docs and boundary checks as the source of truth for follow-up work
- this local checkout is now synced with the merged harness work
- if a future session does not see `AGENTS.md`, `docs/architecture/LAYERS.md`, and `docs/guides/AGENT_REVIEW.md`, sync `main` first instead of guessing

The most important harness rules for the bounding box feature are:

- keep parser behavior and bounding box meaning in the parser outputs, not in the React UI
- keep the UI backend talking to the installed `opendataloader-pdf` package boundary, not to repo source-tree shortcuts
- if the UI needs new JSON fields or new CLI options, change Java first, then run `npm run sync` so Python and Node stay aligned
- treat `content/docs/` as public release documentation, not as scratch notes for the local UI prototype
- run `npm run check:harness` after boundary-affecting changes

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

Additional implementation guardrails from the harness work:

- the frontend should only transform coordinates for display, not invent a new document-structure model
- if a box is missing or ambiguous in JSON, fix the source output shape instead of hardcoding UI-only guesses
- keep the first version read-only and diagnostic; do not tie editing behavior to the overlay until the display layer is stable

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

- manually click through the bounding box viewer in the real browser UI and confirm the overlays line up visually on real documents

After that, the next most sensible expansion is:

- add picture boxes and any useful hover details once the current text and table overlay is confirmed visually

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
- read-only PDF bounding box viewer backed by the job's PDF and JSON outputs
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
- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/lib/boundingBoxes.ts`
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

- `9 passed`

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
- the results panel now includes a first working bounding box viewer for PDF plus JSON output pairs

## What Has Not Been Fully Verified Yet

The following are still not fully exercised in a manual, human-clicked browser session:

- uploading through the visible browser UI rather than through backend API test calls
- clicking through every advanced setting combination
- hybrid settings against a real hybrid backend
- bounding box alignment on real multi-page documents in a live browser session
- page navigation and text versus table toggles in a live browser session
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
7. Confirm the bounding box viewer appears when both PDF and JSON are present.
8. Step through pages if the document has more than one page.
9. Toggle text boxes and table boxes on and off and confirm the overlay updates.
10. Confirm downloads work.
11. Try a second run with different formats.
12. Try opening and closing the advanced drawer and confirm its state persists.

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
- manually verify and polish the new bounding box viewer
- add picture boxes and richer overlay details if the current alignment looks good
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
- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/lib/api.ts`
- `apps/ui/frontend/src/lib/boundingBoxes.ts`
- `apps/ui/frontend/src/lib/types.ts`

## Minimal Carry-Forward Summary

If someone only reads one short section, read this:

- A local UI was built under `apps/ui/` with FastAPI backend, React frontend, and a Python launcher.
- Backend tests pass, frontend tests pass, and frontend build passes.
- The results panel now has a first working bounding box viewer that overlays text and table boxes on top of PDF pages when both PDF and JSON outputs are available.
- Real backend conversion of `samples/pdf/lorem.pdf` succeeded and produced markdown and json outputs.
- A Windows launcher bug was found in this session and fixed: the launcher now resolves `npm.cmd` instead of assuming `npm` works directly.
- The launcher now starts both backend and frontend successfully.
- The biggest remaining gap is manual browser QA for overlay alignment and follow-up polish such as picture boxes or richer inspection details.

# UI Handover

Date: 2026-03-23

This is the current handoff for the local browser UI in `apps/ui/`.

Use this file first in the next session.
Use `apps/ui/CHECKPOINT.md` as older history only.

## Current State

- The local UI starts with `python apps/ui/scripts/run_dev.py`.
- Backend health endpoint: `http://127.0.0.1:8008/health`
- Frontend dev server: `http://127.0.0.1:5173`
- The staged workflow and viewer shell are in place.
- The viewer reset flow is cleaner than before.
- The thumbnail rail is more stable than before.
- The live browser still has follow-up polish and usability work to close out.

## What Was Completed This Session

The session closed out the previous four handoff issues.

Fixed now:

- the same PDF can be selected again after `Start over`
- starting a second job no longer reuses stale canvas work
- the thumbnail frame now appears as soon as the conversion finishes
- the thumbnail rail no longer stretches vertically when switching to text-heavy tabs

Implementation areas touched:

- `apps/ui/frontend/src/App.tsx`
- `apps/ui/frontend/src/App.test.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`
- `apps/ui/frontend/src/styles.css`

## What Was Verified

Verified in this session:

- targeted frontend tests passed with `npm run test -- App.test.tsx BoundingBoxPreview.test.tsx`
- frontend build passed with `npm run build`
- the local UI started successfully
- backend health returned `{"status":"ok"}`
- frontend returned `200`

Important limitation:

- this session did not do a full manual click-through of every remaining browser interaction
- the remaining issues below should still be reproduced in the live UI before fixing them

## Open Issues For Next Session

### 1. `Preview`, `HTML`, `MD`, and `JSON` still are not page-aware

What still happens:

- clicking page thumbnails only really matters for `PDF` and `Annot`
- `Preview`, `HTML`, `MD`, and `JSON` still behave like one long document instead of page-separated content

Expected behavior:

- those four tabs should respond to the selected page
- the right panel should show the content for the active page, not the whole document at once
- the thumbnail rail should stay meaningful across all result tabs

Likely files:

- `apps/ui/frontend/src/App.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/App.test.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`

Good next step:

- inspect the current page-copy plumbing that already exists and extend it beyond copy behavior into actual page-scoped display

### 2. Background color changes on `Preview`, `MD`, and `JSON`

What still happens:

- `PDF`, `Annot`, and `HTML` keep the normal light-brown page background
- `Preview`, `MD`, and `JSON` shift to a pinkish-brown or darker brown background

Expected behavior:

- the background should stay visually consistent when switching tabs
- the default light-brown background used by `PDF`, `Annot`, and `HTML` should remain the standard

Likely files:

- `apps/ui/frontend/src/styles.css`
- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`

Good next step:

- compare the wrapper and panel classes used by text-style tabs against the document and HTML tabs

### 3. Zoomed-in PDF needs a hand tool mode

What still happens:

- the stage is scrollable
- but once the PDF is zoomed in, moving around the page becomes awkward and slow

Expected behavior:

- add a hand tool mode that lets the user click and drag the page to pan around
- this should make zoomed-in navigation much easier without depending only on scrollbars

Likely files:

- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/styles.css`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`

Good next step:

- add a simple toggleable drag mode first
- keep the behavior easy to understand and easy to turn off

### 4. Remove the `Plain PDF view` footer text

What still happens:

- the PDF tab shows a footer that says `Plain PDF view.`

Expected behavior:

- remove that footer text from the PDF tab
- it does not add useful information for the user

Likely files:

- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`

Good next step:

- keep the footer only where it adds real value
- do not show a filler message for the plain PDF tab

### 5. Rotating the main PDF also rotates the thumbnails

What still happens:

- rotating clockwise or counterclockwise rotates the main page correctly
- the page thumbnails rotate too

Expected behavior:

- rotation should affect the main viewer only
- thumbnails should stay upright

Likely files:

- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`

Good next step:

- separate the main-page rotation state from thumbnail rendering
- keep the thumbnail rail stable and predictable

## Suggested Next Session Plan

1. Reproduce the five remaining issues in the live browser.
2. Make the text-style tabs page-aware first because that changes the meaning of the thumbnail rail.
3. Fix the background mismatch next because it is small and easy to verify.
4. Add the hand tool mode after that and test it with a zoomed-in document.
5. Remove the PDF footer text.
6. Decouple thumbnail rotation from main-page rotation.
7. Re-run targeted tests, build, and a live browser pass after each fix group.

## Useful Commands

Start the local UI:

```powershell
python apps/ui/scripts/run_dev.py
```

Frontend tests:

```powershell
npm run test -- App.test.tsx BoundingBoxPreview.test.tsx
```

Frontend build:

```powershell
npm run build
```

Backend targeted tests:

```powershell
apps/ui/backend/.venv/Scripts/python.exe -m pytest -p no:cacheprovider --basetemp .codex-worktrees/backend-service-pytest-temp apps/ui/backend/tests/test_service.py apps/ui/backend/tests/test_api.py
```

Package runner tests:

```powershell
$env:PYTHONPATH='C:\Users\Satrio Faiz\Downloads\github-repos\opendataloader-pdfFork\python\opendataloader-pdf\src'
apps/ui/backend/.venv/Scripts/python.exe -m pytest -p no:cacheprovider --basetemp .codex-worktrees/runner-pytest-temp python/opendataloader-pdf/tests/test_runner.py
```

## Environment Notes

- This checkout is dirty outside the UI files. Do not revert unrelated work.
- Vite may fail inside the sandbox with `spawn EPERM`. If that happens, run the UI or tests outside the sandbox.
- Live browser validation still matters more than green tests for UI polish work.

# UI Handover

Date: 2026-03-24

This is the current handoff for the local browser UI in `apps/ui/`.

Use this file first in the next session.
Use `apps/ui/CHECKPOINT.md` as older history only.

## Current State

- The local UI starts with `python apps/ui/scripts/run_dev.py`.
- Backend health endpoint: `http://127.0.0.1:8008/health`
- Frontend dev server: `http://127.0.0.1:5173`
- The staged workflow and viewer shell are in place.
- The viewer reset flow is cleaner than before.
- `Preview`, `HTML`, `MD`, and `JSON` now respond to the selected page.
- The text-style result tabs now use the same viewer backdrop instead of switching to a mismatched background.
- A simple hand tool toggle now exists in the document viewer.
- The plain PDF footer filler text has been removed.
- Rotating the main PDF no longer rotates the thumbnails.
- The backend already has a page-preview route, so the remaining work is still frontend polish and usability.

## What Was Completed This Session

Fixed now:

- `Preview`, `HTML`, `MD`, and `JSON` follow the selected page instead of always showing the whole document
- the non-PDF tabs now use the same viewer backdrop pattern
- the viewer has a basic hand tool toggle
- the PDF tab no longer shows `Plain PDF view.`
- rotating the main page no longer rotates the thumbnail rail

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

Important limitation:

- this session did not do a full live browser click-through of the remaining viewer interactions
- the hand tool was verified through tests and state checks, not through a full manual browser pass
- the remaining issues below should be reproduced in the live UI before fixing them

## Open Issues For Next Session

### 1. `HTML` tab layout does not fill the available height

What still happens:

- when switching to `HTML`, `bbox-page-panel-shell` collapses into the top portion of the container
- a large empty area remains below it
- `Preview` and the other text-style tabs stretch correctly, but `HTML` does not

Expected behavior:

- `bbox-page-panel-shell` should fill the available vertical space on `HTML` too
- `HTML` should match the same full-height layout behavior used by the other page-aware tabs
- switching between tabs should not change the overall panel height behavior

Likely files:

- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/styles.css`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`

Good next step:

- compare the `HTML` wrapper/card sizing against the `Preview` and `MD` paths
- check whether the `iframe` container or `is-html` styles are preventing the shell from stretching

### 2. The hand tool only pans horizontally

What still happens:

- the hand tool can move the document left and right
- the same interaction does not move the document vertically in the way it should

Expected behavior:

- the hand tool should support both horizontal and vertical movement
- users should be able to drag the document up, down, left, and right as needed

Likely files:

- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`

Good next step:

- reproduce the drag behavior in the live browser first
- trace the current pointer math and verify both scroll axes update during drag

### 3. The hand tool only becomes available when zoomed in

What still happens:

- the hand tool is currently gated behind zooming in
- at fit-to-view or zoomed-out states, the hand tool is disabled

Expected behavior:

- the hand tool should be available at all zoom levels
- users should be able to drag the document even when it fits within the viewport
- movement should stay within sensible boundaries so the page cannot be dragged completely out of view
- the document should still be repositionable enough for inspection

In short:

- enable the hand tool at all zoom levels
- allow panning interaction at any time
- constrain movement so the document stays within visible bounds

Likely files:

- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/styles.css`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`

Good next step:

- decide whether the viewer should switch from plain scroll-based panning to explicit drag-position state
- define the movement bounds before implementing so the page can move freely without disappearing

### 4. Page navigation disappears on `Preview`, `HTML`, `MD`, and `JSON`

What still happens:

- `bbox-panel-toolbar` disappears when switching away from the document tabs
- page navigation is then only available after switching back to another tab

Expected behavior:

- the toolbar, or at least the page navigation controls, should remain available across all result tabs
- users should be able to move between pages without leaving the active tab
- the controls should stay in a consistent place across views

In short:

- keep page navigation visible at all times
- do not require users to switch tabs just to change pages

Likely files:

- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/styles.css`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`

Good next step:

- split the toolbar into shared page-navigation controls plus document-only controls if needed
- keep the shared navigation row mounted for every page-aware tab

### 5. `bbox-page-list` needs a constrained height for large PDFs

What still happens:

- for long PDFs, the thumbnail list grows into a very tall column
- users have to scroll a long way through the page to reach later thumbnails

Expected behavior:

- `bbox-page-list` should show only a limited number of thumbnails at once
- if there are more pages than fit in that space, the thumbnail list itself should scroll internally
- the overall viewer layout should stay compact even for large documents

In short:

- constrain the visible height of `bbox-page-list`
- make the thumbnail rail internally scrollable for long documents

Likely files:

- `apps/ui/frontend/src/styles.css`
- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`

Good next step:

- choose a fixed visible height target such as roughly five thumbnails
- verify desktop and mobile behavior separately after the height constraint is added

### 6. Add direct page number input

What still happens:

- page navigation only uses previous and next arrow buttons
- moving to a distant page requires repeated clicking

Expected behavior:

- add a page number input in the page controls
- users should be able to type a page number and jump directly there
- the input should validate against the real page range
- the UI should still show the total number of pages for context

In short:

- support direct page navigation through an input field
- validate the number before navigating
- keep the current page context clear

Likely files:

- `apps/ui/frontend/src/components/BoundingBoxPreview.tsx`
- `apps/ui/frontend/src/styles.css`
- `apps/ui/frontend/src/components/BoundingBoxPreview.test.tsx`

Good next step:

- decide whether the input should commit on Enter, blur, or both
- show invalid values clearly without breaking the current page state

## Suggested Next Session Plan

1. Reproduce all six remaining issues in the live browser before changing code.
2. Fix the shared navigation problem first so page controls stay available on every page-aware tab.
3. Add direct page input next, since that improves usability immediately for long documents.
4. Fix the `HTML` full-height layout issue after that so all page-aware tabs share the same shell behavior.
5. Rework the hand tool so it supports vertical movement and stays available at every zoom level with defined movement bounds.
6. Constrain the thumbnail rail height and make it internally scrollable for long PDFs.
7. Re-run targeted frontend tests, run the frontend build again, and finish with a live browser pass.

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

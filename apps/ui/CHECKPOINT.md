# Local UI Checkpoint

Last updated: 2026-03-23

This file is the broader checkpoint for the local UI work in `apps/ui/`.
Start with `apps/ui/HANDOVER.md` for the latest next-session action list.

## Current Direction

The active UI direction is still the sequential full-width workflow:

- upload first
- options second
- results third
- results card contains the integrated viewer
- left side is the thumbnail rail
- right side is the tabbed result panel

## Latest Completed Work

This session closed out the previous viewer reset and thumbnail cleanup work.

Completed:

- `Start over` now resets the upload flow so the same PDF can be selected again
- viewer cleanup now cancels in-flight canvas work before reuse
- thumbnail sizing is established earlier so thumbnails appear sooner
- thumbnail cards no longer stretch with text-style result tabs

## Latest Verification

Verified in this session:

- `npm run test -- App.test.tsx BoundingBoxPreview.test.tsx`
- `npm run build`
- local backend health returned `{"status":"ok"}`
- local frontend returned `200`

Still not completed in this session:

- full manual browser QA of the remaining open UI issues

## Latest Resume Point

If another session resumes from here:

1. Read `apps/ui/HANDOVER.md`
2. Start the UI locally
3. Reproduce the current open issues in the browser
4. Fix and verify them one by one with both tests and live checks

## Current Open Work Summary

The current unresolved UI work is:

- make `Preview`, `HTML`, `MD`, and `JSON` page-aware
- keep the page background color consistent across tabs
- add a hand tool mode for drag-to-pan on zoomed PDFs
- remove the redundant `Plain PDF view` footer
- keep thumbnail orientation fixed when rotating the main PDF

## Practical Notes

- the repo is still dirty outside the UI files; do not revert unrelated work
- the frontend sandbox can hit `spawn EPERM`; if that happens, rerun Vite or Vitest outside the sandbox
- `apps/ui/HANDOVER.md` is the current source of truth for next-session UI debugging

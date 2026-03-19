# Local Web UI

This app adds a local browser interface for `opendataloader-pdf`.

## Commands

- Dev mode: `python apps/ui/scripts/run_dev.py`
- Launch and open browser: `python apps/ui/scripts/run_dev.py --open`

## Structure

- `backend/` contains the FastAPI API and tests.
- `frontend/` contains the React + Vite UI.
- `scripts/` contains local launcher helpers.

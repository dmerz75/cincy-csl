# Quickstart — Running demos, server, and troubleshooting

This page expands the short instructions in `README.md` with quick troubleshooting steps and example commands.

Prerequisites
- Python 3.8+ installed
- Git clone of the repository

1) Create & activate virtualenv
```bash
cd ~/git/cincy-csl
python3 -m venv venv
. venv/bin/activate
```

2) Install dev dependencies
```bash
pip install -r requirements-dev.txt
```

3) Create demo data (creates `cincy_csl.db` in project root)
```bash
PYTHONPATH=$(pwd) python scripts/create_practice_league.py
```

4) Run scheduling demo (creates courts, slots, runs allocator, and persists assignments)
```bash
PYTHONPATH=$(pwd) python scripts/schedule_with_courts.py
```

5) Start the FastAPI admin preview server and open the minimal UI
```bash
. venv/bin/activate
uvicorn cincy_csl.api.app:app --reload --port 8000
# then open http://127.0.0.1:8000/admin
```
If `uvicorn` is not found (Exit code 127), either:
- ensure the virtualenv is activated (`. venv/bin/activate`) and `pip install -r requirements-dev.txt` completed, or
- run via the module: `python -m uvicorn cincy_csl.api.app:app --reload --port 8000`.

6) Run tests
```bash
PYTHONPATH=$(pwd) pytest -q
```

Example: call the preview endpoint with `curl`
```bash
curl -s -X POST http://127.0.0.1:8000/admin/preview_schedule \
  -H 'Content-Type: application/json' \
  -d '{"league_id":1,"weeks":8}' | jq
```

Troubleshooting
- "ModuleNotFoundError: No module named 'cincy_csl'": run commands from the project root with `PYTHONPATH=$(pwd)` or install the package in editable mode: `pip install -e .` (requires a `setup.py` or `pyproject.toml`).
- `cincy_csl.db` stale demo data: delete `cincy_csl.db` to start fresh, or move it: `rm cincy_csl.db`.
- `uvicorn` permission or not-found errors: activate venv and use `python -m uvicorn ...` as shown above.

Notes
- Demo scripts persist to `cincy_csl.db` (this file is ignored by git). The admin preview endpoint reads that DB to compute previews.
- Notifications are currently stubbed. See `cincy_csl/api/notifier.py` for the abstraction and where to plug Twilio/SendGrid.

Next steps
- To publish a generated schedule and send notifications, implement a `POST /admin/publish_schedule` endpoint that calls the notifier and mark matches as published.
- To build a richer admin UI, scaffold a React app under `web/` and call the admin endpoints.

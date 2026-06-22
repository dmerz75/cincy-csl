# Cincy CSL (Cincy Community Sports League)

Volleyball-first intramural league web/app.

Structure
- `web/` — frontend app (React / Next.js static site)
- `api/` — serverless functions / backend logic
- `docs/` — design docs, data model, and deployment notes

Purpose
This repository contains the code and docs for a community intramural sports league. We start with a volleyball-focused MVP: user accounts, teams, schedule generation, and notifications.

Tech stack (recommended)
- Frontend: React or Next.js (static export for GitHub Pages)
- Auth & DB: Supabase (Postgres + Auth) or Firebase
- Notifications: Twilio (SMS) and SendGrid (email)
- Serverless logic: Supabase Functions, Vercel Serverless, or small FastAPI service

Quick start (developer)
1. Create and activate a virtualenv:
```bash
cd ~/git/cincy-csl
python3 -m venv venv
. venv/bin/activate
```
2. Install dev dependencies:
```bash
pip install -r requirements-dev.txt
```
3. Run integration tests (project root):
```bash
PYTHONPATH=$(pwd) pytest -q
```

Tests
- Tests live under `tests/` (integration and unit tests).
- Use `PYTHONPATH=$(pwd)` when running pytest from the project root so the `cincy_csl` package is importable.

Contributing
- Open issues for features or bugs. Small PRs are welcome; follow the existing code style.

License
- See `LICENSE`.

Running demos & server (local)
1. Create and activate a virtualenv (project root):
```bash
cd ~/git/cincy-csl
python3 -m venv venv
. venv/bin/activate
```
2. Install dev dependencies:
```bash
pip install -r requirements-dev.txt
```
3. Create demo data (creates `cincy_csl.db` in the project root):
```bash
PYTHONPATH=$(pwd) python scripts/create_practice_league.py
```
4. Run the scheduling demo that creates courts, expands availabilities to slots, runs the allocator, and persists assignments:
```bash
PYTHONPATH=$(pwd) python scripts/schedule_with_courts.py
```
5. Start the admin preview server (FastAPI + Uvicorn) and open the minimal admin UI at `http://127.0.0.1:8000/admin`:
```bash
. venv/bin/activate
uvicorn cincy_csl.api.app:app --reload --port 8000
```
6. Run tests:
```bash
PYTHONPATH=$(pwd) pytest -q
```

Notes
- The demo scripts persist to `cincy_csl.db` (ignored by git). Remove or rename that file if you want a fresh demo run.
- The admin preview endpoint `POST /admin/preview_schedule` uses the local DB and will return assigned/unassigned matches based on configured `CourtAvailability` rows.

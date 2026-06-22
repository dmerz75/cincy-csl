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

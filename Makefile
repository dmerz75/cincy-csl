.PHONY: venv install deps demo-create demo-schedule run run-mod test clean reset-db

VENV=venv
PY=python

venv:
	$(PY) -m venv $(VENV)

install: venv
	. $(VENV)/bin/activate && pip install -r requirements-dev.txt

deps: install

# Build the React admin app (requires npm)
web-build:
	cd web && npm install && npm run build

# Create demo league + matches (persists cincy_csl.db)
demo-create:
	PYTHONPATH=$(PWD) $(PY) scripts/create_practice_league.py

# Create courts, expand availabilities, run allocator, persist assignments
demo-schedule:
	PYTHONPATH=$(PWD) $(PY) scripts/schedule_with_courts.py

# Run FastAPI via uvicorn (requires venv/uvicorn or python -m uvicorn)
run:
	. $(VENV)/bin/activate && uvicorn cincy_csl.api.app:app --reload --port 8000

# Alternative run using module (works if uvicorn not on PATH)
run-mod:
	$(PY) -m uvicorn cincy_csl.api.app:app --reload --port 8000

# Convenience wrappers for local development
start-back:
	@echo "Use scripts/start_backend.sh to start backend (venv required)"
	@bash scripts/start_backend.sh

start-front:
	@echo "Use scripts/start_frontend.sh to start frontend dev server"
	@bash scripts/start_frontend.sh

# Run tests
test:
	PYTHONPATH=$(PWD) pytest -q

# Remove demo DB
clean:
	rm -f cincy_csl.db

# Reset DB and recreate demo data
reset-db: clean demo-create

# Build web and then run the server (serves built assets at /admin)
serve-built: web-build run-mod

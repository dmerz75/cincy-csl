Admin React UI

This small Vite + React app is a lightweight admin preview UI that calls the local FastAPI preview endpoint.

Run locally:
```bash
cd web
npm install
npm run dev
```

Open the dev server (usually http://localhost:5173) and use the Preview button to call the FastAPI preview endpoint at `http://127.0.0.1:8000/admin/preview_schedule`.

Notes:
- The FastAPI app must be running (`make run` or `uvicorn cincy_csl.api.app:app ...`).
- The backend must allow CORS from the dev origin; the repo adds a permissive dev CORS config to `cincy_csl/api/app.py`.

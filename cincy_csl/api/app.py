from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import os
import ipaddress
from starlette.requests import Request

from cincy_csl.api.db import get_session, create_slots_from_availabilities
from cincy_csl.api.schedule import generate_rounds_for_n, schedule_dates
from cincy_csl.api.allocator import assign_matches
from sqlalchemy import create_engine
from fastapi.responses import HTMLResponse, Response
from typing import Optional
import io
import csv
from fastapi import Query
from fastapi.staticfiles import StaticFiles
from pathlib import Path

_debug_mode = os.getenv("ENABLE_DEBUG_EXCEPTIONS", "false").lower() in ("1", "true", "yes")
app = FastAPI(title="Cincy CSL Admin API", debug=_debug_mode)

# Development CORS: allow the React dev server to call the preview API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional IP-whitelist: set `TRUSTED_RENDER_IPS` as a comma-separated
# list of CIDRs or individual IPs (e.g. "74.220.48.0/24,216.151.17.91").
# When empty, no IP restriction is applied (useful for local development).
_trusted = os.getenv("TRUSTED_RENDER_IPS", "").strip()
_allowed_networks = []
if _trusted:
    for _s in _trusted.split(","):
        s = _s.strip()
        if not s:
            continue
        try:
            _allowed_networks.append(ipaddress.ip_network(s))
        except ValueError:
            # try treating as single IP
            try:
                _allowed_networks.append(ipaddress.ip_network(s + "/32"))
            except ValueError:
                pass


@app.middleware("http")
async def ip_whitelist_middleware(request: Request, call_next):
    # If no networks configured, allow all
    if not _allowed_networks:
        return await call_next(request)

    # Prefer X-Forwarded-For from trusted proxies (Render sets this)
    xff = request.headers.get("x-forwarded-for")
    client_ip = None
    if xff:
        client_ip = xff.split(",")[0].strip()
    else:
        client_ip = request.client.host

    try:
        ip_obj = ipaddress.ip_address(client_ip)
    except Exception:
        from fastapi.responses import Response

        return Response(status_code=400, content="Invalid client IP")

    allowed = any(ip_obj in net for net in _allowed_networks)
    if not allowed:
        from fastapi.responses import Response

        return Response(status_code=403, content="Forbidden")

    return await call_next(request)

# Path to built React app (if present)
dist_dir = Path(__file__).parents[2] / "web" / "dist"


class PreviewRequest(BaseModel):
    league_id: int
    weeks: int = 8
    start_date: Optional[datetime] = None


@app.post("/admin/preview_schedule")
def preview_schedule(req: PreviewRequest):
    # create a session using local sqlite db
    engine = create_engine("sqlite:///cincy_csl.db")
    session = get_session(engine)

    # fetch league teams
    from cincy_csl.api.db import League, Team
    league = session.get(League, req.league_id)
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    teams = [t.name for t in session.query(Team).filter_by(league_id=league.id).all()]
    if not teams:
        raise HTTPException(status_code=400, detail="No teams in league")

    rounds = generate_rounds_for_n(teams, req.weeks)
    start = req.start_date or datetime.now(timezone.utc)
    dates = schedule_dates(start, len(rounds), interval_days=7)

    # build matches list
    matches = []
    mid = 1
    for rd, dt in zip(rounds, dates):
        for a, b in rd:
            matches.append((mid, a, b))
            mid += 1

    # expand availabilities to slots (not persisted here)
    slots = []
    from cincy_csl.api.db import CourtAvailability, Court
    cas = session.query(CourtAvailability).filter(CourtAvailability.recurring == 1).all()
    slot_id = 1
    for week in range(req.weeks):
        base = start + timedelta(weeks=week)
        for ca in cas:
            days_ahead = (ca.weekday - base.weekday()) % 7
            slot_date = base + timedelta(days=days_ahead)
            hh, mm = map(int, ca.start_time.split(":"))
            dt = datetime(slot_date.year, slot_date.month, slot_date.day, hh, mm, tzinfo=timezone.utc)
            slots.append((slot_id, dt, ca.court_id))
            slot_id += 1

    assignments = assign_matches(matches, slots)

    result = {
        "matches": [],
        "assigned": [],
        "unassigned": [],
    }
    # prepare response lists
    for m in matches:
        mid = m[0]
        assigned_slot = assignments.get(mid)
        entry = {"id": mid, "home": m[1], "away": m[2], "slot_id": assigned_slot}
        result["matches"].append(entry)
        if assigned_slot is None:
            result["unassigned"].append(entry)
        else:
            s = next(s for s in slots if s[0] == assigned_slot)
            result["assigned"].append({**entry, "datetime": s[1].isoformat(), "court_id": s[2]})

    return result


@app.get("/admin/export_csv")
def export_csv(league_id: int, day: Optional[int] = None):
    """Export matches for a league as CSV. `day` is optional and should be 0..6 (JavaScript-style: 0=Sunday..6=Saturday).
    If `day` is provided it'll filter matches to that weekday (UTC)."""
    engine = create_engine("sqlite:///cincy_csl.db")
    session = get_session(engine)

    from cincy_csl.api.db import Match, Team

    # get matches for the league (using home team association)
    matches = (
        session.query(Match)
        .join(Team, Match.home_team)
        .filter(Team.league_id == league_id)
        .filter(Match.datetime != None)
        .all()
    )

    if not matches:
        raise HTTPException(status_code=404, detail="No matches found for that league")

    # If day filter provided, convert JS weekday (0=Sun..6=Sat) to Python weekday (0=Mon..6=Sun)
    if day is not None:
        py_wd = (int(day) + 6) % 7
        matches = [m for m in matches if m.datetime is not None and m.datetime.weekday() == py_wd]

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["match_id", "date", "time", "datetime", "home_team", "away_team", "court", "court_id"])

    for m in matches:
        dt = m.datetime
        if dt:
            iso = dt.isoformat()
            date = dt.date().isoformat()
            time = dt.time().isoformat()
        else:
            iso = ""
            date = ""
            time = ""
        # resolve team names
        home = session.get(Team, m.home_team_id).name if m.home_team_id else ""
        away = session.get(Team, m.away_team_id).name if m.away_team_id else ""
        writer.writerow([m.id, date, time, iso, home, away, m.court or "", m.court_id or ""])

    buf.seek(0)
    filename = f"league_{league_id}_matches.csv"
    headers = {"Content-Disposition": f"attachment; filename=\"{filename}\""}
    return Response(content=buf.getvalue(), media_type="text/csv", headers=headers)


@app.get("/admin/leagues")
def list_leagues():
    engine = create_engine("sqlite:///cincy_csl.db")
    session = get_session(engine)
    from cincy_csl.api.db import League

    leagues = session.query(League).all()
    return [
        {"id": l.id, "name": l.name, "day_of_week": l.day_of_week, "division": l.division}
        for l in leagues
    ]


@app.get("/admin/teams")
def list_teams(league_id: Optional[int] = Query(None)):
    engine = create_engine("sqlite:///cincy_csl.db")
    session = get_session(engine)
    from cincy_csl.api.db import Team

    q = session.query(Team)
    if league_id is not None:
        q = q.filter(Team.league_id == int(league_id))
    teams = q.all()
    return [
        {"id": t.id, "name": t.name, "captain_phone": t.captain_phone, "contact_email": t.contact_email, "league_id": t.league_id}
        for t in teams
    ]


@app.get("/admin/schedules")
def get_schedules(league_id: int, day: Optional[int] = Query(None)):
    """Return persisted matches for a league. Optional `day` filters by JS weekday 0=Sun..6=Sat."""
    engine = create_engine("sqlite:///cincy_csl.db")
    session = get_session(engine)
    from cincy_csl.api.db import Match, Team

    # fetch matches where the home team belongs to the league
    matches = (
        session.query(Match)
        .join(Team, Match.home_team)
        .filter(Team.league_id == int(league_id))
        .all()
    )

    if day is not None:
        py_wd = (int(day) + 6) % 7
        matches = [m for m in matches if m.datetime is not None and m.datetime.weekday() == py_wd]

    out = []
    for m in matches:
        home = session.get(Team, m.home_team_id).name if m.home_team_id else None
        away = session.get(Team, m.away_team_id).name if m.away_team_id else None
        out.append({
            "id": m.id,
            "home_team_id": m.home_team_id,
            "away_team_id": m.away_team_id,
            "home": home,
            "away": away,
            "datetime": m.datetime.isoformat() if m.datetime else None,
            "court": m.court,
            "court_id": m.court_id,
            "status": m.status,
        })

    return out


# Duplicate API routes under /api/admin to avoid conflicts when static files are mounted at /admin
@app.get("/api/admin/leagues")
def api_list_leagues():
    return list_leagues()


@app.get("/api/admin/teams")
def api_list_teams(league_id: Optional[int] = Query(None)):
    return list_teams(league_id)


@app.get("/api/admin/schedules")
def api_get_schedules(league_id: int, day: Optional[int] = Query(None)):
    return get_schedules(league_id, day)


@app.get("/api/admin/export_csv")
def api_export_csv(league_id: int, day: Optional[int] = None):
    return export_csv(league_id, day)


@app.post("/api/admin/preview_schedule")
def api_preview_schedule(req: PreviewRequest):
    return preview_schedule(req)

# If a built React app exists at web/dist, serve it at /admin (static)
if dist_dir.exists():
    app.mount("/admin", StaticFiles(directory=str(dist_dir), html=True), name="admin")
    # Some builds reference assets at the site root (/assets/...). To support those
    # requests when the app is mounted under /admin, also expose the built assets
    # at `/assets` so the JS/CSS can be loaded correctly.
    assets_dir = dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="admin_assets")


if not dist_dir.exists():
    @app.get("/admin", response_class=HTMLResponse)
    def admin_ui():
        html = """
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8" />
            <title>Cincy CSL Admin - Schedule Preview</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                table { border-collapse: collapse; width: 100%; margin-top: 12px }
                th, td { border: 1px solid #ddd; padding: 8px }
                th { background: #f4f4f4 }
            </style>
        </head>
        <body>
            <h1>Schedule Preview</h1>
            <form id="previewForm">
                <label>League ID: <input id="league" type="number" value="1" /></label>
                <label style="margin-left:12px">Weeks: <input id="weeks" type="number" value="8" /></label>
                <button type="submit">Preview</button>
            </form>
            <div id="output"></div>

            <script>
                const form = document.getElementById('previewForm');
                const out = document.getElementById('output');
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    out.innerHTML = 'Loading...';
                    const league = document.getElementById('league').value;
                    const weeks = document.getElementById('weeks').value;
                    const resp = await fetch('/admin/preview_schedule', {
                        method: 'POST', headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({league_id: Number(league), weeks: Number(weeks)})
                    });
                    if (!resp.ok) {
                        out.innerText = 'Error: ' + resp.statusText;
                        return;
                    }
                    const data = await resp.json();
                    // render assigned
                    let html = '';
                    html += '<h2>Assigned Matches</h2>';
                    html += '<table><thead><tr><th>ID</th><th>Home</th><th>Away</th><th>Date/Time</th><th>Court</th></tr></thead><tbody>';
                    for (const a of data.assigned) {
                        html += `<tr><td>${a.id}</td><td>${a.home}</td><td>${a.away}</td><td>${a.datetime}</td><td>${a.court_id}</td></tr>`;
                    }
                    html += '</tbody></table>';
                    if (data.unassigned && data.unassigned.length) {
                        html += '<h2>Unassigned Matches</h2>';
                        html += '<table><thead><tr><th>ID</th><th>Home</th><th>Away</th></tr></thead><tbody>';
                        for (const u of data.unassigned) {
                            html += `<tr><td>${u.id}</td><td>${u.home}</td><td>${u.away}</td></tr>`;
                        }
                        html += '</tbody></table>';
                    }
                    out.innerHTML = html;
                });
            </script>
        </body>
        </html>
        """
        return HTMLResponse(content=html)

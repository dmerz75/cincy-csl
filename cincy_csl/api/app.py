from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from cincy_csl.api.db import get_session, create_slots_from_availabilities
from cincy_csl.api.schedule import generate_rounds_for_n, schedule_dates
from cincy_csl.api.allocator import assign_matches
from sqlalchemy import create_engine
from fastapi.responses import HTMLResponse

app = FastAPI(title="Cincy CSL Admin API")


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

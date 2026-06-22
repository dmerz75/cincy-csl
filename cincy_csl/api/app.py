from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from cincy_csl.api.db import get_session, create_slots_from_availabilities
from cincy_csl.api.schedule import generate_rounds_for_n, schedule_dates
from cincy_csl.api.allocator import assign_matches
from sqlalchemy import create_engine

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

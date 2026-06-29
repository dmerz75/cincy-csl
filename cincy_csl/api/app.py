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

# Absolute path to the SQLite DB, relative to this file's project root
_DB_PATH = str(Path(__file__).parents[2] / "cincy_csl.db")
_DB_URL = f"sqlite:///{_DB_PATH}"


class PreviewRequest(BaseModel):
    league_id: int
    weeks: int = 9
    team_count: Optional[int] = None            # if set, use synthetic "Team 1"…"Team N" (no DB lookup)
    start_date: Optional[datetime] = None
    # Admin-supplied courts and time slots (overrides DB CourtAvailability when provided)
    courts: Optional[List[str]] = None          # e.g. ["Court 1", "Court 2"]
    time_slots: Optional[List[str]] = None      # e.g. ["18:00", "19:00", "20:00"]
    day_of_week: Optional[int] = None           # 0=Mon … 6=Sun (Python weekday)
    facility_id: Optional[int] = None           # auto-populates courts/time_slots from facility defaults if not explicitly set


@app.post("/admin/preview_schedule")
def preview_schedule(req: PreviewRequest):
    import math
    engine = create_engine(_DB_URL)
    session = get_session(engine)

    from cincy_csl.api.db import League, Team, Match as MatchModel
    league = session.get(League, req.league_id)
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    # ── 1. Resolve teams ──────────────────────────────────────────────────────
    if req.team_count is not None and req.team_count >= 2:
        teams = [f"Team {i+1}" for i in range(req.team_count)]
    else:
        teams = [t.name for t in session.query(Team).filter_by(league_id=league.id).all()]
        if not teams:
            raise HTTPException(
                status_code=400,
                detail="No teams in league — add teams or supply team_count"
            )

    rounds = generate_rounds_for_n(teams, req.weeks)
    start = req.start_date or datetime.now(timezone.utc)
    dates = schedule_dates(start, len(rounds), interval_days=7)

    # ── 2. Build match list ───────────────────────────────────────────────────
    matches = []
    mid = 1
    for rd, dt in zip(rounds, dates):
        for a, b in rd:
            matches.append((mid, a, b))
            mid += 1

    # ── 2b. Auto-populate courts/time_slots from facility if not explicitly set ──
    resolved_facility_id = None
    if not req.courts or not req.time_slots:
        if req.facility_id:
            from cincy_csl.api.db import Facility
            facility = session.get(Facility, req.facility_id)
            if facility and facility.default_courts and facility.default_time_slots:
                fcourts = [c.strip() for c in facility.default_courts.split(",") if c.strip()]
                fslots  = [s.strip() for s in facility.default_time_slots.split(",") if s.strip()]
                if not req.courts and fcourts:
                    req.courts = fcourts
                if not req.time_slots and fslots:
                    req.time_slots = fslots
                resolved_facility_id = req.facility_id

    # ── 3. Capacity stats ─────────────────────────────────────────────────────
    courts_list   = req.courts or []
    slots_list    = req.time_slots or []
    capacity_per_week = len(courts_list) * len(slots_list)
    total_matches = len(matches)
    min_weeks_needed = (
        math.ceil(total_matches / capacity_per_week) if capacity_per_week > 0 else req.weeks
    )

    # ── 4. Build slot grid ────────────────────────────────────────────────────
    slots = []
    from cincy_csl.api.db import CourtAvailability, Court
    slot_id = 1

    if req.courts and req.time_slots:
        court_names   = req.courts
        time_strs     = req.time_slots
        target_weekday = req.day_of_week
        for week in range(req.weeks):
            base = start + timedelta(weeks=week)
            for court_name in court_names:
                for ts in time_strs:
                    if target_weekday is not None:
                        days_ahead = (target_weekday - base.weekday()) % 7
                        slot_date  = base + timedelta(days=days_ahead)
                    else:
                        slot_date = base
                    hh, mm = map(int, ts.split(":"))
                    dt = datetime(slot_date.year, slot_date.month, slot_date.day,
                                  hh, mm, tzinfo=timezone.utc)
                    slots.append((slot_id, dt, court_name))
                    slot_id += 1
    else:
        cas = session.query(CourtAvailability).filter(CourtAvailability.recurring == 1).all()
        for week in range(req.weeks):
            base = start + timedelta(weeks=week)
            for ca in cas:
                days_ahead = (ca.weekday - base.weekday()) % 7
                slot_date  = base + timedelta(days=days_ahead)
                hh, mm = map(int, ca.start_time.split(":"))
                dt = datetime(slot_date.year, slot_date.month, slot_date.day,
                              hh, mm, tzinfo=timezone.utc)
                slots.append((slot_id, dt, ca.court_id))
                slot_id += 1

    # ── 5. Cross-league conflict avoidance ────────────────────────────────────
    # Remove any (datetime, court) pairs already taken by other leagues at
    # the same courts, so leagues sharing a facility on the same day don't overlap.
    slots_blocked = 0
    if req.courts:
        existing = (
            session.query(MatchModel.datetime, MatchModel.court)
            .join(Team, MatchModel.home_team)
            .filter(Team.league_id != req.league_id)
            .filter(MatchModel.court.in_(req.courts))
            .filter(MatchModel.datetime.isnot(None))
            .all()
        )
        taken = set()
        for row in existing:
            dt_key = (
                row.datetime.replace(tzinfo=timezone.utc)
                if row.datetime.tzinfo is None
                else row.datetime
            )
            taken.add((dt_key, row.court))
        before = len(slots)
        slots = [(sid, dt, ct) for (sid, dt, ct) in slots if (dt, ct) not in taken]
        slots_blocked = before - len(slots)

    # ── 6. Assign and build response ──────────────────────────────────────────
    assignments = assign_matches(matches, slots)

    result = {
        "matches":          [],
        "assigned":         [],
        "unassigned":       [],
        "capacity_per_week": capacity_per_week,
        "total_matches":    total_matches,
        "min_weeks_needed": min_weeks_needed,
        "slots_blocked":    slots_blocked,
        "facility_id":      resolved_facility_id,
    }
    for m in matches:
        mid = m[0]
        assigned_slot = assignments.get(mid)
        entry = {"id": mid, "home": m[1], "away": m[2], "slot_id": assigned_slot}
        result["matches"].append(entry)
        if assigned_slot is None:
            result["unassigned"].append(entry)
        else:
            s = next(s for s in slots if s[0] == assigned_slot)
            result["assigned"].append(
                {**entry, "datetime": s[1].isoformat(), "court_id": s[2], "court": str(s[2]),
                 "facility_id": resolved_facility_id}
            )

    return result


@app.get("/admin/export_csv")
def export_csv(league_id: int, day: Optional[int] = None):
    """Export matches for a league as CSV. `day` is optional and should be 0..6 (JavaScript-style: 0=Sunday..6=Saturday).
    If `day` is provided it'll filter matches to that weekday (UTC)."""
    engine = create_engine(_DB_URL)
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
    engine = create_engine(_DB_URL)
    session = get_session(engine)
    from cincy_csl.api.db import League

    leagues = session.query(League).all()
    return [
        {"id": l.id, "name": l.name, "day_of_week": l.day_of_week, "division": l.division}
        for l in leagues
    ]


class CreateLeagueRequest(BaseModel):
    name: str
    day_of_week: int          # 0=Monday … 6=Sunday
    division: Optional[str] = None
    gender: Optional[str] = None   # Men | Women | Coed (stored as part of name)


@app.post("/admin/leagues", status_code=201)
def create_league(req: CreateLeagueRequest):
    engine = create_engine(_DB_URL)
    session = get_session(engine)
    from cincy_csl.api.db import League
    league = League(name=req.name, day_of_week=req.day_of_week, division=req.division)
    session.add(league)
    session.commit()
    session.refresh(league)
    return {"id": league.id, "name": league.name, "day_of_week": league.day_of_week, "division": league.division}


@app.delete("/admin/leagues/{league_id}", status_code=204)
def delete_league(league_id: int):
    engine = create_engine(_DB_URL)
    session = get_session(engine)
    from cincy_csl.api.db import League, Team, Match as MatchModel
    league = session.get(League, league_id)
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    # Delete matches belonging to teams in this league
    team_ids = [t.id for t in session.query(Team).filter_by(league_id=league_id).all()]
    if team_ids:
        session.query(MatchModel).filter(
            (MatchModel.home_team_id.in_(team_ids)) | (MatchModel.away_team_id.in_(team_ids))
        ).delete(synchronize_session=False)
        session.query(Team).filter(Team.league_id == league_id).delete(synchronize_session=False)
    session.delete(league)
    session.commit()


# ── Facilities ────────────────────────────────────────────────────────────────

class FacilityRequest(BaseModel):
    name: str
    default_courts: Optional[List[str]] = None    # ["Court 1", "Court 2"]
    default_time_slots: Optional[List[str]] = None # ["18:00", "19:00", "20:00"]
    address: Optional[str] = None


def _facility_out(f):
    return {
        "id": f.id,
        "name": f.name,
        "address": f.address,
        "default_courts": f.default_courts.split(",") if f.default_courts else [],
        "default_time_slots": f.default_time_slots.split(",") if f.default_time_slots else [],
    }


@app.get("/admin/facilities")
def list_facilities():
    from cincy_csl.api.db import Facility
    engine = create_engine(_DB_URL)
    session = get_session(engine)
    return [_facility_out(f) for f in session.query(Facility).all()]


@app.post("/admin/facilities", status_code=201)
def create_facility(req: FacilityRequest):
    from cincy_csl.api.db import Facility
    engine = create_engine(_DB_URL)
    session = get_session(engine)
    f = Facility(
        name=req.name,
        address=req.address,
        default_courts=",".join(req.default_courts) if req.default_courts else None,
        default_time_slots=",".join(req.default_time_slots) if req.default_time_slots else None,
    )
    session.add(f); session.commit(); session.refresh(f)
    return _facility_out(f)


@app.put("/admin/facilities/{facility_id}")
def update_facility(facility_id: int, req: FacilityRequest):
    from cincy_csl.api.db import Facility
    engine = create_engine(_DB_URL)
    session = get_session(engine)
    f = session.get(Facility, facility_id)
    if not f:
        raise HTTPException(status_code=404, detail="Facility not found")
    f.name = req.name
    f.address = req.address
    f.default_courts = ",".join(req.default_courts) if req.default_courts else None
    f.default_time_slots = ",".join(req.default_time_slots) if req.default_time_slots else None
    session.commit(); session.refresh(f)
    return _facility_out(f)


@app.get("/admin/teams")
def list_teams(league_id: Optional[int] = Query(None)):
    engine = create_engine(_DB_URL)
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
    engine = create_engine(_DB_URL)
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
            "facility_id": m.facility_id,
            "status": m.status,
        })

    return out


# Duplicate API routes under /api/admin to avoid conflicts when static files are mounted at /admin
@app.get("/api/admin/leagues")
def api_list_leagues():
    return list_leagues()


@app.post("/api/admin/leagues", status_code=201)
def api_create_league(req: CreateLeagueRequest):
    return create_league(req)


@app.delete("/api/admin/leagues/{league_id}", status_code=204)
def api_delete_league(league_id: int):
    return delete_league(league_id)


@app.get("/api/admin/facilities")
def api_list_facilities():
    return list_facilities()


@app.post("/api/admin/facilities", status_code=201)
def api_create_facility(req: FacilityRequest):
    return create_facility(req)


@app.put("/api/admin/facilities/{facility_id}")
def api_update_facility(facility_id: int, req: FacilityRequest):
    return update_facility(facility_id, req)


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


class CommitMatchEntry(BaseModel):
    home: str
    away: str
    datetime: Optional[str] = None
    court: Optional[str] = None
    facility_id: Optional[int] = None


class CommitScheduleRequest(BaseModel):
    league_id: int
    team_count: Optional[int] = None   # if set, creates/replaces synthetic teams
    matches: List[CommitMatchEntry]    # the assigned matches from the preview


@app.post("/api/admin/commit_schedule", status_code=201)
def commit_schedule(req: CommitScheduleRequest):
    """Persist a previewed schedule to the DB exactly as shown."""
    engine = create_engine(_DB_URL)
    session = get_session(engine)
    from cincy_csl.api.db import League, Team, Court, Match as MatchModel

    league = session.get(League, req.league_id)
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    existing_teams = session.query(Team).filter_by(league_id=req.league_id).all()
    team_ids = [t.id for t in existing_teams]

    # Always clear old matches for this league first
    if team_ids:
        session.query(MatchModel).filter(
            (MatchModel.home_team_id.in_(team_ids)) | (MatchModel.away_team_id.in_(team_ids))
        ).delete(synchronize_session=False)

    # If team_count given, replace synthetic teams to match
    if req.team_count and req.team_count >= 2:
        if team_ids:
            session.query(Team).filter(Team.league_id == req.league_id).delete(synchronize_session=False)
        for i in range(req.team_count):
            session.add(Team(name=f"{league.name} Team {i+1}", league_id=req.league_id))
        session.commit()

    # Build name → id map (includes any newly created teams)
    all_teams = session.query(Team).filter_by(league_id=req.league_id).all()
    team_map = {t.name: t.id for t in all_teams}

    # Upsert teams that appear in the match list but aren’t in the DB yet
    needed = set()
    for m in req.matches:
        needed.add(m.home); needed.add(m.away)
    for name in needed:
        if name not in team_map:
            t = Team(name=name, league_id=req.league_id)
            session.add(t)
    session.commit()
    all_teams = session.query(Team).filter_by(league_id=req.league_id).all()
    team_map = {t.name: t.id for t in all_teams}

    # Load courts table for name → id resolution
    all_courts = session.query(Court).all()
    court_map = {c.name: c.id for c in all_courts}

    saved = 0
    for m in req.matches:
        home_id = team_map.get(m.home)
        away_id = team_map.get(m.away)
        if not home_id or not away_id:
            continue
        dt_val = datetime.fromisoformat(m.datetime.replace('Z','+00:00')) if m.datetime else None
        # Resolve court string like "Court 5" to its court_id FK
        court_id = court_map.get(m.court) if m.court else None
        session.add(MatchModel(
            home_team_id=home_id,
            away_team_id=away_id,
            datetime=dt_val,
            court=m.court,
            court_id=court_id,
            facility_id=m.facility_id,
            status="scheduled",
        ))
        saved += 1

    session.commit()
    return {"saved": saved, "league_id": req.league_id, "league_name": league.name}


@app.get("/api/admin/all_matches")
def api_all_matches():
    """Return all persisted matches across every league, with league_id and league_name."""
    engine = create_engine(_DB_URL)
    session = get_session(engine)
    from cincy_csl.api.db import Match, Team, League

    rows = (
        session.query(Match, Team, League)
        .join(Team, Match.home_team)
        .join(League, Team.league_id == League.id)
        .filter(Match.datetime.isnot(None))
        .all()
    )

    out = []
    for m, home_team, league in rows:
        away = session.get(Team, m.away_team_id).name if m.away_team_id else None
        out.append({
            "id": m.id,
            "home": home_team.name,
            "away": away,
            "datetime": m.datetime.isoformat(),
            "court": m.court,
            "court_id": m.court_id,
            "facility_id": m.facility_id,
            "status": m.status,
            "league_id": league.id,
            "league_name": league.name,
        })
    return out

@app.get("/api/admin/slot_grid")
def api_slot_grid(facility_id: Optional[int] = Query(None), weeks: int = Query(8)):
    """Return all time slots organized by day with match occupancy data for the Day Grid view."""
    from cincy_csl.api.db import Court, CourtAvailability, Match, Team, League, Facility
    engine = create_engine(_DB_URL)
    session = get_session(engine)

    # 1. Resolve facility
    if facility_id:
        facility = session.get(Facility, facility_id)
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")
    else:
        facility = session.query(Facility).first()
        if not facility:
            raise HTTPException(status_code=404, detail="No facilities found")

    # 2. Get court names from facility.default_courts
    court_names = [c.strip() for c in (facility.default_courts or "").split(",") if c.strip()]
    if not court_names:
        raise HTTPException(status_code=400, detail="Facility has no courts configured")

    # 3. Map court names to IDs from courts table
    courts = session.query(Court).filter(Court.name.in_(court_names)).all()
    if not courts:
        raise HTTPException(status_code=400, detail="No courts found in database matching facility courts")
    court_ids = [c.id for c in courts]
    court_id_to_name = {c.id: c.name for c in courts}

    # 4. Get CourtAvailability rows for those courts (recurring=1)
    availabilities = session.query(CourtAvailability).filter(
        CourtAvailability.court_id.in_(court_ids),
        CourtAvailability.recurring == 1
    ).all()

    # 5. Build set of all time slots across all courts
    # 6. Build lookup: for each court, which time slots it has
    all_time_slots = set()
    court_times_map = {}
    target_weekday = None

    for ca in availabilities:
        ts = ca.start_time
        all_time_slots.add(ts)
        if ca.court_id not in court_times_map:
            court_times_map[ca.court_id] = set()
        court_times_map[ca.court_id].add(ts)
        if target_weekday is None:
            target_weekday = ca.weekday

    # Fallback if no CourtAvailability rows — use facility defaults
    if not availabilities:
        default_slots = [s.strip() for s in (facility.default_time_slots or "").split(",") if s.strip()]
        if not default_slots:
            raise HTTPException(status_code=400, detail="No time slots configured for facility")
        all_time_slots = set(default_slots)
        target_weekday = 0  # Default to Monday
        for cid in court_ids:
            court_times_map[cid] = set(default_slots)

    all_time_slots = sorted(all_time_slots)
    court_times_out = {str(cid): sorted(court_times_map.get(cid, set())) for cid in court_ids}

    # 7. Generate days starting from next occurrence of target weekday
    now = datetime.now(timezone.utc)
    today_wd = now.weekday()
    days_ahead = (target_weekday - today_wd) % 7
    if days_ahead == 0:
        days_ahead = 7  # Next week if today is the target day
    first_day = (now + timedelta(days=days_ahead)).replace(hour=0, minute=0, second=0, microsecond=0)
    date_range_end = first_day + timedelta(weeks=weeks)

    # 9. Query existing Match rows within the date range
    existing_matches = session.query(Match).filter(
        Match.court_id.in_(court_ids),
        Match.datetime >= first_day,
        Match.datetime < date_range_end,
        Match.datetime.isnot(None)
    ).all()

    # Build booked lookup: (date_iso, court_id, time) -> match_info
    booked = {}
    for m in existing_matches:
        dt = m.datetime
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        date_key = dt.date().isoformat()
        time_key = f"{dt.hour:02d}:{dt.minute:02d}"

        home_team = session.get(Team, m.home_team_id)
        away_team = session.get(Team, m.away_team_id)
        league = None
        if home_team and home_team.league_id:
            league = session.get(League, home_team.league_id)

        booked[(date_key, m.court_id, time_key)] = {
            "match_id": m.id,
            "home": home_team.name if home_team else "?",
            "away": away_team.name if away_team else "?",
            "league_id": league.id if league else None,
            "league_name": league.name if league else None,
            "status": m.status,
        }

    DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    # 8+10. For each day, generate (court, time) cells with match info
    days = []
    for w in range(weeks):
        day_date = first_day + timedelta(weeks=w)
        date_iso = day_date.date().isoformat()

        slots_arr = []
        booked_count = 0
        total_count = 0

        for cid in court_ids:
            cname = court_id_to_name.get(cid, str(cid))
            available_times = court_times_map.get(cid, set())

            for ts in all_time_slots:
                total_count += 1
                cell_available = ts in available_times
                match_info = booked.get((date_iso, cid, ts))

                if match_info:
                    booked_count += 1
                    slots_arr.append({
                        "court_id": cid,
                        "court_name": cname,
                        "time": ts,
                        "status": "booked",
                        "match": match_info,
                    })
                elif cell_available:
                    slots_arr.append({
                        "court_id": cid,
                        "court_name": cname,
                        "time": ts,
                        "status": "available",
                        "match": None,
                    })
                else:
                    slots_arr.append({
                        "court_id": cid,
                        "court_name": cname,
                        "time": ts,
                        "status": "unavailable",
                        "match": None,
                    })

        days.append({
            "date": date_iso,
            "day_name": DAY_NAMES[target_weekday] if 0 <= target_weekday < 7 else "",
            "slots": slots_arr,
            "booked": booked_count,
            "total": total_count,
        })

    # Build facility info response
    facility_info = {
        "id": facility.id,
        "name": facility.name,
        "courts": [{"id": c.id, "name": c.name} for c in courts],
    }

    return {
        "facility": facility_info,
        "all_time_slots": all_time_slots,
        "court_times": court_times_out,
        "days": days,
    }


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

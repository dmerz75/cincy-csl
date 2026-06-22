"""Demo: generate schedule for Monday-C1-Coed, define court availabilities, and assign matches to slots using OR-Tools."""
from datetime import datetime, time, timedelta, timezone
from sqlalchemy import create_engine

from cincy_csl.api.db import (
    init_db,
    get_session,
    create_league,
    create_team,
    create_player,
    create_court,
    create_court_availability,
    save_matches,
)
from cincy_csl.api.schedule import round_robin, schedule_dates, generate_rounds_for_n
from cincy_csl.api.allocator import assign_matches


def expand_recurring_availabilities(session, league, start_date, weeks=8):
    # build slot list as tuples (slot_id, datetime, court_id)
    slots = []
    from cincy_csl.api.db import CourtAvailability, Court
    court_map = {c.id: c for c in session.query(Court).all()}
    cas = session.query(CourtAvailability).filter(CourtAvailability.recurring == 1).all()
    slot_id = 1
    for week in range(weeks):
        base = start_date + timedelta(weeks=week)
        for ca in cas:
            # find date for this week's weekday
            days_ahead = (ca.weekday - base.weekday()) % 7
            slot_date = base + timedelta(days=days_ahead)
            # parse start_time
            hh, mm = map(int, ca.start_time.split(":"))
            dt = datetime(slot_date.year, slot_date.month, slot_date.day, hh, mm, tzinfo=timezone.utc)
            slots.append((slot_id, dt, ca.court_id))
            slot_id += 1
    return slots


def main(db_path: str = "sqlite:///cincy_csl.db"):
    engine = create_engine(db_path)
    init_db(engine)
    session = get_session(engine)

    # assume league + teams + players created by create_practice_league
    from cincy_csl.api.db import League, Team, Court, CourtAvailability

    league = session.query(League).first()
    if not league:
        print("No league found. Run create_practice_league.py first.")
        return

    # create courts and availabilities for demo
    court4 = create_court(session, "Court 4")
    court5 = create_court(session, "Court 5")
    court7 = create_court(session, "Court 7")

    # Courts 4 & 5: 6pm and 7pm recurring on league day
    create_court_availability(session, court4, weekday=league.day_of_week, start_time="18:00", end_time="19:00", recurring=True)
    create_court_availability(session, court4, weekday=league.day_of_week, start_time="19:00", end_time="20:00", recurring=True)
    create_court_availability(session, court5, weekday=league.day_of_week, start_time="18:00", end_time="19:00", recurring=True)
    create_court_availability(session, court5, weekday=league.day_of_week, start_time="19:00", end_time="20:00", recurring=True)

    # Court 7: 20:00,21:00,22:00
    create_court_availability(session, court7, weekday=league.day_of_week, start_time="20:00", end_time="21:00", recurring=True)
    create_court_availability(session, court7, weekday=league.day_of_week, start_time="21:00", end_time="22:00", recurring=True)
    create_court_availability(session, court7, weekday=league.day_of_week, start_time="22:00", end_time="23:00", recurring=True)

    # build rounds from teams in league
    teams = [t.name for t in session.query(Team).filter_by(league_id=league.id).all()]
    rounds = generate_rounds_for_n(teams, 8)
    start = datetime.now(timezone.utc)
    dates = schedule_dates(start, len(rounds), interval_days=7)

    # persist matches to DB (pending)
    from cincy_csl.api.db import Match, Slot, create_match, create_slots_from_availabilities, persist_assignments, Court

    matches = []
    # create Match rows and collect their ids
    for rd, dt in zip(rounds, dates):
        for a, b in rd:
            m = create_match(session, a, b)
            matches.append((m.id, a, b))

    # create concrete Slot rows from recurring availabilities
    slots_rows = create_slots_from_availabilities(session, dates[0], weeks=8)
    slots = [(s.id, s.datetime, s.court_id) for s in slots_rows]

    # run allocator
    assignments = assign_matches(matches, slots)

    # persist assignments back to Match rows
    persist_assignments(session, assignments)

    # print assignments
    court_map = {c.id: c for c in session.query(Court).all()}
    for m in matches:
        mid = m[0]
        slot = assignments.get(mid)
        if slot is None:
            print(f"Match {mid} {m[1]} vs {m[2]} UNASSIGNED")
        else:
            s = next(s for s in slots if s[0] == slot)
            print(f"Match {mid} {m[1]} vs {m[2]} -> {s[1].isoformat()} on {court_map[s[2]].name}")


if __name__ == "__main__":
    main()

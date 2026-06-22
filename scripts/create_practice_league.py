"""Create a practice league: 6 teams, 4 players each, 8 weekly rounds + 1 tournament week.
Persists results to `cincy_csl.db` in the project root.
"""
import random
from datetime import datetime
from sqlalchemy import create_engine

from cincy_csl.api.schedule import round_robin, schedule_dates
from cincy_csl.api.db import (
    init_db,
    get_session,
    create_team,
    create_player,
    create_league,
    save_matches,
)


TEAM_NAMES = ["Aces", "Block Party", "Net Results", "Volley Llamas", "Spikers", "Set To Kill"]
PLAYERS_PER_TEAM = 4


def generate_rounds_for_n(teams, n_rounds):
    """Generate exactly `n_rounds` rounds (each round is a list of pairs).

    For fairness we cycle through the base round-robin rounds and for subsequent
    cycles we flip home/away to vary matchups.
    """
    base_rounds = round_robin(teams)  # for 6 teams, this yields 5 rounds
    rounds = []
    i = 0
    while len(rounds) < n_rounds:
        r = base_rounds[i % len(base_rounds)]
        # flip home/away on alternate cycles to mix schedule
        cycle = (i // len(base_rounds))
        if cycle % 2 == 1:
            r = [(b, a) for (a, b) in r]
        rounds.append(r)
        i += 1
    return rounds


def align_to_weekday(start_date, target_weekday):
    from datetime import timedelta

    days_ahead = (target_weekday - start_date.weekday()) % 7
    return start_date + timedelta(days=days_ahead)


def main(db_path: str = "sqlite:///cincy_csl.db"):
    engine = create_engine(db_path)
    init_db(engine)
    session = get_session(engine)

    # Create a league (Monday-C1-Coed)
    league = create_league(session, name="Monday-C1-Coed", day_of_week=0, division="C1")

    # Create teams and players and assign to league
    teams = []
    for tname in TEAM_NAMES:
        team = create_team(session, tname, captain_phone=None, contact_email=None, league_id=league.id)
        teams.append(team)
        # create 4 players
        for i in range(1, PLAYERS_PER_TEAM + 1):
            create_player(session, team, first_name=f"{tname}_P{i}")

    # Schedule 8 rounds (6 teams -> 3 matches per round)
    team_names = [t.name for t in teams]
    rounds = generate_rounds_for_n(team_names, 8)
    # Align start date to league day_of_week
    start = align_to_weekday(datetime.utcnow(), league.day_of_week)
    dates = schedule_dates(start, len(rounds), interval_days=7)

    matches_to_save = []
    for rd, dt in zip(rounds, dates):
        for a, b in rd:
            matches_to_save.append((a, b, dt, "Court 1"))

    saved = save_matches(session, matches_to_save)

    # Tournament week: simple random bracket (pair teams randomly for one round)
    random.shuffle(team_names)
    tour_pairs = [(team_names[i], team_names[i + 1]) for i in range(0, len(team_names), 2)]
    tour_date = dates[-1] + (dates[1] - dates[0]) if len(dates) > 1 else dates[-1]
    tour_matches = [(a, b, tour_date, "Tournament Court") for a, b in tour_pairs]
    saved_tour = save_matches(session, tour_matches)

    # Print summary
    print(f"Created {len(teams)} teams with {PLAYERS_PER_TEAM} players each.")
    print(f"Scheduled {len(saved)} regular matches across {len(rounds)} rounds.")
    print(f"Added {len(saved_tour)} tournament matches on {tour_date}.")
    print("Sample schedule (first 12 matches):")
    from cincy_csl.api.db import Match, Team as TeamModel
    for m in session.query(Match).order_by(Match.datetime).limit(12).all():
        home = session.get(TeamModel, m.home_team_id)
        away = session.get(TeamModel, m.away_team_id)
        print(f"{m.datetime.date()} - {home.name} vs {away.name} @ {m.court}")


if __name__ == "__main__":
    main()

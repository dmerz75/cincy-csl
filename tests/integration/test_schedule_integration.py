import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from cincy_csl.api.schedule import round_robin, schedule_dates
from cincy_csl.api.db import init_db, get_session, create_team, save_matches, notify_captains_for_date


class DummyNotifier:
    def __init__(self):
        self.sent = []

    def send_sms(self, phone, message):
        self.sent.append((phone, message))


@pytest.fixture()
def in_memory_session():
    engine = create_engine("sqlite:///:memory:")
    init_db(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_round_robin_and_db_persistence_and_notifications(in_memory_session):
    session = in_memory_session
    teams = ["Spikers", "Block Party", "Net Results", "Volley Llamas"]
    # create teams with captain phones
    for i, name in enumerate(teams):
        create_team(session, name, captain_phone=f"+1555000{i}")

    rounds = round_robin(teams)
    assert len(rounds) == len(teams) - 1

    dates = schedule_dates(datetime.now(timezone.utc), len(rounds))

    matches_to_save = []
    for rd, dt in zip(rounds, dates):
        for a, b in rd:
            matches_to_save.append((a, b, dt, "Court 1"))

    created = save_matches(session, matches_to_save)
    # expected number of matches for 4 teams = 6
    assert len(created) == 6

    # ensure no team plays more than once on same datetime
    from cincy_csl.api.db import Match

    for dt in dates:
        matches_on_date = session.query(Match).filter(Match.datetime == dt).all()
        teams_playing = []
        for m in matches_on_date:
            teams_playing.append(m.home_team_id)
            teams_playing.append(m.away_team_id)
        # unique set size should equal list size (no duplicates)
        assert len(teams_playing) == len(set(teams_playing))

    # mock notifications
    notifier = DummyNotifier()
    calls = notify_captains_for_date(session, dates[0], notifier)
    # Each match notifies two captains
    assert len(notifier.sent) == len(session.query(Match).filter(Match.datetime == dates[0]).all()) * 2

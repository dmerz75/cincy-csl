from datetime import datetime, timezone
from typing import List, Tuple

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    create_engine,
)
from sqlalchemy.orm import sessionmaker, relationship, declarative_base

Base = declarative_base()


class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    captain_phone = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=True)


class Match(Base):
    __tablename__ = "matches"
    id = Column(Integer, primary_key=True)
    home_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    away_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    datetime = Column(DateTime(timezone=True), nullable=True)
    court = Column(String, nullable=True)
    status = Column(String, default="scheduled")
    court_id = Column(Integer, ForeignKey("courts.id"), nullable=True)

    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])


class Player(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)

    team = relationship("Team", foreign_keys=[team_id])


class League(Base):
    __tablename__ = "leagues"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Monday .. 6=Sunday
    division = Column(String, nullable=True)


class Court(Base):
    __tablename__ = "courts"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)


class CourtAvailability(Base):
    __tablename__ = "court_availabilities"
    id = Column(Integer, primary_key=True)
    court_id = Column(Integer, ForeignKey("courts.id"), nullable=False)
    weekday = Column(Integer, nullable=True)  # 0=Mon..6=Sun for recurring
    start_time = Column(String, nullable=False)  # HH:MM
    end_time = Column(String, nullable=False)    # HH:MM
    recurring = Column(Integer, default=1)  # 1=true, 0=false

    court = relationship("Court", foreign_keys=[court_id])


class Slot(Base):
    __tablename__ = "slots"
    id = Column(Integer, primary_key=True)
    court_id = Column(Integer, ForeignKey("courts.id"), nullable=False)
    datetime = Column(DateTime(timezone=True), nullable=False)
    available = Column(Integer, default=1)

    court = relationship("Court", foreign_keys=[court_id])


def init_db(engine):
    Base.metadata.create_all(engine)


def get_session(engine):
    Session = sessionmaker(bind=engine)
    return Session()


def create_team(session, name: str, captain_phone: str = None, contact_email: str = None) -> Team:
    t = Team(name=name, captain_phone=captain_phone, contact_email=contact_email)
    session.add(t)
    session.commit()
    session.refresh(t)
    return t


def create_league(session, name: str, day_of_week: int, division: str = None) -> League:
    l = League(name=name, day_of_week=day_of_week, division=division)
    session.add(l)
    session.commit()
    session.refresh(l)
    return l


def create_team(session, name: str, captain_phone: str = None, contact_email: str = None, league_id: int = None) -> Team:
    t = Team(name=name, captain_phone=captain_phone, contact_email=contact_email, league_id=league_id)
    session.add(t)
    session.commit()
    session.refresh(t)
    return t


def create_court(session, name: str) -> Court:
    c = Court(name=name)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def create_court_availability(session, court: Court, weekday: int, start_time: str, end_time: str, recurring: bool = True) -> CourtAvailability:
    ca = CourtAvailability(court_id=court.id, weekday=weekday, start_time=start_time, end_time=end_time, recurring=1 if recurring else 0)
    session.add(ca)
    session.commit()
    session.refresh(ca)
    return ca


def create_slot(session, court: Court, dt: datetime) -> Slot:
    s = Slot(court_id=court.id, datetime=dt)
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


def create_slots_from_availabilities(session, start_date: datetime, weeks: int = 8):
    """Expand recurring `CourtAvailability` rows into concrete `Slot` rows for `weeks` weeks starting at `start_date`."""
    from datetime import timedelta
    cas = session.query(CourtAvailability).filter(CourtAvailability.recurring == 1).all()
    slots = []
    for week in range(weeks):
        base = start_date + timedelta(weeks=week)
        for ca in cas:
            days_ahead = (ca.weekday - base.weekday()) % 7
            slot_date = base + timedelta(days=days_ahead)
            hh, mm = map(int, ca.start_time.split(":"))
            dt = datetime(slot_date.year, slot_date.month, slot_date.day, hh, mm, tzinfo=timezone.utc)
            s = create_slot(session, session.get(Court, ca.court_id), dt)
            slots.append(s)
    return slots


def create_match(session, home_name: str, away_name: str):
    """Create a Match row without datetime/court (to be assigned later)."""
    name_to_team = {t.name: t for t in session.query(Team).all()}
    home = name_to_team.get(home_name)
    away = name_to_team.get(away_name)
    if not home or not away:
        raise ValueError("Team not found when creating match")
    m = Match(home_team_id=home.id, away_team_id=away.id, datetime=None, court=None, status="pending")
    session.add(m)
    session.commit()
    session.refresh(m)
    return m


def persist_assignments(session, assignments: dict):
    """Given assignments mapping match_id -> slot_id, update Match rows with slot datetime and court_id."""
    for mid, sid in assignments.items():
        m = session.get(Match, mid)
        if sid is None:
            continue
        s = session.get(Slot, sid)
        m.datetime = s.datetime
        m.court_id = s.court_id
        m.court = s.court.name if s.court else None
    session.commit()


def create_player(session, team: Team, first_name: str, last_name: str = None, phone: str = None, email: str = None) -> Player:
    p = Player(team_id=team.id, first_name=first_name, last_name=last_name, phone=phone, email=email)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


def save_matches(session, matches: List[Tuple[str, str, datetime, str]]):
    """Persist matches where each item is (home_name, away_name, datetime, court)."""
    name_to_team = {t.name: t for t in session.query(Team).all()}
    created = []
    for home_name, away_name, dt, court in matches:
        home = name_to_team.get(home_name)
        away = name_to_team.get(away_name)
        if not home or not away:
            raise ValueError("Team not found when saving match")
        m = Match(home_team_id=home.id, away_team_id=away.id, datetime=dt, court=court)
        session.add(m)
        created.append(m)
    session.commit()
    return created


def notify_captains_for_date(session, target_date, notifier):
    """Notify captains for all matches on the given date (date or datetime).

    `notifier` must provide `send_sms(phone, message)`.
    """
    # normalize date to date portion
    day_start = datetime(target_date.year, target_date.month, target_date.day)
    day_end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59)
    matches = (
        session.query(Match)
        .filter(Match.datetime >= day_start)
        .filter(Match.datetime <= day_end)
        .all()
    )
    calls = []
    for m in matches:
        home = session.query(Team).get(m.home_team_id)
        away = session.query(Team).get(m.away_team_id)
        msg = f"Match today: {home.name} vs {away.name} at {m.datetime.isoformat()} on {m.court or 'TBD'}"
        if home.captain_phone:
            notifier.send_sms(home.captain_phone, msg)
            calls.append((home.captain_phone, msg))
        if away.captain_phone:
            notifier.send_sms(away.captain_phone, msg)
            calls.append((away.captain_phone, msg))
    return calls

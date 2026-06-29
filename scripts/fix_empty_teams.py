"""
Migration: Add 6 teams to each existing league, clean up orphaned player records.

Run from project root:
    cd /Users/merzd/git/cincy-csl
    .venv/bin/python scripts/fix_empty_teams.py
"""
import sys
import os

# Ensure project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from cincy_csl.api.db import League, Team, Player, get_session

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cincy_csl.db")
DB_URL = f"sqlite:///{DB_PATH}"


def main():
    engine = create_engine(DB_URL)
    session = get_session(engine)

    print("=" * 60)
    print("FIX EMPTY TEAMS MIGRATION")
    print("=" * 60)

    # ── 1. Clean up orphaned player records ──────────────────────────────
    existing_team_ids = {t.id for t in session.query(Team).all()}
    if existing_team_ids:
        orphan_players = session.query(Player).filter(
            Player.team_id.notin_(existing_team_ids)
        ).all()
    else:
        orphan_players = session.query(Player).all()

    print(f"\n[1/3] Orphaned player records: {len(orphan_players)}")
    for p in orphan_players:
        session.delete(p)
    session.commit()
    print(f"       Deleted {len(orphan_players)} orphaned player(s).")

    # ── 2. Clear existing teams for all leagues (starting fresh) ─────────
    leagues = session.query(League).all()
    print(f"\n[2/3] Found {len(leagues)} league(s):")
    for league in leagues:
        old_teams = session.query(Team).filter_by(league_id=league.id).all()
        print(f"       League '{league.name}' (id={league.id}): "
              f"{len(old_teams)} existing team(s) — clearing and adding 6 fresh teams")
        for t in old_teams:
            session.delete(t)
    session.commit()

    # ── 3. Add 6 teams per league ────────────────────────────────────────
    print(f"\n[3/3] Adding 6 teams to each league...")
    for league in leagues:
        for i in range(1, 7):
            team_name = f"{league.name} Team {i}"
            session.add(Team(name=team_name, league_id=league.id))
            print(f"       + {team_name}")
    session.commit()

    # ── Verify ───────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)
    for league in session.query(League).all():
        teams = session.query(Team).filter_by(league_id=league.id).all()
        print(f"  League '{league.name}' (id={league.id}): {len(teams)} team(s)")
        for t in teams:
            print(f"    - {t.name} (id={t.id})")

    all_team_ids = {t.id for t in session.query(Team).all()}
    orphan_count = session.query(Player).filter(
        Player.team_id.notin_(all_team_ids)
    ).count() if all_team_ids else session.query(Player).count()
    print(f"\n  Orphaned player records remaining: {orphan_count}")
    print("\nMigration complete!")
    session.close()


if __name__ == "__main__":
    main()
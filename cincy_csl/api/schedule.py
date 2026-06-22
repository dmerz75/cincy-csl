"""Simple round-robin schedule generator for volleyball teams.

This is a lightweight reference implementation for local testing. In production,
this logic should be placed in a serverless function or backend service and
use the real DB models.
"""
from datetime import datetime, timedelta
from typing import List, Tuple


def round_robin(teams: List[str]) -> List[List[Tuple[str, str]]]:
    """Generate a round-robin schedule (returns rounds of match pairs).

    If odd number of teams, a bye (None) will be inserted.
    """
    if not teams:
        return []

    t = list(teams)
    if len(t) % 2 == 1:
        t.append(None)  # bye

    n = len(t)
    rounds = []
    for i in range(n - 1):
        pairs = []
        for j in range(n // 2):
            a = t[j]
            b = t[n - 1 - j]
            if a is not None and b is not None:
                pairs.append((a, b))
        rounds.append(pairs)
        # rotate
        t = [t[0]] + [t[-1]] + t[1:-1]
    return rounds


def schedule_dates(start_date: datetime, rounds: int, interval_days: int = 7) -> List[datetime]:
    return [start_date + timedelta(days=i * interval_days) for i in range(rounds)]


if __name__ == "__main__":
    teams = ["Spikers", "Block Party", "Net Results", "Volley Llamas", "Set To Kill"]
    rounds = round_robin(teams)
    dates = schedule_dates(datetime.utcnow(), len(rounds))

    for rd, date in zip(rounds, dates):
        print(f"Round on {date.isoformat()}:")
        for a, b in rd:
            print(f"  {a} vs {b}")
        print()

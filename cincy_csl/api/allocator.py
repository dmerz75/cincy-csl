"""Allocator using OR-Tools CP-SAT to assign matches to datetime+court slots.

Inputs:
- matches: list of (match_id, home_name, away_name)
- slots: list of (slot_id, datetime, court_id)

Constraints:
- each match -> at most one slot
- each slot -> at most one match
- a team cannot have >1 match at same datetime

Returns assignments as dict match_id -> slot_id (or None)
"""
from ortools.sat.python import cp_model
from collections import defaultdict


def assign_matches(matches, slots):
    model = cp_model.CpModel()

    m_idx = {m[0]: i for i, m in enumerate(matches)}
    s_idx = {s[0]: j for j, s in enumerate(slots)}

    # variables x_m_s
    x = {}
    for mi, m in enumerate(matches):
        mid = m[0]
        for sj, s in enumerate(slots):
            x[(mid, s[0])] = model.NewBoolVar(f"x_{mid}_{s[0]}")

    # each match at most one slot
    for m in matches:
        mid = m[0]
        model.Add(sum(x[(mid, s[0])] for s in slots) <= 1)

    # each slot at most one match
    for s in slots:
        sid = s[0]
        model.Add(sum(x[(m[0], sid)] for m in matches) <= 1)

    # team can't be double-booked at same datetime
    # build map datetime -> slots
    dt_to_sids = defaultdict(list)
    for s in slots:
        dt_to_sids[s[1]].append(s[0])

    team_ids = set()
    for m in matches:
        team_ids.add(m[1])
        team_ids.add(m[2])

    # for each team and datetime, sum of assigned matches involving that team at slots with that datetime <=1
    for team in team_ids:
        for dt, sids in dt_to_sids.items():
            involved = []
            for m in matches:
                mid, home, away = m
                if home == team or away == team:
                    for sid in sids:
                        involved.append(x[(mid, sid)])
            if involved:
                model.Add(sum(involved) <= 1)

    # objective: maximize number of assigned matches
    model.Maximize(sum(x.values()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    solver.parameters.num_search_workers = 8
    res = solver.Solve(model)

    assignments = {}
    if res == cp_model.OPTIMAL or res == cp_model.FEASIBLE:
        for m in matches:
            mid = m[0]
            assigned = None
            for s in slots:
                sid = s[0]
                if solver.Value(x[(mid, sid)]) == 1:
                    assigned = sid
                    break
            assignments[mid] = assigned
    else:
        for m in matches:
            assignments[m[0]] = None
    return assignments

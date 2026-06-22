# Volleyball Data Model

This document describes the initial data model for the volleyball component.

Entities

- Player
  - id (uuid)
  - email
  - password_hash (store in auth provider; keep reference)
  - first_name
  - last_name
  - phone_primary
  - phone_notification (optional)
  - role (player, captain, manager, admin)
  - teams: list of team ids

- Team
  - id (uuid)
  - name
  - captain_id (player id)
  - players: list of player ids
  - contact_email
  - contact_phone

- Match
  - id (uuid)
  - season_id
  - home_team_id
  - away_team_id
  - datetime (UTC)
  - location
  - court
  - status (scheduled, completed, cancelled, forfeit)
  - scores (optional)

- Season
  - id (uuid)
  - name
  - start_date
  - end_date
  - sport (volleyball)

- Availability
  - id
  - player_id
  - match_id or date
  - status (available, unavailable, maybe)

- NotificationLog
  - id
  - event_type
  - recipient_id
  - channel (email, sms)
  - timestamp
  - payload
  - status (sent, failed)

Indexes / relationships
- Index on `Player.email` for auth lookup
- Index on `Match.datetime` for schedule queries

Scheduling notes
- Use round-robin generator for even number of teams; insert bye for odd teams.
- Allow manual overrides for court/time conflicts.

Next steps
- Create a SQL schema for Supabase/Postgres.
- Implement a schedule generation function in `api/schedule.py`.
- Wire auth to Supabase or Firebase and store phone numbers in user profile.

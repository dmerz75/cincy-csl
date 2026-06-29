#!/usr/bin/env python3
"""
Migration script: add facility_id column to matches table.

Idempotent: skips if column already exists.
"""

import sqlite3
import os
import sys

# Path to the SQLite DB relative to the project root
_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cincy_csl.db")


def migrate(db_path: str = _DB_PATH):
    if not os.path.exists(db_path):
        print(f"❌ Database not found at {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cursor = conn.execute("PRAGMA table_info(matches)")
    existing = {row[1] for row in cursor.fetchall()}

    if "facility_id" in existing:
        print("✅ Column 'facility_id' already exists in matches table — nothing to do.")
    else:
        conn.execute(
            "ALTER TABLE matches ADD COLUMN facility_id INTEGER REFERENCES facilities(id)"
        )
        conn.commit()
        print("✅ Added 'facility_id' column to matches table (nullable FK → facilities.id).")

    # Verify
    cursor = conn.execute("PRAGMA table_info(matches)")
    print("\nCurrent matches table schema:")
    for row in cursor.fetchall():
        print(f"  {row}")

    conn.close()


if __name__ == "__main__":
    migrate()
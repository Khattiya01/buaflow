"""Prints {"tables": [...], "userCount": N} as JSON — a small introspection helper used by
the rehearsal scripts (Node) so they don't need their own Postgres client dependency."""

import json

from sqlalchemy import text

from app.db import engine


def main() -> None:
    with engine.connect() as conn:
        tables = sorted(
            row[0]
            for row in conn.execute(
                text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
            )
        )
        user_count = 0
        if "users" in tables:
            user_count = conn.execute(text('SELECT count(*) FROM "users"')).scalar_one()
    print(json.dumps({"tables": tables, "userCount": user_count}))


if __name__ == "__main__":
    main()

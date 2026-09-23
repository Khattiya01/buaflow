"""Dev/test-only seed data. Passwords below are intentionally public defaults for a local
database that only ever exists inside docker-compose.yml — never reuse them anywhere real.
"""

from sqlalchemy import select

from app.auth import hash_password
from app.db import SessionLocal
from app.models import Task, User


def main() -> None:
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == "admin@example.com")).scalar_one_or_none()
        if admin is None:
            admin = User(
                email="admin@example.com",
                name="Admin",
                role="admin",
                password_hash=hash_password("admin-dev-password"),
            )
            db.add(admin)
            db.flush()

        member = db.execute(select(User).where(User.email == "member@example.com")).scalar_one_or_none()
        if member is None:
            member = User(
                email="member@example.com",
                name="Member",
                role="member",
                password_hash=hash_password("member-dev-password"),
            )
            db.add(member)
            db.flush()

        seed_task = db.execute(select(Task).where(Task.id == "seed-task-1")).scalar_one_or_none()
        if seed_task is None:
            db.add(Task(id="seed-task-1", title="Write the sync contract doc", status="todo", owner_id=member.id))

        db.commit()
        print(f"Seeded: admin={admin.email} member={member.email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

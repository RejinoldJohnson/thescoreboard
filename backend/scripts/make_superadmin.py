"""
One-time script — promotes an existing user account to superadmin.

Usage (from the backend/ directory):
    python scripts/make_superadmin.py your@email.com

Safe to run multiple times — idempotent.
"""
import sys
import os

# Make sure the app package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from app.models.user import User


def make_superadmin(email: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"ERROR: No user found with email '{email}'")
            print("Make sure the account exists (sign up first, then run this script).")
            sys.exit(1)

        if user.is_superadmin:
            print(f"'{user.name}' ({email}) is already a superadmin. Nothing changed.")
            return

        user.is_superadmin = True
        db.commit()
        print(f"✓ '{user.name}' ({email}) is now a superadmin.")
        print(f"  user_id : {user.user_id}")
        print(f"  plan    : {user.plan}")
        print()
        print("Log in at /admin to access the admin panel.")

    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/make_superadmin.py your@email.com")
        sys.exit(1)
    make_superadmin(sys.argv[1].strip().lower())

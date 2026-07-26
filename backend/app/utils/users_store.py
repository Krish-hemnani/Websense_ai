"""
app/utils/users_store.py
Minimal JSON-file "database" for the login gate: just enough to store
name + email so the Promo Email Agent knows who to send to. Swap for a
real database later without touching any other file -- every function
signature here stays the same.
"""
import json
import threading

from app.config import DATA_DIR

USERS_FILE = DATA_DIR / "users.json"
_lock = threading.Lock()


def _ensure_store():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not USERS_FILE.exists():
        USERS_FILE.write_text(json.dumps({}))


def save_user(email, name=""):
    email = (email or "").strip().lower()
    with _lock:
        _ensure_store()
        users = json.loads(USERS_FILE.read_text())
        users[email] = {"email": email, "name": name or users.get(email, {}).get("name", "")}
        USERS_FILE.write_text(json.dumps(users, indent=2))
    return users[email]


def get_user(email):
    email = (email or "").strip().lower()
    with _lock:
        _ensure_store()
        users = json.loads(USERS_FILE.read_text())
    return users.get(email)

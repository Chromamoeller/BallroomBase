import sys

from werkzeug.security import generate_password_hash

from database import get_connection, init_db
from seed import seed


def prompt(label, options=None):
    while True:
        value = input(f"{label}: ").strip()
        if not value:
            print("  Bitte einen Wert eingeben.")
            continue
        if options and value not in options:
            print(f"  Erlaubte Werte: {', '.join(options)}")
            continue
        return value


def create_user():
    init_db()
    conn = get_connection()
    courses = conn.execute("SELECT id, name FROM courses ORDER BY id").fetchall()
    if not courses:
        print("Keine Kurse vorhanden. Führe zuerst 'python seed.py' aus.")
        return

    print("=== Neuen Benutzer anlegen ===")
    username = prompt("Benutzername")
    existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        print("Benutzername existiert bereits.")
        return

    password = prompt("Passwort")
    role = prompt("Rolle (admin / teilnehmer)", options=["admin", "teilnehmer"])
    has_four_card = 0
    if role == "teilnehmer":
        answer = prompt("Hat der Teilnehmer eine 4er-Karte? (ja/nein)", options=["ja", "nein"])
        has_four_card = 1 if answer == "ja" else 0

    print("Verfügbare Kurse:")
    for c in courses:
        print(f"  {c['id']}: {c['name']}")
    course_options = [str(c["id"]) for c in courses]
    course_id = int(prompt("Kurs-ID auswählen", options=course_options))

    conn.execute(
        "INSERT INTO users (username, password_hash, role, course_id, has_four_card) VALUES (?,?,?,?,?)",
        (username, generate_password_hash(password), role, course_id, has_four_card),
    )
    conn.commit()
    conn.close()
    print(f"Benutzer '{username}' erfolgreich angelegt.")


def list_users():
    init_db()
    conn = get_connection()
    rows = conn.execute(
        "SELECT u.id, u.username, u.role, u.has_four_card, c.name AS course "
        "FROM users u JOIN courses c ON c.id = u.course_id ORDER BY u.id"
    ).fetchall()
    conn.close()
    if not rows:
        print("Keine Benutzer vorhanden.")
        return
    print(f"{'ID':<4} {'Benutzername':<20} {'Rolle':<12} {'4er Karte':<10} Kurs")
    print("-" * 75)
    for r in rows:
        has_card = "ja" if r["has_four_card"] else "nein"
        print(f"{r['id']:<4} {r['username']:<20} {r['role']:<12} {has_card:<10} {r['course']}")


def delete_user():
    init_db()
    username = prompt("Benutzername zum Löschen")
    conn = get_connection()
    user = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if not user:
        conn.close()
        print("Benutzer nicht gefunden.")
        return

    conn.execute("DELETE FROM attendance_entries WHERE user_id = ?", (user["id"],))
    cur = conn.execute("DELETE FROM users WHERE username = ?", (username,))
    conn.commit()
    conn.close()
    if cur.rowcount:
        print(f"Benutzer '{username}' gelöscht.")
    else:
        print("Benutzer nicht gefunden.")


COMMANDS = {
    "create-user": create_user,
    "list-users": list_users,
    "delete-user": delete_user,
    "seed": seed,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print("Verfügbare Befehle:")
        for name in COMMANDS:
            print(f"  python manage.py {name}")
        sys.exit(0)
    COMMANDS[sys.argv[1]]()


if __name__ == "__main__":
    main()

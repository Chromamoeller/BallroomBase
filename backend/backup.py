"""Zentrales Komplett-Backup über alle Abteilungen (Kurse).

Ein einziger Admin-Export (ZIP mit je einer CSV pro Bereich) und ein einziger
Admin-Import (gleiche ZIP-Struktur). Der Import führt nur zusammen: bestehende
Einträge bleiben erhalten, es werden ausschließlich neue ergänzt (Duplikate
übersprungen). Ersetzt die früheren bereichseigenen Import/Export-Routen."""

import csv
import io
import zipfile
from datetime import datetime

from flask import Blueprint, Response, jsonify, request
from werkzeug.security import generate_password_hash

from _shared import parse_bool, parse_csv
from auth import auth_required
from database import get_connection


bp = Blueprint("backup", __name__)


# Spalten je Bereich. Gegenüber den alten Einzel-Exporten steht überall die
# Abteilung (`course`) vorne, damit eine Datei alle Abteilungen abdeckt.
USER_COLUMNS = [
    "username", "password", "password_hash", "role", "course",
    "has_four_card", "four_card_hours", "four_card_wraps", "four_card_paid_at",
]
FIGURE_COLUMNS = [
    "course", "dance", "name", "description", "difficulty", "video_url",
    "steps", "count", "footwork", "amount_of_turn", "precedes", "follows",
    "visible",
]
SEQUENCE_COLUMNS = ["course", "dance", "name", "figures", "description", "visible"]
HISTORY_COLUMNS = ["course", "date", "warmup", "lesson", "cooldown"]
ATTENDANCE_COLUMNS = ["course", "date", "username", "present"]

# Dateiname in der ZIP -> interner Bereichsschlüssel.
ZIP_FILES = {
    "nutzer.csv": "users",
    "figuren.csv": "figures",
    "folgen.csv": "sequences",
    "historie.csv": "history",
    "anwesenheit.csv": "attendance",
}


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def _csv_bytes(columns, rows):
    """Schreibt Kopfzeile + Datenzeilen als UTF-8-CSV (mit BOM) und gibt Bytes
    zurück."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(columns)
    for row in rows:
        writer.writerow(row)
    return ("﻿" + buffer.getvalue()).encode("utf-8")


def _export_users(conn):
    rows = conn.execute(
        "SELECT u.username, u.password_hash, u.role, u.has_four_card, "
        "u.four_card_hours, u.four_card_wraps, u.four_card_paid_at, "
        "c.name AS course_name "
        "FROM users u JOIN courses c ON c.id = u.course_id "
        "ORDER BY c.name, u.username"
    ).fetchall()
    return _csv_bytes(USER_COLUMNS, [
        [
            r["username"],
            "",
            r["password_hash"],
            r["role"],
            r["course_name"],
            "1" if r["has_four_card"] else "0",
            r["four_card_hours"] if r["four_card_hours"] is not None else 0,
            r["four_card_wraps"] if r["four_card_wraps"] is not None else 0,
            r["four_card_paid_at"] or "",
        ]
        for r in rows
    ])


def _export_figures(conn):
    rows = conn.execute(
        "SELECT c.name AS course_name, d.name AS dance_name, f.name, "
        "f.description, f.difficulty, f.video_url, f.steps, f.count_steps, "
        "f.footwork, f.amount_of_turn, f.precedes, f.follows, f.visible "
        "FROM figures f JOIN dances d ON d.id = f.dance_id "
        "JOIN courses c ON c.id = f.course_id "
        "ORDER BY c.name, d.id, f.name"
    ).fetchall()
    return _csv_bytes(FIGURE_COLUMNS, [
        [
            r["course_name"],
            r["dance_name"],
            r["name"],
            r["description"] or "",
            r["difficulty"] or "",
            r["video_url"] or "",
            r["steps"] or "",
            r["count_steps"] or "",
            r["footwork"] or "",
            r["amount_of_turn"] or "",
            r["precedes"] or "",
            r["follows"] or "",
            "1" if r["visible"] else "0",
        ]
        for r in rows
    ])


def _export_sequences(conn):
    rows = conn.execute(
        "SELECT c.name AS course_name, d.name AS dance_name, s.name, "
        "s.figures, s.description, s.visible "
        "FROM sequences s JOIN dances d ON d.id = s.dance_id "
        "JOIN courses c ON c.id = s.course_id "
        "ORDER BY c.name, d.id, s.name"
    ).fetchall()
    return _csv_bytes(SEQUENCE_COLUMNS, [
        [
            r["course_name"],
            r["dance_name"],
            r["name"],
            r["figures"] or "",
            r["description"] or "",
            "1" if r["visible"] else "0",
        ]
        for r in rows
    ])


def _export_history(conn):
    rows = conn.execute(
        "SELECT c.name AS course_name, h.date, h.warmup, h.lesson, h.cooldown "
        "FROM history h JOIN courses c ON c.id = h.course_id "
        "ORDER BY c.name, h.date, h.id"
    ).fetchall()
    return _csv_bytes(HISTORY_COLUMNS, [
        [
            r["course_name"],
            r["date"] or "",
            r["warmup"] or "",
            r["lesson"] or "",
            r["cooldown"] or "",
        ]
        for r in rows
    ])


def _export_attendance(conn):
    rows = conn.execute(
        "SELECT c.name AS course_name, a.date, u.username, ae.present "
        "FROM attendance_entries ae "
        "JOIN attendance a ON a.id = ae.attendance_id "
        "JOIN users u ON u.id = ae.user_id "
        "JOIN courses c ON c.id = a.course_id "
        "ORDER BY c.name, a.date, a.id, u.username"
    ).fetchall()
    return _csv_bytes(ATTENDANCE_COLUMNS, [
        [
            r["course_name"],
            r["date"] or "",
            r["username"],
            "1" if r["present"] else "0",
        ]
        for r in rows
    ])


@bp.get("/api/backup/export")
@auth_required(roles=["admin"])
def export_backup():
    conn = get_connection()
    try:
        files = {
            "nutzer.csv": _export_users(conn),
            "figuren.csv": _export_figures(conn),
            "folgen.csv": _export_sequences(conn),
            "historie.csv": _export_history(conn),
            "anwesenheit.csv": _export_attendance(conn),
        }
    finally:
        conn.close()

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    zip_buffer.seek(0)

    filename = f"danceorga-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    return Response(
        zip_buffer.getvalue(),
        mimetype="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Import (nur Zusammenführen – Bestehendes bleibt, nur Neues wird ergänzt)
# ---------------------------------------------------------------------------

def _cell_factory(fieldnames):
    def cell(row, key):
        src = fieldnames.get(key)
        if src is None:
            return ""
        return (row.get(src) or "").strip()
    return cell


def _import_users(conn, reader, fieldnames, courses_by_name):
    cell = _cell_factory(fieldnames)
    created = 0
    skipped = []
    errors = []

    for idx, row in enumerate(reader, start=2):
        username = cell(row, "username")
        password = cell(row, "password")
        password_hash = cell(row, "password_hash")
        role = cell(row, "role").lower() or "teilnehmer"
        course_name = cell(row, "course")
        has_four_card = 1 if parse_bool(cell(row, "has_four_card")) else 0

        def cell_int(key):
            raw = cell(row, key)
            if not raw:
                return 0
            try:
                return max(0, int(raw))
            except ValueError:
                return 0

        four_card_hours = cell_int("four_card_hours")
        four_card_wraps = cell_int("four_card_wraps")
        four_card_paid_at = cell(row, "four_card_paid_at") or None

        if not username:
            errors.append(f"Nutzer Zeile {idx}: Benutzername fehlt")
            continue
        if role not in ("admin", "teilnehmer"):
            errors.append(f"Nutzer Zeile {idx} ({username}): ungültige Rolle '{role}'")
            continue
        if not course_name:
            errors.append(f"Nutzer Zeile {idx} ({username}): Kurs fehlt")
            continue
        course_id = courses_by_name.get(course_name.lower())
        if not course_id:
            errors.append(
                f"Nutzer Zeile {idx} ({username}): Kurs '{course_name}' nicht gefunden"
            )
            continue

        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if existing:
            skipped.append(username)
            continue

        if password_hash:
            hash_to_store = password_hash
        elif password:
            hash_to_store = generate_password_hash(password)
        else:
            errors.append(
                f"Nutzer Zeile {idx} ({username}): Passwort oder password_hash "
                f"erforderlich für neue Nutzer"
            )
            continue

        conn.execute(
            "INSERT INTO users (username, password_hash, role, course_id, "
            "has_four_card, four_card_hours, four_card_wraps, four_card_paid_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (
                username,
                hash_to_store,
                role,
                course_id,
                has_four_card,
                four_card_hours,
                four_card_wraps,
                four_card_paid_at,
            ),
        )
        created += 1

    return {"created": created, "skipped": skipped, "errors": errors}


def _import_figures(conn, reader, fieldnames, courses_by_name, dances_by_name):
    cell = _cell_factory(fieldnames)

    existing = conn.execute(
        "SELECT c.name AS course_name, d.name AS dance_name, f.name "
        "FROM figures f JOIN dances d ON d.id = f.dance_id "
        "JOIN courses c ON c.id = f.course_id"
    ).fetchall()
    existing_keys = {
        (r["course_name"].strip().lower(), r["dance_name"].strip().lower(),
         r["name"].strip().lower())
        for r in existing
    }

    created = 0
    skipped = []
    errors = []

    for idx, row in enumerate(reader, start=2):
        course_name = cell(row, "course")
        dance_name = cell(row, "dance")
        name = cell(row, "name")

        if not name:
            errors.append(f"Figuren Zeile {idx}: Name fehlt")
            continue
        if not course_name:
            errors.append(f"Figuren Zeile {idx} ({name}): Kurs fehlt")
            continue
        course_id = courses_by_name.get(course_name.lower())
        if not course_id:
            errors.append(
                f"Figuren Zeile {idx} ({name}): Kurs '{course_name}' nicht gefunden"
            )
            continue
        if not dance_name:
            errors.append(f"Figuren Zeile {idx} ({name}): Tanz fehlt")
            continue
        dance_id = dances_by_name.get(dance_name.lower())
        if not dance_id:
            errors.append(
                f"Figuren Zeile {idx} ({name}): Tanz '{dance_name}' nicht gefunden"
            )
            continue

        key = (course_name.lower(), dance_name.lower(), name.lower())
        if key in existing_keys:
            skipped.append(f"{name} ({dance_name}, {course_name})")
            continue

        visible_raw = cell(row, "visible")
        visible = 1 if (not visible_raw or parse_bool(visible_raw)) else 0

        conn.execute(
            "INSERT INTO figures (course_id, dance_id, name, description, "
            "difficulty, video_url, steps, count_steps, footwork, "
            "amount_of_turn, precedes, follows, visible) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                course_id,
                dance_id,
                name,
                cell(row, "description") or None,
                cell(row, "difficulty") or None,
                cell(row, "video_url") or None,
                cell(row, "steps") or None,
                cell(row, "count") or None,
                cell(row, "footwork") or None,
                cell(row, "amount_of_turn") or None,
                cell(row, "precedes") or None,
                cell(row, "follows") or None,
                visible,
            ),
        )
        existing_keys.add(key)
        created += 1

    return {"created": created, "skipped": skipped, "errors": errors}


def _import_sequences(conn, reader, fieldnames, courses_by_name, dances_by_name):
    cell = _cell_factory(fieldnames)

    existing = conn.execute(
        "SELECT c.name AS course_name, d.name AS dance_name, s.name "
        "FROM sequences s JOIN dances d ON d.id = s.dance_id "
        "JOIN courses c ON c.id = s.course_id"
    ).fetchall()
    existing_keys = {
        (r["course_name"].strip().lower(), r["dance_name"].strip().lower(),
         r["name"].strip().lower())
        for r in existing
    }

    created = 0
    skipped = []
    errors = []

    for idx, row in enumerate(reader, start=2):
        course_name = cell(row, "course")
        dance_name = cell(row, "dance")
        name = cell(row, "name")

        if not name:
            errors.append(f"Folgen Zeile {idx}: Name fehlt")
            continue
        if not course_name:
            errors.append(f"Folgen Zeile {idx} ({name}): Kurs fehlt")
            continue
        course_id = courses_by_name.get(course_name.lower())
        if not course_id:
            errors.append(
                f"Folgen Zeile {idx} ({name}): Kurs '{course_name}' nicht gefunden"
            )
            continue
        if not dance_name:
            errors.append(f"Folgen Zeile {idx} ({name}): Tanz fehlt")
            continue
        dance_id = dances_by_name.get(dance_name.lower())
        if not dance_id:
            errors.append(
                f"Folgen Zeile {idx} ({name}): Tanz '{dance_name}' nicht gefunden"
            )
            continue

        key = (course_name.lower(), dance_name.lower(), name.lower())
        if key in existing_keys:
            skipped.append(f"{name} ({dance_name}, {course_name})")
            continue

        visible_raw = cell(row, "visible")
        visible = 1 if (not visible_raw or parse_bool(visible_raw)) else 0

        conn.execute(
            "INSERT INTO sequences (course_id, dance_id, name, figures, "
            "description, visible) VALUES (?,?,?,?,?,?)",
            (
                course_id,
                dance_id,
                name,
                cell(row, "figures") or None,
                cell(row, "description") or None,
                visible,
            ),
        )
        existing_keys.add(key)
        created += 1

    return {"created": created, "skipped": skipped, "errors": errors}


def _import_history(conn, reader, fieldnames, courses_by_name):
    cell = _cell_factory(fieldnames)

    existing = conn.execute(
        "SELECT course_id, date FROM history"
    ).fetchall()
    existing_keys = {(r["course_id"], r["date"]) for r in existing if r["date"]}

    created = 0
    skipped = []
    errors = []

    for idx, row in enumerate(reader, start=2):
        course_name = cell(row, "course")
        date = cell(row, "date")

        if not date:
            errors.append(f"Historie Zeile {idx}: Datum fehlt")
            continue
        if not course_name:
            errors.append(f"Historie Zeile {idx} ({date}): Kurs fehlt")
            continue
        course_id = courses_by_name.get(course_name.lower())
        if not course_id:
            errors.append(
                f"Historie Zeile {idx} ({date}): Kurs '{course_name}' nicht gefunden"
            )
            continue

        key = (course_id, date)
        if key in existing_keys:
            skipped.append(f"{date} ({course_name})")
            continue

        conn.execute(
            "INSERT INTO history (course_id, date, warmup, lesson, cooldown) "
            "VALUES (?,?,?,?,?)",
            (
                course_id,
                date,
                cell(row, "warmup"),
                cell(row, "lesson"),
                cell(row, "cooldown"),
            ),
        )
        existing_keys.add(key)
        created += 1

    return {"created": created, "skipped": skipped, "errors": errors}


def _import_attendance(conn, reader, fieldnames, courses_by_name):
    cell = _cell_factory(fieldnames)

    # Nutzer je Kurs (inkl. evtl. zuvor in diesem Import angelegter Nutzer).
    user_rows = conn.execute(
        "SELECT id, username, course_id FROM users"
    ).fetchall()
    users_by_course = {}
    for r in user_rows:
        users_by_course.setdefault(r["course_id"], {})[
            r["username"].strip().lower()
        ] = r["id"]

    # Bestehende Termine je Kurs.
    existing = conn.execute("SELECT id, course_id, date FROM attendance").fetchall()
    attendance_by_key = {
        (r["course_id"], r["date"]): r["id"] for r in existing if r["date"]
    }

    errors = []
    # (course_id, date) -> Liste von {user_id, present}
    grouped = {}

    for idx, row in enumerate(reader, start=2):
        course_name = cell(row, "course")
        date = cell(row, "date")
        username = cell(row, "username")
        present_raw = cell(row, "present")

        if not course_name:
            errors.append(f"Anwesenheit Zeile {idx}: Kurs fehlt")
            continue
        course_id = courses_by_name.get(course_name.lower())
        if not course_id:
            errors.append(
                f"Anwesenheit Zeile {idx}: Kurs '{course_name}' nicht gefunden"
            )
            continue
        if not date:
            errors.append(f"Anwesenheit Zeile {idx}: Datum fehlt")
            continue
        if not username:
            errors.append(f"Anwesenheit Zeile {idx}: Benutzername fehlt")
            continue
        user_id = users_by_course.get(course_id, {}).get(username.lower())
        if not user_id:
            errors.append(
                f"Anwesenheit Zeile {idx} ({username}): Nutzer im Kurs "
                f"'{course_name}' nicht gefunden"
            )
            continue

        grouped.setdefault((course_id, date), []).append({
            "user_id": user_id,
            "present": 1 if parse_bool(present_raw) else 0,
        })

    created_dates = 0
    updated_dates = []
    entries_added = 0
    entries_skipped = 0

    for (course_id, date), entries in grouped.items():
        attendance_id = attendance_by_key.get((course_id, date))
        if attendance_id is None:
            cur = conn.execute(
                "INSERT INTO attendance (course_id, date) VALUES (?, ?)",
                (course_id, date),
            )
            attendance_id = cur.lastrowid
            attendance_by_key[(course_id, date)] = attendance_id
            created_dates += 1
            existing_user_ids = set()
            was_existing = False
        else:
            existing_entries = conn.execute(
                "SELECT user_id FROM attendance_entries WHERE attendance_id = ?",
                (attendance_id,),
            ).fetchall()
            existing_user_ids = {r["user_id"] for r in existing_entries}
            was_existing = True

        added_here = 0
        for e in entries:
            if e["user_id"] in existing_user_ids:
                entries_skipped += 1
                continue
            conn.execute(
                "INSERT INTO attendance_entries "
                "(attendance_id, user_id, present, hours) VALUES (?,?,?,?)",
                (attendance_id, e["user_id"], e["present"], None),
            )
            existing_user_ids.add(e["user_id"])
            entries_added += 1
            added_here += 1

        if added_here > 0 and was_existing:
            updated_dates.append(date)

    # Modell A: Der Kartenstand (four_card_hours) wird beim Import aus nutzer.csv
    # übernommen und NICHT aus der importierten Anwesenheit neu berechnet.

    return {
        "created": created_dates,
        "updated": updated_dates,
        "entriesAdded": entries_added,
        "entriesSkipped": entries_skipped,
        "errors": errors,
    }


@bp.post("/api/backup/import")
@auth_required(roles=["admin"])
def import_backup():
    upload = request.files.get("file")
    if not upload:
        return jsonify({"error": "Keine Datei hochgeladen"}), 400

    try:
        zf = zipfile.ZipFile(io.BytesIO(upload.read()))
    except zipfile.BadZipFile:
        return jsonify({"error": "Keine gültige ZIP-Datei"}), 400

    # Bereichsschlüssel -> (reader, fieldnames). Nur vorhandene Dateien zählen.
    parsed = {}
    parse_errors = []
    for entry in zf.namelist():
        if entry.endswith("/"):
            continue
        base = entry.split("/")[-1].lower()
        section = ZIP_FILES.get(base)
        if not section:
            continue
        raw_bytes = zf.read(entry)
        try:
            raw = raw_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            raw = raw_bytes.decode("latin-1", errors="replace")
        reader, fieldnames, err = parse_csv(raw)
        if err:
            parse_errors.append(f"{base}: {err}")
            continue
        parsed[section] = (reader, fieldnames)

    if not parsed:
        msg = "ZIP enthält keine bekannten CSV-Dateien " \
              "(erwartet: " + ", ".join(ZIP_FILES.keys()) + ")"
        if parse_errors:
            msg = msg + ". " + "; ".join(parse_errors)
        return jsonify({"error": msg}), 400

    conn = get_connection()
    try:
        course_rows = conn.execute("SELECT id, name FROM courses").fetchall()
        courses_by_name = {r["name"].strip().lower(): r["id"] for r in course_rows}
        dance_rows = conn.execute("SELECT id, name FROM dances").fetchall()
        dances_by_name = {r["name"].strip().lower(): r["id"] for r in dance_rows}

        result = {}

        # Reihenfolge wichtig: Nutzer zuerst, damit die Anwesenheit neu
        # importierte Nutzer ihrem Kurs zuordnen kann.
        if "users" in parsed:
            reader, fieldnames = parsed["users"]
            result["users"] = _import_users(conn, reader, fieldnames, courses_by_name)
        if "figures" in parsed:
            reader, fieldnames = parsed["figures"]
            result["figures"] = _import_figures(
                conn, reader, fieldnames, courses_by_name, dances_by_name
            )
        if "sequences" in parsed:
            reader, fieldnames = parsed["sequences"]
            result["sequences"] = _import_sequences(
                conn, reader, fieldnames, courses_by_name, dances_by_name
            )
        if "history" in parsed:
            reader, fieldnames = parsed["history"]
            result["history"] = _import_history(
                conn, reader, fieldnames, courses_by_name
            )
        if "attendance" in parsed:
            reader, fieldnames = parsed["attendance"]
            result["attendance"] = _import_attendance(
                conn, reader, fieldnames, courses_by_name
            )

        conn.commit()
    finally:
        conn.close()

    if parse_errors:
        result["fileErrors"] = parse_errors
    return jsonify(result)

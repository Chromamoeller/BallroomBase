import csv
import io
import secrets
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

from database import get_connection, init_db
from seed import seed
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.environ.get(
    "FRONTEND_DIST",
    os.path.join(BASE_DIR, "..", "frontend", "dist"),
)

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="")
CORS(app, supports_credentials=True)

init_db()
seed()

# Einfache Token-Verwaltung im Speicher.
# Reicht für eine lokale Demo; bei echter Mehrbenutzer-Nutzung
# sollte JWT oder eine Session-Tabelle verwendet werden.
TOKENS: dict[str, int] = {}


def _row_to_dict(row):
    return dict(row) if row is not None else None


def get_user_by_token(token):
    user_id = TOKENS.get(token)
    if not user_id:
        return None
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT u.id, u.username, u.role, u.course_id, c.name AS course_name "
            "FROM users u JOIN courses c ON c.id = u.course_id WHERE u.id = ?",
            (user_id,),
        ).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


def auth_required(roles=None):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get("Authorization", "")
            token = auth_header.replace("Bearer ", "").strip()
            user = get_user_by_token(token)
            if not user:
                return jsonify({"error": "Nicht angemeldet"}), 401
            if roles and user["role"] not in roles:
                return jsonify({"error": "Keine Berechtigung"}), 403
            request.current_user = user
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# -------------------- AUTH --------------------
@app.route("/")
def serve_index():
    return app.send_static_file("index.html")

@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "Benutzername und Passwort erforderlich"}), 400

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT u.id, u.username, u.password_hash, u.role, u.course_id, c.name AS course_name "
            "FROM users u JOIN courses c ON c.id = u.course_id WHERE u.username = ?",
            (username,),
        ).fetchone()
    finally:
        conn.close()

    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Ungültige Zugangsdaten"}), 401

    token = secrets.token_hex(24)
    TOKENS[token] = row["id"]
    return jsonify({
        "token": token,
        "user": {
            "id": row["id"],
            "username": row["username"],
            "role": row["role"],
            "courseId": row["course_id"],
            "courseName": row["course_name"],
        },
    })


@app.post("/api/logout")
@auth_required()
def logout():
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    TOKENS.pop(token, None)
    return jsonify({"ok": True})


@app.get("/api/me")
@auth_required()
def me():
    u = request.current_user
    return jsonify({
        "id": u["id"],
        "username": u["username"],
        "role": u["role"],
        "courseId": u["course_id"],
        "courseName": u["course_name"],
    })


# -------------------- USERS --------------------

@app.get("/api/users")
@auth_required(roles=["admin"])
def list_users():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT u.id, u.username, u.role, u.course_id, u.has_four_card, "
            "u.four_card_hours, c.name AS course_name "
            "FROM users u JOIN courses c ON c.id = u.course_id "
            "ORDER BY u.username"
        ).fetchall()
        return jsonify([
            {
                "id": r["id"],
                "username": r["username"],
                "role": r["role"],
                "courseId": r["course_id"],
                "courseName": r["course_name"],
                "hasFourCard": bool(r["has_four_card"]),
                "fourCardHours": r["four_card_hours"],
            }
            for r in rows
        ])
    finally:
        conn.close()


@app.post("/api/users")
@auth_required(roles=["admin"])
def create_user():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = (data.get("role") or "teilnehmer").strip()
    course_id = data.get("courseId")
    has_four_card = 1 if data.get("hasFourCard") else 0

    if not username or not password:
        return jsonify({"error": "Benutzername und Passwort erforderlich"}), 400
    if role not in ("admin", "teilnehmer"):
        return jsonify({"error": "Ungültige Rolle"}), 400
    if not course_id:
        return jsonify({"error": "Kurs erforderlich"}), 400

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if existing:
            return jsonify({"error": "Benutzername bereits vergeben"}), 400
        course = conn.execute(
            "SELECT id, name FROM courses WHERE id = ?", (course_id,)
        ).fetchone()
        if not course:
            return jsonify({"error": "Kurs nicht gefunden"}), 400

        cur = conn.execute(
            "INSERT INTO users (username, password_hash, role, course_id, has_four_card) "
            "VALUES (?,?,?,?,?)",
            (
                username,
                generate_password_hash(password),
                role,
                course_id,
                has_four_card,
            ),
        )
        conn.commit()
        return jsonify({
            "id": cur.lastrowid,
            "username": username,
            "role": role,
            "courseId": course["id"],
            "courseName": course["name"],
            "hasFourCard": bool(has_four_card),
            "fourCardHours": 0,
        }), 201
    finally:
        conn.close()


@app.put("/api/users/<int:user_id>")
@auth_required(roles=["admin"])
def update_user(user_id):
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    role = (data.get("role") or "").strip()
    course_id = data.get("courseId")
    has_four_card = 1 if data.get("hasFourCard") else 0
    password = data.get("password") or ""

    if not username:
        return jsonify({"error": "Benutzername erforderlich"}), 400
    if role not in ("admin", "teilnehmer"):
        return jsonify({"error": "Ungültige Rolle"}), 400
    if not course_id:
        return jsonify({"error": "Kurs erforderlich"}), 400

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not existing:
            return jsonify({"error": "Nutzer nicht gefunden"}), 404
        course = conn.execute(
            "SELECT id, name FROM courses WHERE id = ?", (course_id,)
        ).fetchone()
        if not course:
            return jsonify({"error": "Kurs nicht gefunden"}), 400
        conflict = conn.execute(
            "SELECT id FROM users WHERE username = ? AND id != ?",
            (username, user_id),
        ).fetchone()
        if conflict:
            return jsonify({"error": "Benutzername bereits vergeben"}), 400

        if password:
            conn.execute(
                "UPDATE users SET username = ?, role = ?, course_id = ?, "
                "has_four_card = ?, password_hash = ? WHERE id = ?",
                (
                    username,
                    role,
                    course_id,
                    has_four_card,
                    generate_password_hash(password),
                    user_id,
                ),
            )
        else:
            conn.execute(
                "UPDATE users SET username = ?, role = ?, course_id = ?, "
                "has_four_card = ? WHERE id = ?",
                (username, role, course_id, has_four_card, user_id),
            )
        _recompute_four_card(conn, user_id)
        conn.commit()

        row = conn.execute(
            "SELECT u.id, u.username, u.role, u.course_id, u.has_four_card, "
            "u.four_card_hours, c.name AS course_name "
            "FROM users u JOIN courses c ON c.id = u.course_id WHERE u.id = ?",
            (user_id,),
        ).fetchone()
        return jsonify({
            "id": row["id"],
            "username": row["username"],
            "role": row["role"],
            "courseId": row["course_id"],
            "courseName": row["course_name"],
            "hasFourCard": bool(row["has_four_card"]),
            "fourCardHours": row["four_card_hours"],
        })
    finally:
        conn.close()


USER_CSV_COLUMNS = [
    "username",
    "password",
    "password_hash",
    "role",
    "course",
    "has_four_card",
    "four_card_hours",
    "four_card_wraps",
    "four_card_paid_at",
]


@app.get("/api/users/export")
@auth_required(roles=["admin"])
def export_users():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT u.username, u.password_hash, u.role, u.has_four_card, "
            "u.four_card_hours, u.four_card_wraps, u.four_card_paid_at, "
            "c.name AS course_name "
            "FROM users u JOIN courses c ON c.id = u.course_id "
            "ORDER BY u.username"
        ).fetchall()
    finally:
        conn.close()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(USER_CSV_COLUMNS)
    for r in rows:
        writer.writerow([
            r["username"],
            "",
            r["password_hash"],
            r["role"],
            r["course_name"],
            "1" if r["has_four_card"] else "0",
            r["four_card_hours"] if r["four_card_hours"] is not None else 0,
            r["four_card_wraps"] if r["four_card_wraps"] is not None else 0,
            r["four_card_paid_at"] or "",
        ])

    csv_text = "﻿" + buffer.getvalue()
    filename = f"nutzer-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _parse_bool(value):
    if value is None:
        return False
    v = str(value).strip().lower()
    return v in ("1", "true", "ja", "yes", "y", "x")


@app.post("/api/users/import")
@auth_required(roles=["admin"])
def import_users():
    upload = request.files.get("file")
    if not upload:
        return jsonify({"error": "Keine Datei hochgeladen"}), 400

    try:
        raw = upload.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            upload.stream.seek(0)
            raw = upload.read().decode("latin-1")
        except Exception:
            return jsonify({"error": "Datei konnte nicht gelesen werden"}), 400

    if not raw.strip():
        return jsonify({"error": "Datei ist leer"}), 400

    sample = raw[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel

    reader = csv.DictReader(io.StringIO(raw), dialect=dialect)
    if not reader.fieldnames:
        return jsonify({"error": "Keine Spaltenüberschriften gefunden"}), 400

    fieldnames = {name.strip().lower(): name for name in reader.fieldnames if name}
    required = ["username", "role", "course"]
    missing = [c for c in required if c not in fieldnames]
    if missing:
        return jsonify({
            "error": f"Fehlende Spalten: {', '.join(missing)}. "
                     f"Erwartet: {', '.join(USER_CSV_COLUMNS)}"
        }), 400

    conn = get_connection()
    try:
        course_rows = conn.execute("SELECT id, name FROM courses").fetchall()
        courses_by_name = {r["name"].strip().lower(): r["id"] for r in course_rows}

        created = 0
        skipped = []
        errors = []

        for idx, row in enumerate(reader, start=2):
            def cell(key):
                src = fieldnames.get(key)
                if src is None:
                    return ""
                return (row.get(src) or "").strip()

            username = cell("username")
            password = cell("password")
            password_hash = cell("password_hash")
            role = cell("role").lower() or "teilnehmer"
            course_name = cell("course")
            has_four_card = 1 if _parse_bool(cell("has_four_card")) else 0

            def cell_int(key):
                raw = cell(key)
                if not raw:
                    return 0
                try:
                    return max(0, int(raw))
                except ValueError:
                    return 0

            four_card_hours = cell_int("four_card_hours")
            four_card_wraps = cell_int("four_card_wraps")
            four_card_paid_at = cell("four_card_paid_at") or None

            if not username:
                errors.append(f"Zeile {idx}: Benutzername fehlt")
                continue
            if role not in ("admin", "teilnehmer"):
                errors.append(f"Zeile {idx} ({username}): ungültige Rolle '{role}'")
                continue
            if not course_name:
                errors.append(f"Zeile {idx} ({username}): Kurs fehlt")
                continue
            course_id = courses_by_name.get(course_name.lower())
            if not course_id:
                errors.append(
                    f"Zeile {idx} ({username}): Kurs '{course_name}' nicht gefunden"
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
                    f"Zeile {idx} ({username}): Passwort oder password_hash erforderlich für neue Nutzer"
                )
                continue

            conn.execute(
                "INSERT INTO users (username, password_hash, role, course_id, has_four_card, "
                "four_card_hours, four_card_wraps, four_card_paid_at) "
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

        conn.commit()
        return jsonify({
            "created": created,
            "skipped": skipped,
            "errors": errors,
        })
    finally:
        conn.close()


@app.delete("/api/users/<int:user_id>")
@auth_required(roles=["admin"])
def delete_user(user_id):
    if request.current_user["id"] == user_id:
        return jsonify({"error": "Du kannst dich nicht selbst löschen."}), 400

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not existing:
            return jsonify({"error": "Nutzer nicht gefunden"}), 404

        conn.execute(
            "DELETE FROM attendance_entries WHERE user_id = ?", (user_id,)
        )
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.execute(
            "DELETE FROM attendance WHERE id IN ("
            "SELECT a.id FROM attendance a "
            "LEFT JOIN attendance_entries ae ON ae.attendance_id = a.id "
            "WHERE ae.id IS NULL)"
        )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# -------------------- COURSES --------------------

@app.get("/api/courses")
def list_courses():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT id, name FROM courses ORDER BY id").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.get("/api/dances")
def list_dances():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT id, name FROM dances ORDER BY id").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


def _ensure_course_access(user, course_id):
    if user["role"] == "admin":
        return True
    return user["course_id"] == course_id


def _recompute_four_card(conn, user_id):
    """Leitet `four_card_hours` und alle `hours`-Snapshots aus der Anwesenheits-
    Historie ab. Beim 5. Anwesenheits-Häkchen wird die Karte automatisch neu
    gestartet (Wrap 4 → 1). Tritt ein neuer Wrap auf (= Wrap-Zähler erhöht sich
    gegenüber dem zuletzt gespeicherten Wert), wird der Bezahl-Status auf
    "nicht bezahlt" zurückgesetzt — die neue Karte muss vom Admin manuell
    wieder als bezahlt markiert werden."""
    user_row = conn.execute(
        "SELECT has_four_card, four_card_wraps FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not user_row or not user_row["has_four_card"]:
        conn.execute(
            "UPDATE attendance_entries SET hours = NULL WHERE user_id = ?",
            (user_id,),
        )
        conn.execute(
            "UPDATE users SET four_card_hours = 0, four_card_paid_at = NULL, "
            "four_card_wraps = 0 WHERE id = ?",
            (user_id,),
        )
        return

    stored_wraps = user_row["four_card_wraps"]

    rows = conn.execute(
        "SELECT ae.id, ae.present FROM attendance_entries ae "
        "JOIN attendance a ON a.id = ae.attendance_id "
        "WHERE ae.user_id = ? "
        "ORDER BY a.date ASC, a.id ASC, ae.id ASC",
        (user_id,),
    ).fetchall()

    counter = 0
    wraps = 0
    for row in rows:
        if row["present"]:
            if counter >= 4:
                counter = 1
                wraps += 1
            else:
                counter += 1
            conn.execute(
                "UPDATE attendance_entries SET hours = ? WHERE id = ?",
                (f"{counter}/4", row["id"]),
            )
        else:
            conn.execute(
                "UPDATE attendance_entries SET hours = NULL WHERE id = ?",
                (row["id"],),
            )

    if wraps > stored_wraps:
        conn.execute(
            "UPDATE users SET four_card_paid_at = NULL WHERE id = ?",
            (user_id,),
        )

    conn.execute(
        "UPDATE users SET four_card_hours = ?, four_card_wraps = ? WHERE id = ?",
        (counter, wraps, user_id),
    )


def _recompute_all_four_cards(conn, course_id):
    ids = conn.execute(
        "SELECT id FROM users WHERE course_id = ? AND has_four_card = 1",
        (course_id,),
    ).fetchall()
    for r in ids:
        _recompute_four_card(conn, r["id"])


# -------------------- FIGURES --------------------

@app.get("/api/figures/<int:course_id>")
@auth_required()
def get_figures(course_id):
    if not _ensure_course_access(request.current_user, course_id):
        return jsonify({"error": "Keine Berechtigung"}), 403
    conn = get_connection()
    try:
        is_admin = request.current_user["role"] == "admin"
        query = (
            "SELECT f.id, f.name, f.description, f.difficulty, f.video_url, "
            "f.spotify_url, f.steps, f.count_steps, f.footwork, "
            "f.amount_of_turn, f.precedes, f.follows, f.visible, "
            "f.dance_id, d.name AS dance_name "
            "FROM figures f JOIN dances d ON d.id = f.dance_id "
            "WHERE f.course_id = ? "
            + ("" if is_admin else "AND f.visible = 1 ")
            + "ORDER BY d.id, f.name"
        )
        rows = conn.execute(query, (course_id,)).fetchall()
        return jsonify([
            {
                "id": r["id"],
                "name": r["name"],
                "description": r["description"],
                "difficulty": r["difficulty"],
                "videoUrl": r["video_url"],
                "spotifyUrl": r["spotify_url"],
                "steps": r["steps"],
                "count": r["count_steps"],
                "footwork": r["footwork"],
                "amountOfTurn": r["amount_of_turn"],
                "precedes": r["precedes"],
                "follows": r["follows"],
                "visible": bool(r["visible"]),
                "danceId": r["dance_id"],
                "danceName": r["dance_name"],
            }
            for r in rows
        ])
    finally:
        conn.close()


@app.post("/api/figures/<int:course_id>")
@auth_required(roles=["admin"])
def create_figure(course_id):
    data = request.get_json(silent=True) or {}
    dance_id = data.get("danceId")
    name = (data.get("name") or "").strip()
    if not dance_id or not name:
        return jsonify({"error": "Tanz und Name sind erforderlich"}), 400

    description = (data.get("description") or "").strip() or None
    difficulty = (data.get("difficulty") or "").strip() or None
    video_url = (data.get("videoUrl") or "").strip() or None
    spotify_url = (data.get("spotifyUrl") or "").strip() or None
    steps = (data.get("steps") or "").strip() or None
    count_steps = (data.get("count") or "").strip() or None
    footwork = (data.get("footwork") or "").strip() or None
    amount_of_turn = (data.get("amountOfTurn") or "").strip() or None
    precedes = (data.get("precedes") or "").strip() or None
    follows = (data.get("follows") or "").strip() or None

    conn = get_connection()
    try:
        dance = conn.execute(
            "SELECT id, name FROM dances WHERE id = ?", (dance_id,)
        ).fetchone()
        if not dance:
            return jsonify({"error": "Tanz nicht gefunden"}), 400

        cur = conn.execute(
            "INSERT INTO figures (course_id, dance_id, name, description, difficulty, "
            "video_url, spotify_url, steps, count_steps, footwork, amount_of_turn, "
            "precedes, follows, visible) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
            (
                course_id,
                dance_id,
                name,
                description,
                difficulty,
                video_url,
                spotify_url,
                steps,
                count_steps,
                footwork,
                amount_of_turn,
                precedes,
                follows,
            ),
        )
        conn.commit()
        return jsonify({
            "id": cur.lastrowid,
            "name": name,
            "description": description,
            "difficulty": difficulty,
            "videoUrl": video_url,
            "spotifyUrl": spotify_url,
            "steps": steps,
            "count": count_steps,
            "footwork": footwork,
            "amountOfTurn": amount_of_turn,
            "precedes": precedes,
            "follows": follows,
            "visible": True,
            "danceId": dance["id"],
            "danceName": dance["name"],
        }), 201
    finally:
        conn.close()


@app.put("/api/figures/<int:course_id>/<int:figure_id>")
@auth_required(roles=["admin"])
def update_figure(course_id, figure_id):
    data = request.get_json(silent=True) or {}
    dance_id = data.get("danceId")
    name = (data.get("name") or "").strip()
    if not dance_id or not name:
        return jsonify({"error": "Tanz und Name sind erforderlich"}), 400

    description = (data.get("description") or "").strip() or None
    difficulty = (data.get("difficulty") or "").strip() or None
    video_url = (data.get("videoUrl") or "").strip() or None
    spotify_url = (data.get("spotifyUrl") or "").strip() or None
    steps = (data.get("steps") or "").strip() or None
    count_steps = (data.get("count") or "").strip() or None
    footwork = (data.get("footwork") or "").strip() or None
    amount_of_turn = (data.get("amountOfTurn") or "").strip() or None
    precedes = (data.get("precedes") or "").strip() or None
    follows = (data.get("follows") or "").strip() or None

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM figures WHERE id = ? AND course_id = ?",
            (figure_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Figur nicht gefunden"}), 404

        dance = conn.execute(
            "SELECT id, name FROM dances WHERE id = ?", (dance_id,)
        ).fetchone()
        if not dance:
            return jsonify({"error": "Tanz nicht gefunden"}), 400

        conn.execute(
            "UPDATE figures SET dance_id = ?, name = ?, description = ?, "
            "difficulty = ?, video_url = ?, spotify_url = ?, steps = ?, "
            "count_steps = ?, footwork = ?, amount_of_turn = ?, "
            "precedes = ?, follows = ? WHERE id = ?",
            (
                dance_id,
                name,
                description,
                difficulty,
                video_url,
                spotify_url,
                steps,
                count_steps,
                footwork,
                amount_of_turn,
                precedes,
                follows,
                figure_id,
            ),
        )
        conn.commit()

        row = conn.execute(
            "SELECT f.id, f.name, f.description, f.difficulty, f.video_url, "
            "f.spotify_url, f.steps, f.count_steps, f.footwork, "
            "f.amount_of_turn, f.precedes, f.follows, f.visible, "
            "f.dance_id, d.name AS dance_name "
            "FROM figures f JOIN dances d ON d.id = f.dance_id "
            "WHERE f.id = ?",
            (figure_id,),
        ).fetchone()
        return jsonify({
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "difficulty": row["difficulty"],
            "videoUrl": row["video_url"],
            "spotifyUrl": row["spotify_url"],
            "steps": row["steps"],
            "count": row["count_steps"],
            "footwork": row["footwork"],
            "amountOfTurn": row["amount_of_turn"],
            "precedes": row["precedes"],
            "follows": row["follows"],
            "visible": bool(row["visible"]),
            "danceId": row["dance_id"],
            "danceName": row["dance_name"],
        })
    finally:
        conn.close()


@app.delete("/api/figures/<int:course_id>/<int:figure_id>")
@auth_required(roles=["admin"])
def delete_figure(course_id, figure_id):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM figures WHERE id = ? AND course_id = ?",
            (figure_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Figur nicht gefunden"}), 404

        conn.execute("DELETE FROM figures WHERE id = ?", (figure_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


FIGURE_CSV_COLUMNS = [
    "dance", "name", "description", "difficulty", "video_url", "spotify_url",
    "steps", "count", "footwork", "amount_of_turn",
    "precedes", "follows", "visible",
]


@app.get("/api/figures/<int:course_id>/export")
@auth_required(roles=["admin"])
def export_figures(course_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT f.name, f.description, f.difficulty, f.video_url, "
            "f.spotify_url, f.steps, f.count_steps, f.footwork, "
            "f.amount_of_turn, f.precedes, f.follows, f.visible, "
            "d.name AS dance_name "
            "FROM figures f JOIN dances d ON d.id = f.dance_id "
            "WHERE f.course_id = ? ORDER BY d.id, f.name",
            (course_id,),
        ).fetchall()
    finally:
        conn.close()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(FIGURE_CSV_COLUMNS)
    for r in rows:
        writer.writerow([
            r["dance_name"],
            r["name"],
            r["description"] or "",
            r["difficulty"] or "",
            r["video_url"] or "",
            r["spotify_url"] or "",
            r["steps"] or "",
            r["count_steps"] or "",
            r["footwork"] or "",
            r["amount_of_turn"] or "",
            r["precedes"] or "",
            r["follows"] or "",
            "1" if r["visible"] else "0",
        ])

    csv_text = "﻿" + buffer.getvalue()
    filename = f"figuren-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _read_csv_upload(upload):
    """Liest eine hochgeladene CSV-Datei. Gibt (reader, fieldnames_map) zurück
    oder ein (None, error_response)-Tupel im Fehlerfall."""
    try:
        raw = upload.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            upload.stream.seek(0)
            raw = upload.read().decode("latin-1")
        except Exception:
            return None, (jsonify({"error": "Datei konnte nicht gelesen werden"}), 400)

    if not raw.strip():
        return None, (jsonify({"error": "Datei ist leer"}), 400)

    sample = raw[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel

    reader = csv.DictReader(io.StringIO(raw), dialect=dialect)
    if not reader.fieldnames:
        return None, (jsonify({"error": "Keine Spaltenüberschriften gefunden"}), 400)

    fieldnames = {name.strip().lower(): name for name in reader.fieldnames if name}
    return (reader, fieldnames), None


@app.post("/api/figures/<int:course_id>/import")
@auth_required(roles=["admin"])
def import_figures(course_id):
    upload = request.files.get("file")
    if not upload:
        return jsonify({"error": "Keine Datei hochgeladen"}), 400

    parsed, err = _read_csv_upload(upload)
    if err:
        return err
    reader, fieldnames = parsed

    required = ["dance", "name"]
    missing = [c for c in required if c not in fieldnames]
    if missing:
        return jsonify({
            "error": f"Fehlende Spalten: {', '.join(missing)}. "
                     f"Erwartet u.a.: {', '.join(FIGURE_CSV_COLUMNS)}"
        }), 400

    conn = get_connection()
    try:
        dance_rows = conn.execute("SELECT id, name FROM dances").fetchall()
        dances_by_name = {r["name"].strip().lower(): r["id"] for r in dance_rows}

        existing = conn.execute(
            "SELECT f.name, d.name AS dance_name "
            "FROM figures f JOIN dances d ON d.id = f.dance_id "
            "WHERE f.course_id = ?",
            (course_id,),
        ).fetchall()
        existing_keys = {
            (r["dance_name"].strip().lower(), r["name"].strip().lower())
            for r in existing
        }

        created = 0
        skipped = []
        errors = []

        def cell(row, key):
            src = fieldnames.get(key)
            if src is None:
                return ""
            return (row.get(src) or "").strip()

        for idx, row in enumerate(reader, start=2):
            dance_name = cell(row, "dance")
            name = cell(row, "name")

            if not name:
                errors.append(f"Zeile {idx}: Name fehlt")
                continue
            if not dance_name:
                errors.append(f"Zeile {idx} ({name}): Tanz fehlt")
                continue
            dance_id = dances_by_name.get(dance_name.lower())
            if not dance_id:
                errors.append(
                    f"Zeile {idx} ({name}): Tanz '{dance_name}' nicht gefunden"
                )
                continue

            key = (dance_name.lower(), name.lower())
            if key in existing_keys:
                skipped.append(f"{name} ({dance_name})")
                continue

            visible_raw = cell(row, "visible")
            visible = 1 if (not visible_raw or _parse_bool(visible_raw)) else 0

            conn.execute(
                "INSERT INTO figures (course_id, dance_id, name, description, "
                "difficulty, video_url, spotify_url, steps, count_steps, "
                "footwork, amount_of_turn, precedes, follows, visible) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    course_id,
                    dance_id,
                    name,
                    cell(row, "description") or None,
                    cell(row, "difficulty") or None,
                    cell(row, "video_url") or None,
                    cell(row, "spotify_url") or None,
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

        conn.commit()
        return jsonify({
            "created": created,
            "skipped": skipped,
            "errors": errors,
        })
    finally:
        conn.close()


@app.put("/api/figures/<int:course_id>/visibility")
@auth_required(roles=["admin"])
def update_figures_visibility(course_id):
    data = request.get_json(silent=True) or {}
    items = data.get("items") or []
    if not isinstance(items, list):
        return jsonify({"error": "Ungültige Daten"}), 400
    conn = get_connection()
    try:
        for item in items:
            if not isinstance(item, dict):
                continue
            figure_id = item.get("id")
            visible = bool(item.get("visible"))
            conn.execute(
                "UPDATE figures SET visible = ? WHERE id = ? AND course_id = ?",
                (1 if visible else 0, figure_id, course_id),
            )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# -------------------- SEQUENCES --------------------

@app.get("/api/sequences/<int:course_id>")
@auth_required()
def get_sequences(course_id):
    if not _ensure_course_access(request.current_user, course_id):
        return jsonify({"error": "Keine Berechtigung"}), 403
    conn = get_connection()
    try:
        is_admin = request.current_user["role"] == "admin"
        query = (
            "SELECT s.id, s.name, s.figures, s.description, s.visible, "
            "s.dance_id, d.name AS dance_name "
            "FROM sequences s JOIN dances d ON d.id = s.dance_id "
            "WHERE s.course_id = ? "
            + ("" if is_admin else "AND s.visible = 1 ")
            + "ORDER BY d.id, s.name"
        )
        rows = conn.execute(query, (course_id,)).fetchall()
        return jsonify([
            {
                "id": r["id"],
                "name": r["name"],
                "figures": r["figures"],
                "description": r["description"],
                "visible": bool(r["visible"]),
                "danceId": r["dance_id"],
                "danceName": r["dance_name"],
            }
            for r in rows
        ])
    finally:
        conn.close()


@app.post("/api/sequences/<int:course_id>")
@auth_required(roles=["admin"])
def create_sequence(course_id):
    data = request.get_json(silent=True) or {}
    dance_id = data.get("danceId")
    name = (data.get("name") or "").strip()
    if not dance_id or not name:
        return jsonify({"error": "Tanz und Name sind erforderlich"}), 400

    figures = (data.get("figures") or "").strip() or None
    description = (data.get("description") or "").strip() or None

    conn = get_connection()
    try:
        dance = conn.execute(
            "SELECT id, name FROM dances WHERE id = ?", (dance_id,)
        ).fetchone()
        if not dance:
            return jsonify({"error": "Tanz nicht gefunden"}), 400

        cur = conn.execute(
            "INSERT INTO sequences (course_id, dance_id, name, figures, "
            "description, visible) VALUES (?,?,?,?,?,1)",
            (course_id, dance_id, name, figures, description),
        )
        conn.commit()
        return jsonify({
            "id": cur.lastrowid,
            "name": name,
            "figures": figures,
            "description": description,
            "visible": True,
            "danceId": dance["id"],
            "danceName": dance["name"],
        }), 201
    finally:
        conn.close()


@app.put("/api/sequences/<int:course_id>/<int:sequence_id>")
@auth_required(roles=["admin"])
def update_sequence(course_id, sequence_id):
    data = request.get_json(silent=True) or {}
    dance_id = data.get("danceId")
    name = (data.get("name") or "").strip()
    if not dance_id or not name:
        return jsonify({"error": "Tanz und Name sind erforderlich"}), 400

    figures = (data.get("figures") or "").strip() or None
    description = (data.get("description") or "").strip() or None

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM sequences WHERE id = ? AND course_id = ?",
            (sequence_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Folge nicht gefunden"}), 404

        dance = conn.execute(
            "SELECT id, name FROM dances WHERE id = ?", (dance_id,)
        ).fetchone()
        if not dance:
            return jsonify({"error": "Tanz nicht gefunden"}), 400

        conn.execute(
            "UPDATE sequences SET dance_id = ?, name = ?, figures = ?, "
            "description = ? WHERE id = ?",
            (dance_id, name, figures, description, sequence_id),
        )
        conn.commit()

        row = conn.execute(
            "SELECT s.id, s.name, s.figures, s.description, s.visible, "
            "s.dance_id, d.name AS dance_name "
            "FROM sequences s JOIN dances d ON d.id = s.dance_id "
            "WHERE s.id = ?",
            (sequence_id,),
        ).fetchone()
        return jsonify({
            "id": row["id"],
            "name": row["name"],
            "figures": row["figures"],
            "description": row["description"],
            "visible": bool(row["visible"]),
            "danceId": row["dance_id"],
            "danceName": row["dance_name"],
        })
    finally:
        conn.close()


@app.delete("/api/sequences/<int:course_id>/<int:sequence_id>")
@auth_required(roles=["admin"])
def delete_sequence(course_id, sequence_id):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM sequences WHERE id = ? AND course_id = ?",
            (sequence_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Folge nicht gefunden"}), 404
        conn.execute("DELETE FROM sequences WHERE id = ?", (sequence_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


SEQUENCE_CSV_COLUMNS = ["dance", "name", "figures", "description", "visible"]


@app.get("/api/sequences/<int:course_id>/export")
@auth_required(roles=["admin"])
def export_sequences(course_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT s.name, s.figures, s.description, s.visible, "
            "d.name AS dance_name "
            "FROM sequences s JOIN dances d ON d.id = s.dance_id "
            "WHERE s.course_id = ? ORDER BY d.id, s.name",
            (course_id,),
        ).fetchall()
    finally:
        conn.close()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(SEQUENCE_CSV_COLUMNS)
    for r in rows:
        writer.writerow([
            r["dance_name"],
            r["name"],
            r["figures"] or "",
            r["description"] or "",
            "1" if r["visible"] else "0",
        ])

    csv_text = "﻿" + buffer.getvalue()
    filename = f"folgen-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/sequences/<int:course_id>/import")
@auth_required(roles=["admin"])
def import_sequences(course_id):
    upload = request.files.get("file")
    if not upload:
        return jsonify({"error": "Keine Datei hochgeladen"}), 400

    parsed, err = _read_csv_upload(upload)
    if err:
        return err
    reader, fieldnames = parsed

    required = ["dance", "name"]
    missing = [c for c in required if c not in fieldnames]
    if missing:
        return jsonify({
            "error": f"Fehlende Spalten: {', '.join(missing)}. "
                     f"Erwartet: {', '.join(SEQUENCE_CSV_COLUMNS)}"
        }), 400

    conn = get_connection()
    try:
        dance_rows = conn.execute("SELECT id, name FROM dances").fetchall()
        dances_by_name = {r["name"].strip().lower(): r["id"] for r in dance_rows}

        existing = conn.execute(
            "SELECT s.name, d.name AS dance_name "
            "FROM sequences s JOIN dances d ON d.id = s.dance_id "
            "WHERE s.course_id = ?",
            (course_id,),
        ).fetchall()
        existing_keys = {
            (r["dance_name"].strip().lower(), r["name"].strip().lower())
            for r in existing
        }

        created = 0
        skipped = []
        errors = []

        def cell(row, key):
            src = fieldnames.get(key)
            if src is None:
                return ""
            return (row.get(src) or "").strip()

        for idx, row in enumerate(reader, start=2):
            dance_name = cell(row, "dance")
            name = cell(row, "name")

            if not name:
                errors.append(f"Zeile {idx}: Name fehlt")
                continue
            if not dance_name:
                errors.append(f"Zeile {idx} ({name}): Tanz fehlt")
                continue
            dance_id = dances_by_name.get(dance_name.lower())
            if not dance_id:
                errors.append(
                    f"Zeile {idx} ({name}): Tanz '{dance_name}' nicht gefunden"
                )
                continue

            key = (dance_name.lower(), name.lower())
            if key in existing_keys:
                skipped.append(f"{name} ({dance_name})")
                continue

            visible_raw = cell(row, "visible")
            visible = 1 if (not visible_raw or _parse_bool(visible_raw)) else 0

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

        conn.commit()
        return jsonify({
            "created": created,
            "skipped": skipped,
            "errors": errors,
        })
    finally:
        conn.close()


@app.put("/api/sequences/<int:course_id>/visibility")
@auth_required(roles=["admin"])
def update_sequences_visibility(course_id):
    data = request.get_json(silent=True) or {}
    items = data.get("items") or []
    if not isinstance(items, list):
        return jsonify({"error": "Ungültige Daten"}), 400
    conn = get_connection()
    try:
        for item in items:
            if not isinstance(item, dict):
                continue
            sequence_id = item.get("id")
            visible = bool(item.get("visible"))
            conn.execute(
                "UPDATE sequences SET visible = ? WHERE id = ? AND course_id = ?",
                (1 if visible else 0, sequence_id, course_id),
            )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# -------------------- HISTORY --------------------

@app.get("/api/history/<int:course_id>")
@auth_required()
def get_history(course_id):
    if not _ensure_course_access(request.current_user, course_id):
        return jsonify({"error": "Keine Berechtigung"}), 403
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, date, warmup, lesson, cooldown FROM history "
            "WHERE course_id = ? ORDER BY date DESC LIMIT 4",
            (course_id,),
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.get("/api/history/<int:course_id>/all")
@auth_required(roles=["admin"])
def get_all_history(course_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, date, warmup, lesson, cooldown FROM history "
            "WHERE course_id = ? ORDER BY date ASC, id ASC",
            (course_id,),
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.post("/api/history/<int:course_id>")
@auth_required(roles=["admin"])
def add_history(course_id):
    data = request.get_json(silent=True) or {}
    date = (data.get("date") or "").strip()
    warmup = (data.get("warmup") or "").strip()
    lesson = (data.get("lesson") or "").strip()
    cooldown = (data.get("cooldown") or "").strip()
    if not date:
        return jsonify({"error": "Datum erforderlich"}), 400

    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO history (course_id, date, warmup, lesson, cooldown) VALUES (?,?,?,?,?)",
            (course_id, date, warmup, lesson, cooldown),
        )
        conn.commit()
        return jsonify({"id": cur.lastrowid}), 201
    finally:
        conn.close()


@app.put("/api/history/<int:course_id>/<int:history_id>")
@auth_required(roles=["admin"])
def update_history(course_id, history_id):
    data = request.get_json(silent=True) or {}
    date = (data.get("date") or "").strip()
    warmup = (data.get("warmup") or "").strip()
    lesson = (data.get("lesson") or "").strip()
    cooldown = (data.get("cooldown") or "").strip()
    if not date:
        return jsonify({"error": "Datum erforderlich"}), 400

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM history WHERE id = ? AND course_id = ?",
            (history_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Nicht gefunden"}), 404

        conn.execute(
            "UPDATE history SET date = ?, warmup = ?, lesson = ?, cooldown = ? WHERE id = ?",
            (date, warmup, lesson, cooldown, history_id),
        )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


HISTORY_CSV_COLUMNS = ["date", "warmup", "lesson", "cooldown"]


@app.get("/api/history/<int:course_id>/export")
@auth_required(roles=["admin"])
def export_history(course_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT date, warmup, lesson, cooldown FROM history "
            "WHERE course_id = ? ORDER BY date ASC, id ASC",
            (course_id,),
        ).fetchall()
    finally:
        conn.close()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(HISTORY_CSV_COLUMNS)
    for r in rows:
        writer.writerow([
            r["date"] or "",
            r["warmup"] or "",
            r["lesson"] or "",
            r["cooldown"] or "",
        ])

    csv_text = "﻿" + buffer.getvalue()
    filename = f"historie-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/history/<int:course_id>/import")
@auth_required(roles=["admin"])
def import_history(course_id):
    upload = request.files.get("file")
    if not upload:
        return jsonify({"error": "Keine Datei hochgeladen"}), 400

    parsed, err = _read_csv_upload(upload)
    if err:
        return err
    reader, fieldnames = parsed

    if "date" not in fieldnames:
        return jsonify({
            "error": f"Fehlende Spalte: date. "
                     f"Erwartet: {', '.join(HISTORY_CSV_COLUMNS)}"
        }), 400

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT date FROM history WHERE course_id = ?",
            (course_id,),
        ).fetchall()
        existing_dates = {r["date"] for r in existing if r["date"]}

        created = 0
        skipped = []
        errors = []

        def cell(row, key):
            src = fieldnames.get(key)
            if src is None:
                return ""
            return (row.get(src) or "").strip()

        for idx, row in enumerate(reader, start=2):
            date = cell(row, "date")
            if not date:
                errors.append(f"Zeile {idx}: Datum fehlt")
                continue
            if date in existing_dates:
                skipped.append(date)
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
            existing_dates.add(date)
            created += 1

        conn.commit()
        return jsonify({
            "created": created,
            "skipped": skipped,
            "errors": errors,
        })
    finally:
        conn.close()


@app.delete("/api/history/<int:course_id>/<int:history_id>")
@auth_required(roles=["admin"])
def delete_history(course_id, history_id):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM history WHERE id = ? AND course_id = ?",
            (history_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Nicht gefunden"}), 404

        conn.execute("DELETE FROM history WHERE id = ?", (history_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# -------------------- ATTENDANCE --------------------

@app.get("/api/attendance/<int:course_id>")
@auth_required()
def get_attendance(course_id):
    if not _ensure_course_access(request.current_user, course_id):
        return jsonify({"error": "Keine Berechtigung"}), 403
    requester_id = request.current_user["id"]
    conn = get_connection()
    try:
        users = conn.execute(
            "SELECT id, username, has_four_card FROM users WHERE course_id = ? AND role = 'teilnehmer' "
            "ORDER BY username",
            (course_id,),
        ).fetchall()
        dates = conn.execute(
            "SELECT id, date FROM attendance WHERE course_id = ? ORDER BY date DESC LIMIT 4",
            (course_id,),
        ).fetchall()
        date_rows = list(reversed([dict(d) for d in dates]))

        entries = {}
        if date_rows:
            ids = [d["id"] for d in date_rows]
            placeholders = ",".join("?" for _ in ids)
            rows = conn.execute(
                f"SELECT attendance_id, user_id, present, hours FROM attendance_entries "
                f"WHERE attendance_id IN ({placeholders})",
                ids,
            ).fetchall()
            for r in rows:
                hours = r["hours"] if r["user_id"] == requester_id else None
                entries[(r["attendance_id"], r["user_id"])] = {
                    "present": bool(r["present"]),
                    "hours": hours,
                }

        users_data = []
        for u in users:
            row = {
                "id": u["id"],
                "username": u["username"],
                "hasFourCard": bool(u["has_four_card"]),
                "entries": {},
            }
            for d in date_rows:
                e = entries.get((d["id"], u["id"]))
                row["entries"][d["id"]] = e or {"present": False, "hours": None}
            users_data.append(row)

        my_card = None
        me = conn.execute(
            "SELECT has_four_card, four_card_hours, four_card_paid_at "
            "FROM users WHERE id = ?",
            (requester_id,),
        ).fetchone()
        if me and me["has_four_card"]:
            my_card = {
                "hoursUsed": me["four_card_hours"],
                "displayHours": f"{me['four_card_hours']}/4",
                "paid": me["four_card_paid_at"] is not None,
                "paidAt": me["four_card_paid_at"],
                "needsPayment": me["four_card_hours"] >= 4
                and me["four_card_paid_at"] is None,
            }

        return jsonify({
            "dates": date_rows,
            "users": users_data,
            "myCard": my_card,
        })
    finally:
        conn.close()


@app.get("/api/four-cards/<int:course_id>")
@auth_required(roles=["admin"])
def get_four_cards(course_id):
    conn = get_connection()
    try:
        users = conn.execute(
            "SELECT id, username, four_card_hours, four_card_paid_at FROM users "
            "WHERE course_id = ? AND role = 'teilnehmer' AND has_four_card = 1 "
            "ORDER BY username",
            (course_id,),
        ).fetchall()
        return jsonify([
            {
                "userId": u["id"],
                "username": u["username"],
                "hoursUsed": u["four_card_hours"],
                "displayHours": f"{u['four_card_hours']}/4",
                "paid": u["four_card_paid_at"] is not None,
                "paidAt": u["four_card_paid_at"],
                "needsPayment": u["four_card_hours"] >= 4
                and u["four_card_paid_at"] is None,
            }
            for u in users
        ])
    finally:
        conn.close()


@app.put("/api/four-cards/<int:course_id>/<int:user_id>/paid")
@auth_required(roles=["admin"])
def set_four_card_paid(course_id, user_id):
    data = request.get_json(silent=True) or {}
    paid = bool(data.get("paid"))
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM users WHERE id = ? AND course_id = ? "
            "AND has_four_card = 1",
            (user_id, course_id),
        ).fetchone()
        if not row:
            return jsonify({"error": "Nutzer nicht gefunden"}), 404
        if paid:
            now = datetime.now(timezone.utc).isoformat(timespec="seconds")
            conn.execute(
                "UPDATE users SET four_card_paid_at = ? WHERE id = ?",
                (now, user_id),
            )
        else:
            conn.execute(
                "UPDATE users SET four_card_paid_at = NULL WHERE id = ?",
                (user_id,),
            )
        conn.commit()
        updated = conn.execute(
            "SELECT four_card_hours, four_card_paid_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return jsonify({
            "userId": user_id,
            "hoursUsed": updated["four_card_hours"],
            "displayHours": f"{updated['four_card_hours']}/4",
            "paid": updated["four_card_paid_at"] is not None,
            "paidAt": updated["four_card_paid_at"],
            "needsPayment": updated["four_card_hours"] >= 4
            and updated["four_card_paid_at"] is None,
        })
    finally:
        conn.close()


@app.post("/api/four-cards/<int:course_id>/recompute")
@auth_required(roles=["admin"])
def recompute_four_cards(course_id):
    """Synchronisiert alle 4er-Karten-Snapshots eines Kurses mit der Anwesenheits-Historie."""
    conn = get_connection()
    try:
        _recompute_all_four_cards(conn, course_id)
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.get("/api/attendance/<int:course_id>/all")
@auth_required(roles=["admin"])
def get_all_attendance(course_id):
    conn = get_connection()
    try:
        dates = conn.execute(
            "SELECT id, date FROM attendance WHERE course_id = ? "
            "ORDER BY date ASC, id ASC",
            (course_id,),
        ).fetchall()
        date_rows = [dict(d) for d in dates]
        if not date_rows:
            return jsonify([])

        ids = [d["id"] for d in date_rows]
        placeholders = ",".join("?" for _ in ids)
        entry_rows = conn.execute(
            f"SELECT ae.attendance_id, ae.user_id, ae.present, ae.hours, "
            f"u.username, u.has_four_card "
            f"FROM attendance_entries ae JOIN users u ON u.id = ae.user_id "
            f"WHERE ae.attendance_id IN ({placeholders}) "
            f"ORDER BY u.username",
            ids,
        ).fetchall()

        by_date: dict[int, list] = {d["id"]: [] for d in date_rows}
        for r in entry_rows:
            by_date[r["attendance_id"]].append({
                "userId": r["user_id"],
                "username": r["username"],
                "hasFourCard": bool(r["has_four_card"]),
                "present": bool(r["present"]),
                "hours": r["hours"],
            })

        return jsonify([
            {
                "id": d["id"],
                "date": d["date"],
                "entries": by_date[d["id"]],
            }
            for d in date_rows
        ])
    finally:
        conn.close()


ATTENDANCE_CSV_COLUMNS = ["date", "username", "present"]


@app.get("/api/attendance/<int:course_id>/export")
@auth_required(roles=["admin"])
def export_attendance(course_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT a.date, u.username, ae.present "
            "FROM attendance_entries ae "
            "JOIN attendance a ON a.id = ae.attendance_id "
            "JOIN users u ON u.id = ae.user_id "
            "WHERE a.course_id = ? "
            "ORDER BY a.date ASC, a.id ASC, u.username ASC",
            (course_id,),
        ).fetchall()
    finally:
        conn.close()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(ATTENDANCE_CSV_COLUMNS)
    for r in rows:
        writer.writerow([
            r["date"] or "",
            r["username"],
            "1" if r["present"] else "0",
        ])

    csv_text = "﻿" + buffer.getvalue()
    filename = f"anwesenheit-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/attendance/<int:course_id>/import")
@auth_required(roles=["admin"])
def import_attendance(course_id):
    upload = request.files.get("file")
    if not upload:
        return jsonify({"error": "Keine Datei hochgeladen"}), 400

    parsed, err = _read_csv_upload(upload)
    if err:
        return err
    reader, fieldnames = parsed

    required = ["date", "username", "present"]
    missing = [c for c in required if c not in fieldnames]
    if missing:
        return jsonify({
            "error": f"Fehlende Spalten: {', '.join(missing)}. "
                     f"Erwartet: {', '.join(ATTENDANCE_CSV_COLUMNS)}"
        }), 400

    conn = get_connection()
    try:
        user_rows = conn.execute(
            "SELECT id, username FROM users WHERE course_id = ?",
            (course_id,),
        ).fetchall()
        users_by_name = {r["username"].strip().lower(): r["id"] for r in user_rows}

        existing = conn.execute(
            "SELECT id, date FROM attendance WHERE course_id = ?",
            (course_id,),
        ).fetchall()
        existing_dates = {r["date"]: r["id"] for r in existing if r["date"]}

        def cell(row, key):
            src = fieldnames.get(key)
            if src is None:
                return ""
            return (row.get(src) or "").strip()

        grouped: dict[str, list] = {}
        row_errors = []

        for idx, row in enumerate(reader, start=2):
            date = cell(row, "date")
            username = cell(row, "username")
            present_raw = cell(row, "present")

            if not date:
                row_errors.append(f"Zeile {idx}: Datum fehlt")
                continue
            if not username:
                row_errors.append(f"Zeile {idx}: Benutzername fehlt")
                continue
            user_id = users_by_name.get(username.lower())
            if not user_id:
                row_errors.append(
                    f"Zeile {idx} ({username}): Nutzer im Kurs nicht gefunden"
                )
                continue

            grouped.setdefault(date, []).append({
                "user_id": user_id,
                "present": 1 if _parse_bool(present_raw) else 0,
            })

        created_dates = 0
        updated_dates = []
        entries_added = 0
        entries_skipped = 0

        for date, entries in grouped.items():
            attendance_id = existing_dates.get(date)
            if attendance_id is None:
                cur = conn.execute(
                    "INSERT INTO attendance (course_id, date) VALUES (?, ?)",
                    (course_id, date),
                )
                attendance_id = cur.lastrowid
                created_dates += 1
                existing_user_ids = set()
            else:
                existing_entries = conn.execute(
                    "SELECT user_id FROM attendance_entries WHERE attendance_id = ?",
                    (attendance_id,),
                ).fetchall()
                existing_user_ids = {r["user_id"] for r in existing_entries}

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

            if added_here > 0 and date in existing_dates:
                updated_dates.append(date)

        if entries_added > 0:
            _recompute_all_four_cards(conn, course_id)

        conn.commit()
        return jsonify({
            "created": created_dates,
            "updated": updated_dates,
            "entriesAdded": entries_added,
            "entriesSkipped": entries_skipped,
            "skipped": [],
            "errors": row_errors,
        })
    finally:
        conn.close()


@app.delete("/api/attendance/<int:course_id>/<int:attendance_id>")
@auth_required(roles=["admin"])
def delete_attendance(course_id, attendance_id):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM attendance WHERE id = ? AND course_id = ?",
            (attendance_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Nicht gefunden"}), 404

        conn.execute(
            "DELETE FROM attendance_entries WHERE attendance_id = ?",
            (attendance_id,),
        )
        conn.execute("DELETE FROM attendance WHERE id = ?", (attendance_id,))

        _recompute_all_four_cards(conn, course_id)

        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.post("/api/attendance/<int:course_id>")
@auth_required(roles=["admin"])
def add_attendance(course_id):
    data = request.get_json(silent=True) or {}
    date = (data.get("date") or "").strip()
    entries = data.get("entries") or []
    if not date:
        return jsonify({"error": "Datum erforderlich"}), 400

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM attendance WHERE course_id = ? AND date = ?",
            (course_id, date),
        ).fetchone()
        if existing:
            attendance_id = existing["id"]
            conn.execute(
                "DELETE FROM attendance_entries WHERE attendance_id = ?",
                (attendance_id,),
            )
        else:
            cur = conn.execute(
                "INSERT INTO attendance (course_id, date) VALUES (?, ?)",
                (course_id, date),
            )
            attendance_id = cur.lastrowid

        for e in entries:
            user_id = e.get("userId")
            if user_id is None:
                continue
            present = 1 if e.get("present") else 0
            conn.execute(
                "INSERT INTO attendance_entries (attendance_id, user_id, present, hours) "
                "VALUES (?,?,?,?)",
                (attendance_id, user_id, present, None),
            )

        _recompute_all_four_cards(conn, course_id)

        conn.commit()
        return jsonify({"id": attendance_id}), 201
    finally:
        conn.close()


# -------------------- ERROR HANDLING --------------------

@app.errorhandler(404)
def not_found(_):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Nicht gefunden"}), 404
    return app.send_static_file("index.html")


@app.errorhandler(500)
def server_error(_):
    return jsonify({"error": "Serverfehler"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))

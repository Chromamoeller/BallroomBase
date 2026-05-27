import secrets
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

from database import get_connection, init_db
from seed import seed
import os

app = Flask(__name__)
CORS(app, supports_credentials=True)

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
            "f.steps, f.count_steps, f.footwork, f.amount_of_turn, "
            "f.precedes, f.follows, f.visible, "
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
            "video_url, steps, count_steps, footwork, amount_of_turn, precedes, follows, visible) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)",
            (
                course_id,
                dance_id,
                name,
                description,
                difficulty,
                video_url,
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
    return jsonify({"error": "Nicht gefunden"}), 404


@app.errorhandler(500)
def server_error(_):
    return jsonify({"error": "Serverfehler"}), 500


if __name__ == "__main__":
    init_db()
    seed()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))

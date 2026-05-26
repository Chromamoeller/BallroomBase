import secrets
from functools import wraps

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash

from database import get_connection, init_db
from seed import seed

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
                entries[(r["attendance_id"], r["user_id"])] = {
                    "present": bool(r["present"]),
                    "hours": r["hours"],
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

        return jsonify({"dates": date_rows, "users": users_data})
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
            conn.execute("DELETE FROM attendance_entries WHERE attendance_id = ?", (attendance_id,))
        else:
            cur = conn.execute(
                "INSERT INTO attendance (course_id, date) VALUES (?, ?)",
                (course_id, date),
            )
            attendance_id = cur.lastrowid

        for e in entries:
            user_id = e.get("userId")
            present = 1 if e.get("present") else 0
            hours = e.get("hours") if present else None
            if user_id is None:
                continue
            conn.execute(
                "INSERT INTO attendance_entries (attendance_id, user_id, present, hours) "
                "VALUES (?,?,?,?)",
                (attendance_id, user_id, present, hours),
            )

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
    app.run(host="127.0.0.1", port=5000, debug=True)

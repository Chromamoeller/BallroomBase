"""Auth-Routen + zentrale Hilfsfunktionen für Token/Berechtigungen."""

import secrets
import time
from functools import wraps

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from database import get_connection


# Einfache Token-Verwaltung im Speicher.
# Reicht für eine lokale Demo; bei echter Mehrbenutzer-Nutzung
# sollte JWT oder eine Session-Tabelle verwendet werden.
TOKENS: dict[str, int] = {}


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
        return dict(row) if row is not None else None
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


bp = Blueprint("auth", __name__)


@bp.post("/api/login")
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


REGISTER_WINDOW_SECONDS = 15 * 60
REGISTER_MAX_ATTEMPTS = 10
_register_attempts: dict[str, list[float]] = {}


def _client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        # Letzter Eintrag stammt vom Proxy (Railway) und ist nicht fälschbar.
        return forwarded.split(",")[-1].strip()
    return request.remote_addr or "unknown"


def _register_rate_limited(ip):
    now = time.time()
    recent = [t for t in _register_attempts.get(ip, []) if now - t < REGISTER_WINDOW_SECONDS]
    if len(recent) >= REGISTER_MAX_ATTEMPTS:
        _register_attempts[ip] = recent
        return True
    recent.append(now)
    _register_attempts[ip] = recent
    return False


@bp.post("/api/register")
def register():
    if _register_rate_limited(_client_ip()):
        return jsonify({"error": "Zu viele Versuche. Bitte später erneut versuchen."}), 429

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    course_id = data.get("courseId")
    join_code = (data.get("joinCode") or "").strip().upper()

    if not username or not password or not course_id or not join_code:
        return jsonify({"error": "Bitte alle Felder ausfüllen"}), 400
    if len(username) < 2 or len(username) > 40:
        return jsonify({"error": "Teilnehmername muss 2 bis 40 Zeichen lang sein"}), 400
    if len(password) < 4:
        return jsonify({"error": "Passwort muss mindestens 4 Zeichen lang sein"}), 400

    conn = get_connection()
    try:
        course = conn.execute(
            "SELECT id, name, join_code FROM courses WHERE id = ?", (course_id,)
        ).fetchone()
        stored_code = ((course["join_code"] if course else "") or "").upper()
        if not course or not stored_code or not secrets.compare_digest(
            stored_code.encode(), join_code.encode()
        ):
            return jsonify({"error": "Ungültiger Beitrittscode für diesen Kurs"}), 403

        taken = conn.execute(
            "SELECT id FROM users WHERE lower(username) = lower(?)", (username,)
        ).fetchone()
        if taken:
            return jsonify({"error": "Dieser Teilnehmername ist bereits vergeben"}), 400

        cur = conn.execute(
            "INSERT INTO users (username, password_hash, role, course_id, has_four_card) "
            "VALUES (?, ?, 'teilnehmer', ?, 0)",
            (username, generate_password_hash(password), course["id"]),
        )
        conn.commit()
        user_id = cur.lastrowid
    finally:
        conn.close()

    token = secrets.token_hex(24)
    TOKENS[token] = user_id
    return jsonify({
        "token": token,
        "user": {
            "id": user_id,
            "username": username,
            "role": "teilnehmer",
            "courseId": course["id"],
            "courseName": course["name"],
        },
    }), 201


@bp.post("/api/logout")
@auth_required()
def logout():
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    TOKENS.pop(token, None)
    return jsonify({"ok": True})


@bp.get("/api/me")
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


@bp.post("/api/change-password")
@auth_required()
def change_password():
    data = request.get_json(silent=True) or {}
    current_password = data.get("currentPassword") or ""
    new_password = data.get("newPassword") or ""

    if not current_password or not new_password:
        return jsonify({"error": "Aktuelles und neues Passwort erforderlich"}), 400
    if len(new_password) < 4:
        return jsonify({"error": "Neues Passwort muss mindestens 4 Zeichen lang sein"}), 400

    user_id = request.current_user["id"]
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not row or not check_password_hash(row["password_hash"], current_password):
            return jsonify({"error": "Aktuelles Passwort ist falsch"}), 400

        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (generate_password_hash(new_password), user_id),
        )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()

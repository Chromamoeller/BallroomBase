"""Auth-Routen + zentrale Hilfsfunktionen für Token/Berechtigungen."""

import secrets
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

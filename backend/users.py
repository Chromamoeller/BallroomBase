"""Nutzerverwaltung: CRUD. Import/Export läuft zentral über backup.py."""

from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from auth import auth_required
from database import get_connection


bp = Blueprint("users", __name__)


@bp.get("/api/users")
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


@bp.post("/api/users")
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


@bp.put("/api/users/<int:user_id>")
@auth_required(roles=["admin"])
def update_user(user_id):
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    role = (data.get("role") or "").strip()
    course_id = data.get("courseId")
    has_four_card = 1 if data.get("hasFourCard") else 0
    password = data.get("password") or ""

    four_card_hours_override = None
    if "fourCardHours" in data and data.get("fourCardHours") is not None:
        try:
            four_card_hours_override = int(data["fourCardHours"])
        except (TypeError, ValueError):
            return jsonify({"error": "Ungültige Stundenzahl"}), 400
        if four_card_hours_override < 0 or four_card_hours_override > 4:
            return jsonify({"error": "Stundenzahl muss zwischen 0 und 4 liegen"}), 400

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
        # 4er-Karte (Modell A: laufender Zähler – der manuell gesetzte Wert ist
        # maßgeblich und wird NICHT aus der Anwesenheits-Historie neu berechnet).
        if not has_four_card:
            conn.execute(
                "UPDATE users SET four_card_hours = 0, four_card_wraps = 0, "
                "four_card_paid_at = NULL WHERE id = ?",
                (user_id,),
            )
        elif four_card_hours_override is not None:
            conn.execute(
                "UPDATE users SET four_card_hours = ? WHERE id = ?",
                (four_card_hours_override, user_id),
            )
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


@bp.delete("/api/users/<int:user_id>")
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

"""Nutzerverwaltung: CRUD + CSV-Import/Export."""

import csv
import io
from datetime import datetime

from flask import Blueprint, Response, jsonify, request
from werkzeug.security import generate_password_hash

from _shared import parse_bool, recompute_four_card
from auth import auth_required
from database import get_connection


bp = Blueprint("users", __name__)


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
        recompute_four_card(conn, user_id)
        if four_card_hours_override is not None and has_four_card:
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


@bp.get("/api/users/export")
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


@bp.post("/api/users/import")
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
            has_four_card = 1 if parse_bool(cell("has_four_card")) else 0

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

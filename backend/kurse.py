"""Kursverwaltung: eigenständige Kursangebote inkl. Teilnehmerliste.

Hinweis: Dies ist eine eigene Entität, getrennt von der bestehenden
`courses`-Tabelle (die Nutzer/Figuren/etc. nach Zeitslot gruppiert). Hier legt
der Admin konkrete Kurse mit Uhrzeit, Startdatum und Stundenzahl an. Die
Teilnehmer sind reine Namens-Strings (keine angelegten Accounts) und haben
einen Bezahlstatus."""

from flask import Blueprint, jsonify, request

from auth import auth_required
from database import get_connection


bp = Blueprint("kurse", __name__)


def _serialize(conn, program_row):
    participants = conn.execute(
        "SELECT id, name, paid FROM course_program_participants "
        "WHERE program_id = ? ORDER BY id",
        (program_row["id"],),
    ).fetchall()
    return {
        "id": program_row["id"],
        "name": program_row["name"],
        "time": program_row["time"] or "",
        "startDate": program_row["start_date"] or "",
        "hours": program_row["hours"],
        "participants": [
            {"id": p["id"], "name": p["name"], "paid": bool(p["paid"])}
            for p in participants
        ],
    }


def _parse_participants(data):
    raw = data.get("participants")
    result = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                name = (item.get("name") or "").strip()
                paid = 1 if item.get("paid") else 0
            else:
                name = str(item).strip()
                paid = 0
            if name:
                result.append((name, paid))
    return result


@bp.get("/api/course-programs")
@auth_required(roles=["admin"])
def list_programs():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, name, time, start_date, hours FROM course_programs "
            "ORDER BY id DESC"
        ).fetchall()
        return jsonify([_serialize(conn, r) for r in rows])
    finally:
        conn.close()


@bp.post("/api/course-programs")
@auth_required(roles=["admin"])
def create_program():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    time = (data.get("time") or "").strip()
    start_date = (data.get("startDate") or "").strip()
    hours_raw = data.get("hours")

    if not name:
        return jsonify({"error": "Name erforderlich"}), 400

    hours = None
    if hours_raw not in (None, ""):
        try:
            hours = int(hours_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "Stundenanzahl muss eine Zahl sein"}), 400
        if hours < 0:
            return jsonify({"error": "Stundenanzahl darf nicht negativ sein"}), 400

    participants = _parse_participants(data)

    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO course_programs (name, time, start_date, hours) "
            "VALUES (?,?,?,?)",
            (name, time or None, start_date or None, hours),
        )
        program_id = cur.lastrowid
        for p_name, p_paid in participants:
            conn.execute(
                "INSERT INTO course_program_participants (program_id, name, paid) "
                "VALUES (?,?,?)",
                (program_id, p_name, p_paid),
            )
        conn.commit()
        row = conn.execute(
            "SELECT id, name, time, start_date, hours FROM course_programs "
            "WHERE id = ?",
            (program_id,),
        ).fetchone()
        return jsonify(_serialize(conn, row)), 201
    finally:
        conn.close()


@bp.put("/api/course-programs/<int:program_id>")
@auth_required(roles=["admin"])
def update_program(program_id):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    time = (data.get("time") or "").strip()
    start_date = (data.get("startDate") or "").strip()
    hours_raw = data.get("hours")

    if not name:
        return jsonify({"error": "Name erforderlich"}), 400

    hours = None
    if hours_raw not in (None, ""):
        try:
            hours = int(hours_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "Stundenanzahl muss eine Zahl sein"}), 400
        if hours < 0:
            return jsonify({"error": "Stundenanzahl darf nicht negativ sein"}), 400

    participants = _parse_participants(data)

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM course_programs WHERE id = ?", (program_id,)
        ).fetchone()
        if not existing:
            return jsonify({"error": "Kurs nicht gefunden"}), 404

        conn.execute(
            "UPDATE course_programs SET name = ?, time = ?, start_date = ?, "
            "hours = ? WHERE id = ?",
            (name, time or None, start_date or None, hours, program_id),
        )
        conn.execute(
            "DELETE FROM course_program_participants WHERE program_id = ?",
            (program_id,),
        )
        for p_name, p_paid in participants:
            conn.execute(
                "INSERT INTO course_program_participants (program_id, name, paid) "
                "VALUES (?,?,?)",
                (program_id, p_name, p_paid),
            )
        conn.commit()
        row = conn.execute(
            "SELECT id, name, time, start_date, hours FROM course_programs "
            "WHERE id = ?",
            (program_id,),
        ).fetchone()
        return jsonify(_serialize(conn, row))
    finally:
        conn.close()


@bp.delete("/api/course-programs/<int:program_id>")
@auth_required(roles=["admin"])
def delete_program(program_id):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM course_programs WHERE id = ?", (program_id,)
        ).fetchone()
        if not existing:
            return jsonify({"error": "Kurs nicht gefunden"}), 404
        conn.execute(
            "DELETE FROM course_program_participants WHERE program_id = ?",
            (program_id,),
        )
        conn.execute("DELETE FROM course_programs WHERE id = ?", (program_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()

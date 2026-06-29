"""Historie: CRUD. Import/Export läuft zentral über backup.py."""

from flask import Blueprint, jsonify, request

from _shared import ensure_course_access
from auth import auth_required
from database import get_connection


bp = Blueprint("history", __name__)


@bp.get("/api/history/<int:course_id>")
@auth_required()
def get_history(course_id):
    if not ensure_course_access(request.current_user, course_id):
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


@bp.get("/api/history/<int:course_id>/all")
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


@bp.post("/api/history/<int:course_id>")
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


@bp.put("/api/history/<int:course_id>/<int:history_id>")
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


@bp.delete("/api/history/<int:course_id>/<int:history_id>")
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

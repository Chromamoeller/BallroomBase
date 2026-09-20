"""Stammdaten: Kurse und Tänze."""

from flask import Blueprint, jsonify, request

from auth import auth_required
from database import get_connection


bp = Blueprint("catalog", __name__)


@bp.get("/api/courses")
def list_courses():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT id, name FROM courses ORDER BY id").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@bp.get("/api/courses/join-codes")
@auth_required(roles=["admin"])
def list_join_codes():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, name, join_code FROM courses ORDER BY id"
        ).fetchall()
        return jsonify([
            {"id": r["id"], "name": r["name"], "joinCode": r["join_code"] or ""}
            for r in rows
        ])
    finally:
        conn.close()


@bp.put("/api/courses/<int:course_id>/join-code")
@auth_required(roles=["admin"])
def update_join_code(course_id):
    data = request.get_json(silent=True) or {}
    code = (data.get("joinCode") or "").strip().upper()
    if len(code) < 4 or len(code) > 20 or not code.replace("-", "").isalnum():
        return jsonify({
            "error": "Code muss 4 bis 20 Zeichen (Buchstaben, Zahlen, Bindestrich) lang sein"
        }), 400
    conn = get_connection()
    try:
        if not conn.execute("SELECT id FROM courses WHERE id = ?", (course_id,)).fetchone():
            return jsonify({"error": "Kurs nicht gefunden"}), 404
        clash = conn.execute(
            "SELECT id FROM courses WHERE join_code = ? AND id != ?", (code, course_id)
        ).fetchone()
        if clash:
            return jsonify({"error": "Dieser Code wird bereits von einem anderen Kurs genutzt"}), 400
        conn.execute("UPDATE courses SET join_code = ? WHERE id = ?", (code, course_id))
        conn.commit()
        return jsonify({"id": course_id, "joinCode": code})
    finally:
        conn.close()


@bp.get("/api/dances")
def list_dances():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT id, name FROM dances ORDER BY id").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

"""Kanban-Board der Figuren: Spalten je Kurs und Tanz, Karten verschieben."""

from flask import Blueprint, jsonify, request

from _shared import ensure_course_access
from auth import auth_required
from database import get_connection


bp = Blueprint("board", __name__)

MAX_COLUMN_NAME = 60


def _column_dict(r):
    return {
        "id": r["id"],
        "danceId": r["dance_id"],
        "name": r["name"],
        "position": r["position"],
    }


@bp.get("/api/figure-columns/<int:course_id>")
@auth_required()
def list_columns(course_id):
    if not ensure_course_access(request.current_user, course_id):
        return jsonify({"error": "Keine Berechtigung"}), 403
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, dance_id, name, position FROM figure_columns "
            "WHERE course_id = ? ORDER BY dance_id, position, id",
            (course_id,),
        ).fetchall()
        return jsonify([_column_dict(r) for r in rows])
    finally:
        conn.close()


@bp.post("/api/figure-columns/<int:course_id>")
@auth_required(roles=["admin"])
def create_column(course_id):
    data = request.get_json(silent=True) or {}
    dance_id = data.get("danceId")
    name = (data.get("name") or "").strip()
    if not dance_id or not name:
        return jsonify({"error": "Tanz und Name sind erforderlich"}), 400
    if len(name) > MAX_COLUMN_NAME:
        return jsonify({"error": "Name ist zu lang (max. 60 Zeichen)"}), 400
    conn = get_connection()
    try:
        if not conn.execute("SELECT id FROM dances WHERE id = ?", (dance_id,)).fetchone():
            return jsonify({"error": "Tanz nicht gefunden"}), 400
        position = conn.execute(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM figure_columns "
            "WHERE course_id = ? AND dance_id = ?",
            (course_id, dance_id),
        ).fetchone()[0]
        cur = conn.execute(
            "INSERT INTO figure_columns (course_id, dance_id, name, position) "
            "VALUES (?,?,?,?)",
            (course_id, dance_id, name, position),
        )
        conn.commit()
        return jsonify({
            "id": cur.lastrowid,
            "danceId": dance_id,
            "name": name,
            "position": position,
        }), 201
    finally:
        conn.close()


@bp.put("/api/figure-columns/<int:course_id>/order")
@auth_required(roles=["admin"])
def reorder_columns(course_id):
    data = request.get_json(silent=True) or {}
    dance_id = data.get("danceId")
    ids = data.get("ids")
    if not dance_id or not isinstance(ids, list):
        return jsonify({"error": "Ungültige Daten"}), 400
    conn = get_connection()
    try:
        for index, column_id in enumerate(ids, start=1):
            conn.execute(
                "UPDATE figure_columns SET position = ? "
                "WHERE id = ? AND course_id = ? AND dance_id = ?",
                (index, column_id, course_id, dance_id),
            )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@bp.put("/api/figure-columns/<int:course_id>/<int:column_id>")
@auth_required(roles=["admin"])
def rename_column(course_id, column_id):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name erforderlich"}), 400
    if len(name) > MAX_COLUMN_NAME:
        return jsonify({"error": "Name ist zu lang (max. 60 Zeichen)"}), 400
    conn = get_connection()
    try:
        cur = conn.execute(
            "UPDATE figure_columns SET name = ? WHERE id = ? AND course_id = ?",
            (name, column_id, course_id),
        )
        if cur.rowcount == 0:
            return jsonify({"error": "Spalte nicht gefunden"}), 404
        conn.commit()
        return jsonify({"id": column_id, "name": name})
    finally:
        conn.close()


@bp.delete("/api/figure-columns/<int:course_id>/<int:column_id>")
@auth_required(roles=["admin"])
def delete_column(course_id, column_id):
    conn = get_connection()
    try:
        exists = conn.execute(
            "SELECT id FROM figure_columns WHERE id = ? AND course_id = ?",
            (column_id, course_id),
        ).fetchone()
        if not exists:
            return jsonify({"error": "Spalte nicht gefunden"}), 404
        # Karten der Spalte wandern zurück nach "Nicht zugeordnet".
        conn.execute(
            "UPDATE figures SET column_id = NULL WHERE column_id = ?", (column_id,)
        )
        conn.execute("DELETE FROM figure_columns WHERE id = ?", (column_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@bp.put("/api/figures/<int:course_id>/board")
@auth_required(roles=["admin"])
def update_board(course_id):
    """Speichert Spaltenzuordnung und Reihenfolge der Karten."""
    data = request.get_json(silent=True) or {}
    items = data.get("items") or []
    if not isinstance(items, list):
        return jsonify({"error": "Ungültige Daten"}), 400
    conn = get_connection()
    try:
        columns = {
            r["id"]: r["dance_id"]
            for r in conn.execute(
                "SELECT id, dance_id FROM figure_columns WHERE course_id = ?",
                (course_id,),
            )
        }
        figures = {
            r["id"]: r["dance_id"]
            for r in conn.execute(
                "SELECT id, dance_id FROM figures WHERE course_id = ?", (course_id,)
            )
        }
        for item in items:
            if not isinstance(item, dict):
                return jsonify({"error": "Ungültige Daten"}), 400
            figure_id = item.get("id")
            column_id = item.get("columnId")
            if figure_id not in figures or not isinstance(item.get("position"), int):
                return jsonify({"error": "Ungültige Figur"}), 400
            if column_id is not None and columns.get(column_id) != figures[figure_id]:
                return jsonify({"error": "Ungültige Spalte"}), 400
        for item in items:
            conn.execute(
                "UPDATE figures SET column_id = ?, position = ? "
                "WHERE id = ? AND course_id = ?",
                (item.get("columnId"), item["position"], item["id"], course_id),
            )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()

"""Figuren: CRUD + Sichtbarkeit. Import/Export läuft zentral über backup.py."""

from flask import Blueprint, jsonify, request

from _shared import ensure_course_access
from auth import auth_required
from database import get_connection


bp = Blueprint("figures", __name__)


@bp.get("/api/figures/<int:course_id>")
@auth_required()
def get_figures(course_id):
    if not ensure_course_access(request.current_user, course_id):
        return jsonify({"error": "Keine Berechtigung"}), 403
    conn = get_connection()
    try:
        is_admin = request.current_user["role"] == "admin"
        query = (
            "SELECT f.id, f.name, f.description, f.difficulty, f.video_url, "
            "f.steps, f.count_steps, f.footwork, "
            "f.amount_of_turn, f.precedes, f.follows, f.visible, "
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


@bp.post("/api/figures/<int:course_id>")
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
            "video_url, steps, count_steps, footwork, amount_of_turn, "
            "precedes, follows, visible) "
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


@bp.put("/api/figures/<int:course_id>/<int:figure_id>")
@auth_required(roles=["admin"])
def update_figure(course_id, figure_id):
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
        existing = conn.execute(
            "SELECT id FROM figures WHERE id = ? AND course_id = ?",
            (figure_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Figur nicht gefunden"}), 404

        dance = conn.execute(
            "SELECT id, name FROM dances WHERE id = ?", (dance_id,)
        ).fetchone()
        if not dance:
            return jsonify({"error": "Tanz nicht gefunden"}), 400

        conn.execute(
            "UPDATE figures SET dance_id = ?, name = ?, description = ?, "
            "difficulty = ?, video_url = ?, steps = ?, "
            "count_steps = ?, footwork = ?, amount_of_turn = ?, "
            "precedes = ?, follows = ? WHERE id = ?",
            (
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
                figure_id,
            ),
        )
        conn.commit()

        row = conn.execute(
            "SELECT f.id, f.name, f.description, f.difficulty, f.video_url, "
            "f.steps, f.count_steps, f.footwork, "
            "f.amount_of_turn, f.precedes, f.follows, f.visible, "
            "f.dance_id, d.name AS dance_name "
            "FROM figures f JOIN dances d ON d.id = f.dance_id "
            "WHERE f.id = ?",
            (figure_id,),
        ).fetchone()
        return jsonify({
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "difficulty": row["difficulty"],
            "videoUrl": row["video_url"],
            "steps": row["steps"],
            "count": row["count_steps"],
            "footwork": row["footwork"],
            "amountOfTurn": row["amount_of_turn"],
            "precedes": row["precedes"],
            "follows": row["follows"],
            "visible": bool(row["visible"]),
            "danceId": row["dance_id"],
            "danceName": row["dance_name"],
        })
    finally:
        conn.close()


@bp.delete("/api/figures/<int:course_id>/<int:figure_id>")
@auth_required(roles=["admin"])
def delete_figure(course_id, figure_id):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM figures WHERE id = ? AND course_id = ?",
            (figure_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Figur nicht gefunden"}), 404

        conn.execute("DELETE FROM figures WHERE id = ?", (figure_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@bp.put("/api/figures/<int:course_id>/visibility")
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

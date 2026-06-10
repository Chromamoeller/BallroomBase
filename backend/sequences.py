"""Folgen: CRUD, Sichtbarkeit, CSV-Import/Export."""

import csv
import io
from datetime import datetime

from flask import Blueprint, Response, jsonify, request

from _shared import ensure_course_access, parse_bool, read_csv_upload
from auth import auth_required
from database import get_connection


bp = Blueprint("sequences", __name__)


SEQUENCE_CSV_COLUMNS = ["dance", "name", "figures", "description", "visible"]


@bp.get("/api/sequences/<int:course_id>")
@auth_required()
def get_sequences(course_id):
    if not ensure_course_access(request.current_user, course_id):
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


@bp.post("/api/sequences/<int:course_id>")
@auth_required(roles=["admin"])
def create_sequence(course_id):
    data = request.get_json(silent=True) or {}
    dance_id = data.get("danceId")
    name = (data.get("name") or "").strip()
    if not dance_id or not name:
        return jsonify({"error": "Tanz und Name sind erforderlich"}), 400

    figures = (data.get("figures") or "").strip() or None
    description = (data.get("description") or "").strip() or None

    conn = get_connection()
    try:
        dance = conn.execute(
            "SELECT id, name FROM dances WHERE id = ?", (dance_id,)
        ).fetchone()
        if not dance:
            return jsonify({"error": "Tanz nicht gefunden"}), 400

        cur = conn.execute(
            "INSERT INTO sequences (course_id, dance_id, name, figures, "
            "description, visible) VALUES (?,?,?,?,?,1)",
            (course_id, dance_id, name, figures, description),
        )
        conn.commit()
        return jsonify({
            "id": cur.lastrowid,
            "name": name,
            "figures": figures,
            "description": description,
            "visible": True,
            "danceId": dance["id"],
            "danceName": dance["name"],
        }), 201
    finally:
        conn.close()


@bp.put("/api/sequences/<int:course_id>/<int:sequence_id>")
@auth_required(roles=["admin"])
def update_sequence(course_id, sequence_id):
    data = request.get_json(silent=True) or {}
    dance_id = data.get("danceId")
    name = (data.get("name") or "").strip()
    if not dance_id or not name:
        return jsonify({"error": "Tanz und Name sind erforderlich"}), 400

    figures = (data.get("figures") or "").strip() or None
    description = (data.get("description") or "").strip() or None

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM sequences WHERE id = ? AND course_id = ?",
            (sequence_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Folge nicht gefunden"}), 404

        dance = conn.execute(
            "SELECT id, name FROM dances WHERE id = ?", (dance_id,)
        ).fetchone()
        if not dance:
            return jsonify({"error": "Tanz nicht gefunden"}), 400

        conn.execute(
            "UPDATE sequences SET dance_id = ?, name = ?, figures = ?, "
            "description = ? WHERE id = ?",
            (dance_id, name, figures, description, sequence_id),
        )
        conn.commit()

        row = conn.execute(
            "SELECT s.id, s.name, s.figures, s.description, s.visible, "
            "s.dance_id, d.name AS dance_name "
            "FROM sequences s JOIN dances d ON d.id = s.dance_id "
            "WHERE s.id = ?",
            (sequence_id,),
        ).fetchone()
        return jsonify({
            "id": row["id"],
            "name": row["name"],
            "figures": row["figures"],
            "description": row["description"],
            "visible": bool(row["visible"]),
            "danceId": row["dance_id"],
            "danceName": row["dance_name"],
        })
    finally:
        conn.close()


@bp.delete("/api/sequences/<int:course_id>/<int:sequence_id>")
@auth_required(roles=["admin"])
def delete_sequence(course_id, sequence_id):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM sequences WHERE id = ? AND course_id = ?",
            (sequence_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Folge nicht gefunden"}), 404
        conn.execute("DELETE FROM sequences WHERE id = ?", (sequence_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@bp.get("/api/sequences/<int:course_id>/export")
@auth_required(roles=["admin"])
def export_sequences(course_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT s.name, s.figures, s.description, s.visible, "
            "d.name AS dance_name "
            "FROM sequences s JOIN dances d ON d.id = s.dance_id "
            "WHERE s.course_id = ? ORDER BY d.id, s.name",
            (course_id,),
        ).fetchall()
    finally:
        conn.close()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(SEQUENCE_CSV_COLUMNS)
    for r in rows:
        writer.writerow([
            r["dance_name"],
            r["name"],
            r["figures"] or "",
            r["description"] or "",
            "1" if r["visible"] else "0",
        ])

    csv_text = "﻿" + buffer.getvalue()
    filename = f"folgen-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@bp.post("/api/sequences/<int:course_id>/import")
@auth_required(roles=["admin"])
def import_sequences(course_id):
    upload = request.files.get("file")
    if not upload:
        return jsonify({"error": "Keine Datei hochgeladen"}), 400

    parsed, err = read_csv_upload(upload)
    if err:
        return err
    reader, fieldnames = parsed

    required = ["dance", "name"]
    missing = [c for c in required if c not in fieldnames]
    if missing:
        return jsonify({
            "error": f"Fehlende Spalten: {', '.join(missing)}. "
                     f"Erwartet: {', '.join(SEQUENCE_CSV_COLUMNS)}"
        }), 400

    conn = get_connection()
    try:
        dance_rows = conn.execute("SELECT id, name FROM dances").fetchall()
        dances_by_name = {r["name"].strip().lower(): r["id"] for r in dance_rows}

        existing = conn.execute(
            "SELECT s.name, d.name AS dance_name "
            "FROM sequences s JOIN dances d ON d.id = s.dance_id "
            "WHERE s.course_id = ?",
            (course_id,),
        ).fetchall()
        existing_keys = {
            (r["dance_name"].strip().lower(), r["name"].strip().lower())
            for r in existing
        }

        created = 0
        skipped = []
        errors = []

        def cell(row, key):
            src = fieldnames.get(key)
            if src is None:
                return ""
            return (row.get(src) or "").strip()

        for idx, row in enumerate(reader, start=2):
            dance_name = cell(row, "dance")
            name = cell(row, "name")

            if not name:
                errors.append(f"Zeile {idx}: Name fehlt")
                continue
            if not dance_name:
                errors.append(f"Zeile {idx} ({name}): Tanz fehlt")
                continue
            dance_id = dances_by_name.get(dance_name.lower())
            if not dance_id:
                errors.append(
                    f"Zeile {idx} ({name}): Tanz '{dance_name}' nicht gefunden"
                )
                continue

            key = (dance_name.lower(), name.lower())
            if key in existing_keys:
                skipped.append(f"{name} ({dance_name})")
                continue

            visible_raw = cell(row, "visible")
            visible = 1 if (not visible_raw or parse_bool(visible_raw)) else 0

            conn.execute(
                "INSERT INTO sequences (course_id, dance_id, name, figures, "
                "description, visible) VALUES (?,?,?,?,?,?)",
                (
                    course_id,
                    dance_id,
                    name,
                    cell(row, "figures") or None,
                    cell(row, "description") or None,
                    visible,
                ),
            )
            existing_keys.add(key)
            created += 1

        conn.commit()
        return jsonify({
            "created": created,
            "skipped": skipped,
            "errors": errors,
        })
    finally:
        conn.close()


@bp.put("/api/sequences/<int:course_id>/visibility")
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

"""Historie: CRUD + CSV-Import/Export."""

import csv
import io
from datetime import datetime

from flask import Blueprint, Response, jsonify, request

from _shared import ensure_course_access, read_csv_upload
from auth import auth_required
from database import get_connection


bp = Blueprint("history", __name__)


HISTORY_CSV_COLUMNS = ["date", "warmup", "lesson", "cooldown"]


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


@bp.get("/api/history/<int:course_id>/export")
@auth_required(roles=["admin"])
def export_history(course_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT date, warmup, lesson, cooldown FROM history "
            "WHERE course_id = ? ORDER BY date ASC, id ASC",
            (course_id,),
        ).fetchall()
    finally:
        conn.close()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(HISTORY_CSV_COLUMNS)
    for r in rows:
        writer.writerow([
            r["date"] or "",
            r["warmup"] or "",
            r["lesson"] or "",
            r["cooldown"] or "",
        ])

    csv_text = "﻿" + buffer.getvalue()
    filename = f"historie-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@bp.post("/api/history/<int:course_id>/import")
@auth_required(roles=["admin"])
def import_history(course_id):
    upload = request.files.get("file")
    if not upload:
        return jsonify({"error": "Keine Datei hochgeladen"}), 400

    parsed, err = read_csv_upload(upload)
    if err:
        return err
    reader, fieldnames = parsed

    if "date" not in fieldnames:
        return jsonify({
            "error": f"Fehlende Spalte: date. "
                     f"Erwartet: {', '.join(HISTORY_CSV_COLUMNS)}"
        }), 400

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT date FROM history WHERE course_id = ?",
            (course_id,),
        ).fetchall()
        existing_dates = {r["date"] for r in existing if r["date"]}

        created = 0
        skipped = []
        errors = []

        def cell(row, key):
            src = fieldnames.get(key)
            if src is None:
                return ""
            return (row.get(src) or "").strip()

        for idx, row in enumerate(reader, start=2):
            date = cell(row, "date")
            if not date:
                errors.append(f"Zeile {idx}: Datum fehlt")
                continue
            if date in existing_dates:
                skipped.append(date)
                continue

            conn.execute(
                "INSERT INTO history (course_id, date, warmup, lesson, cooldown) "
                "VALUES (?,?,?,?,?)",
                (
                    course_id,
                    date,
                    cell(row, "warmup"),
                    cell(row, "lesson"),
                    cell(row, "cooldown"),
                ),
            )
            existing_dates.add(date)
            created += 1

        conn.commit()
        return jsonify({
            "created": created,
            "skipped": skipped,
            "errors": errors,
        })
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

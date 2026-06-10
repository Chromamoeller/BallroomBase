"""Anwesenheit + 4er-Karten: CRUD, CSV, Bezahl-Status, Neu-Berechnung."""

import csv
import io
from datetime import datetime, timezone

from flask import Blueprint, Response, jsonify, request

from _shared import (
    ensure_course_access,
    parse_bool,
    read_csv_upload,
    recompute_all_four_cards,
)
from auth import auth_required
from database import get_connection


bp = Blueprint("attendance", __name__)


ATTENDANCE_CSV_COLUMNS = ["date", "username", "present"]


@bp.get("/api/attendance/<int:course_id>")
@auth_required()
def get_attendance(course_id):
    if not ensure_course_access(request.current_user, course_id):
        return jsonify({"error": "Keine Berechtigung"}), 403
    requester_id = request.current_user["id"]
    conn = get_connection()
    try:
        users = conn.execute(
            "SELECT id, username, has_four_card FROM users WHERE course_id = ? AND role = 'teilnehmer' "
            "ORDER BY username",
            (course_id,),
        ).fetchall()
        dates = conn.execute(
            "SELECT id, date FROM attendance WHERE course_id = ? ORDER BY date DESC LIMIT 4",
            (course_id,),
        ).fetchall()
        date_rows = list(reversed([dict(d) for d in dates]))

        entries = {}
        if date_rows:
            ids = [d["id"] for d in date_rows]
            placeholders = ",".join("?" for _ in ids)
            rows = conn.execute(
                f"SELECT attendance_id, user_id, present, hours FROM attendance_entries "
                f"WHERE attendance_id IN ({placeholders})",
                ids,
            ).fetchall()
            for r in rows:
                hours = r["hours"] if r["user_id"] == requester_id else None
                entries[(r["attendance_id"], r["user_id"])] = {
                    "present": bool(r["present"]),
                    "hours": hours,
                }

        users_data = []
        for u in users:
            row = {
                "id": u["id"],
                "username": u["username"],
                "hasFourCard": bool(u["has_four_card"]),
                "entries": {},
            }
            for d in date_rows:
                e = entries.get((d["id"], u["id"]))
                row["entries"][d["id"]] = e or {"present": False, "hours": None}
            users_data.append(row)

        my_card = None
        me = conn.execute(
            "SELECT has_four_card, four_card_hours, four_card_paid_at "
            "FROM users WHERE id = ?",
            (requester_id,),
        ).fetchone()
        if me and me["has_four_card"]:
            my_card = {
                "hoursUsed": me["four_card_hours"],
                "displayHours": f"{me['four_card_hours']}/4",
                "paid": me["four_card_paid_at"] is not None,
                "paidAt": me["four_card_paid_at"],
                "needsPayment": me["four_card_hours"] >= 4
                and me["four_card_paid_at"] is None,
            }

        return jsonify({
            "dates": date_rows,
            "users": users_data,
            "myCard": my_card,
        })
    finally:
        conn.close()


@bp.get("/api/four-cards/<int:course_id>")
@auth_required(roles=["admin"])
def get_four_cards(course_id):
    conn = get_connection()
    try:
        users = conn.execute(
            "SELECT id, username, four_card_hours, four_card_paid_at FROM users "
            "WHERE course_id = ? AND role = 'teilnehmer' AND has_four_card = 1 "
            "ORDER BY username",
            (course_id,),
        ).fetchall()
        return jsonify([
            {
                "userId": u["id"],
                "username": u["username"],
                "hoursUsed": u["four_card_hours"],
                "displayHours": f"{u['four_card_hours']}/4",
                "paid": u["four_card_paid_at"] is not None,
                "paidAt": u["four_card_paid_at"],
                "needsPayment": u["four_card_hours"] >= 4
                and u["four_card_paid_at"] is None,
            }
            for u in users
        ])
    finally:
        conn.close()


@bp.put("/api/four-cards/<int:course_id>/<int:user_id>/paid")
@auth_required(roles=["admin"])
def set_four_card_paid(course_id, user_id):
    data = request.get_json(silent=True) or {}
    paid = bool(data.get("paid"))
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM users WHERE id = ? AND course_id = ? "
            "AND has_four_card = 1",
            (user_id, course_id),
        ).fetchone()
        if not row:
            return jsonify({"error": "Nutzer nicht gefunden"}), 404
        if paid:
            now = datetime.now(timezone.utc).isoformat(timespec="seconds")
            conn.execute(
                "UPDATE users SET four_card_paid_at = ? WHERE id = ?",
                (now, user_id),
            )
        else:
            conn.execute(
                "UPDATE users SET four_card_paid_at = NULL WHERE id = ?",
                (user_id,),
            )
        conn.commit()
        updated = conn.execute(
            "SELECT four_card_hours, four_card_paid_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return jsonify({
            "userId": user_id,
            "hoursUsed": updated["four_card_hours"],
            "displayHours": f"{updated['four_card_hours']}/4",
            "paid": updated["four_card_paid_at"] is not None,
            "paidAt": updated["four_card_paid_at"],
            "needsPayment": updated["four_card_hours"] >= 4
            and updated["four_card_paid_at"] is None,
        })
    finally:
        conn.close()


@bp.post("/api/four-cards/<int:course_id>/recompute")
@auth_required(roles=["admin"])
def recompute_four_cards(course_id):
    """Synchronisiert alle 4er-Karten-Snapshots eines Kurses mit der Anwesenheits-Historie."""
    conn = get_connection()
    try:
        recompute_all_four_cards(conn, course_id)
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@bp.get("/api/attendance/<int:course_id>/all")
@auth_required(roles=["admin"])
def get_all_attendance(course_id):
    conn = get_connection()
    try:
        dates = conn.execute(
            "SELECT id, date FROM attendance WHERE course_id = ? "
            "ORDER BY date ASC, id ASC",
            (course_id,),
        ).fetchall()
        date_rows = [dict(d) for d in dates]
        if not date_rows:
            return jsonify([])

        ids = [d["id"] for d in date_rows]
        placeholders = ",".join("?" for _ in ids)
        entry_rows = conn.execute(
            f"SELECT ae.attendance_id, ae.user_id, ae.present, ae.hours, "
            f"u.username, u.has_four_card "
            f"FROM attendance_entries ae JOIN users u ON u.id = ae.user_id "
            f"WHERE ae.attendance_id IN ({placeholders}) "
            f"ORDER BY u.username",
            ids,
        ).fetchall()

        by_date: dict[int, list] = {d["id"]: [] for d in date_rows}
        for r in entry_rows:
            by_date[r["attendance_id"]].append({
                "userId": r["user_id"],
                "username": r["username"],
                "hasFourCard": bool(r["has_four_card"]),
                "present": bool(r["present"]),
                "hours": r["hours"],
            })

        return jsonify([
            {
                "id": d["id"],
                "date": d["date"],
                "entries": by_date[d["id"]],
            }
            for d in date_rows
        ])
    finally:
        conn.close()


@bp.get("/api/attendance/<int:course_id>/export")
@auth_required(roles=["admin"])
def export_attendance(course_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT a.date, u.username, ae.present "
            "FROM attendance_entries ae "
            "JOIN attendance a ON a.id = ae.attendance_id "
            "JOIN users u ON u.id = ae.user_id "
            "WHERE a.course_id = ? "
            "ORDER BY a.date ASC, a.id ASC, u.username ASC",
            (course_id,),
        ).fetchall()
    finally:
        conn.close()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(ATTENDANCE_CSV_COLUMNS)
    for r in rows:
        writer.writerow([
            r["date"] or "",
            r["username"],
            "1" if r["present"] else "0",
        ])

    csv_text = "﻿" + buffer.getvalue()
    filename = f"anwesenheit-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@bp.post("/api/attendance/<int:course_id>/import")
@auth_required(roles=["admin"])
def import_attendance(course_id):
    upload = request.files.get("file")
    if not upload:
        return jsonify({"error": "Keine Datei hochgeladen"}), 400

    parsed, err = read_csv_upload(upload)
    if err:
        return err
    reader, fieldnames = parsed

    required = ["date", "username", "present"]
    missing = [c for c in required if c not in fieldnames]
    if missing:
        return jsonify({
            "error": f"Fehlende Spalten: {', '.join(missing)}. "
                     f"Erwartet: {', '.join(ATTENDANCE_CSV_COLUMNS)}"
        }), 400

    conn = get_connection()
    try:
        user_rows = conn.execute(
            "SELECT id, username FROM users WHERE course_id = ?",
            (course_id,),
        ).fetchall()
        users_by_name = {r["username"].strip().lower(): r["id"] for r in user_rows}

        existing = conn.execute(
            "SELECT id, date FROM attendance WHERE course_id = ?",
            (course_id,),
        ).fetchall()
        existing_dates = {r["date"]: r["id"] for r in existing if r["date"]}

        def cell(row, key):
            src = fieldnames.get(key)
            if src is None:
                return ""
            return (row.get(src) or "").strip()

        grouped: dict[str, list] = {}
        row_errors = []

        for idx, row in enumerate(reader, start=2):
            date = cell(row, "date")
            username = cell(row, "username")
            present_raw = cell(row, "present")

            if not date:
                row_errors.append(f"Zeile {idx}: Datum fehlt")
                continue
            if not username:
                row_errors.append(f"Zeile {idx}: Benutzername fehlt")
                continue
            user_id = users_by_name.get(username.lower())
            if not user_id:
                row_errors.append(
                    f"Zeile {idx} ({username}): Nutzer im Kurs nicht gefunden"
                )
                continue

            grouped.setdefault(date, []).append({
                "user_id": user_id,
                "present": 1 if parse_bool(present_raw) else 0,
            })

        created_dates = 0
        updated_dates = []
        entries_added = 0
        entries_skipped = 0

        for date, entries in grouped.items():
            attendance_id = existing_dates.get(date)
            if attendance_id is None:
                cur = conn.execute(
                    "INSERT INTO attendance (course_id, date) VALUES (?, ?)",
                    (course_id, date),
                )
                attendance_id = cur.lastrowid
                created_dates += 1
                existing_user_ids = set()
            else:
                existing_entries = conn.execute(
                    "SELECT user_id FROM attendance_entries WHERE attendance_id = ?",
                    (attendance_id,),
                ).fetchall()
                existing_user_ids = {r["user_id"] for r in existing_entries}

            added_here = 0
            for e in entries:
                if e["user_id"] in existing_user_ids:
                    entries_skipped += 1
                    continue
                conn.execute(
                    "INSERT INTO attendance_entries "
                    "(attendance_id, user_id, present, hours) VALUES (?,?,?,?)",
                    (attendance_id, e["user_id"], e["present"], None),
                )
                existing_user_ids.add(e["user_id"])
                entries_added += 1
                added_here += 1

            if added_here > 0 and date in existing_dates:
                updated_dates.append(date)

        if entries_added > 0:
            recompute_all_four_cards(conn, course_id)

        conn.commit()
        return jsonify({
            "created": created_dates,
            "updated": updated_dates,
            "entriesAdded": entries_added,
            "entriesSkipped": entries_skipped,
            "skipped": [],
            "errors": row_errors,
        })
    finally:
        conn.close()


@bp.delete("/api/attendance/<int:course_id>/<int:attendance_id>")
@auth_required(roles=["admin"])
def delete_attendance(course_id, attendance_id):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM attendance WHERE id = ? AND course_id = ?",
            (attendance_id, course_id),
        ).fetchone()
        if not existing:
            return jsonify({"error": "Nicht gefunden"}), 404

        conn.execute(
            "DELETE FROM attendance_entries WHERE attendance_id = ?",
            (attendance_id,),
        )
        conn.execute("DELETE FROM attendance WHERE id = ?", (attendance_id,))

        recompute_all_four_cards(conn, course_id)

        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@bp.post("/api/attendance/<int:course_id>")
@auth_required(roles=["admin"])
def add_attendance(course_id):
    data = request.get_json(silent=True) or {}
    date = (data.get("date") or "").strip()
    entries = data.get("entries") or []
    if not date:
        return jsonify({"error": "Datum erforderlich"}), 400

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM attendance WHERE course_id = ? AND date = ?",
            (course_id, date),
        ).fetchone()
        if existing:
            attendance_id = existing["id"]
            conn.execute(
                "DELETE FROM attendance_entries WHERE attendance_id = ?",
                (attendance_id,),
            )
        else:
            cur = conn.execute(
                "INSERT INTO attendance (course_id, date) VALUES (?, ?)",
                (course_id, date),
            )
            attendance_id = cur.lastrowid

        for e in entries:
            user_id = e.get("userId")
            if user_id is None:
                continue
            present = 1 if e.get("present") else 0
            conn.execute(
                "INSERT INTO attendance_entries (attendance_id, user_id, present, hours) "
                "VALUES (?,?,?,?)",
                (attendance_id, user_id, present, None),
            )

        recompute_all_four_cards(conn, course_id)

        conn.commit()
        return jsonify({"id": attendance_id}), 201
    finally:
        conn.close()

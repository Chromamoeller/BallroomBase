"""Gemeinsam genutzte Helfer für die Route-Module."""

import csv
import io


def ensure_course_access(user, course_id):
    if user["role"] == "admin":
        return True
    return user["course_id"] == course_id


def parse_bool(value):
    if value is None:
        return False
    v = str(value).strip().lower()
    return v in ("1", "true", "ja", "yes", "y", "x")


def parse_csv(raw):
    """Parst CSV-Text und gibt (reader, fieldnames_map, None) zurück oder
    (None, None, fehlermeldung) im Fehlerfall. `fieldnames_map` bildet die
    kleingeschriebenen Spaltennamen auf die Originalnamen ab."""
    if not raw.strip():
        return None, None, "Datei ist leer"

    sample = raw[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel

    reader = csv.DictReader(io.StringIO(raw), dialect=dialect)
    if not reader.fieldnames:
        return None, None, "Keine Spaltenüberschriften gefunden"

    fieldnames = {name.strip().lower(): name for name in reader.fieldnames if name}
    return reader, fieldnames, None


def recompute_four_card(conn, user_id):
    """Leitet `four_card_hours` und alle `hours`-Snapshots aus der Anwesenheits-
    Historie ab. Beim 5. Anwesenheits-Häkchen wird die Karte automatisch neu
    gestartet (Wrap 4 → 1). Tritt ein neuer Wrap auf (= Wrap-Zähler erhöht sich
    gegenüber dem zuletzt gespeicherten Wert), wird der Bezahl-Status auf
    "nicht bezahlt" zurückgesetzt — die neue Karte muss vom Admin manuell
    wieder als bezahlt markiert werden."""
    user_row = conn.execute(
        "SELECT has_four_card, four_card_wraps FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not user_row or not user_row["has_four_card"]:
        conn.execute(
            "UPDATE attendance_entries SET hours = NULL WHERE user_id = ?",
            (user_id,),
        )
        conn.execute(
            "UPDATE users SET four_card_hours = 0, four_card_paid_at = NULL, "
            "four_card_wraps = 0 WHERE id = ?",
            (user_id,),
        )
        return

    stored_wraps = user_row["four_card_wraps"]

    rows = conn.execute(
        "SELECT ae.id, ae.present FROM attendance_entries ae "
        "JOIN attendance a ON a.id = ae.attendance_id "
        "WHERE ae.user_id = ? "
        "ORDER BY a.date ASC, a.id ASC, ae.id ASC",
        (user_id,),
    ).fetchall()

    counter = 0
    wraps = 0
    for row in rows:
        if row["present"]:
            if counter >= 4:
                counter = 1
                wraps += 1
            else:
                counter += 1
            conn.execute(
                "UPDATE attendance_entries SET hours = ? WHERE id = ?",
                (f"{counter}/4", row["id"]),
            )
        else:
            conn.execute(
                "UPDATE attendance_entries SET hours = NULL WHERE id = ?",
                (row["id"],),
            )

    if wraps > stored_wraps:
        conn.execute(
            "UPDATE users SET four_card_paid_at = NULL WHERE id = ?",
            (user_id,),
        )

    conn.execute(
        "UPDATE users SET four_card_hours = ?, four_card_wraps = ? WHERE id = ?",
        (counter, wraps, user_id),
    )


def recompute_all_four_cards(conn, course_id):
    ids = conn.execute(
        "SELECT id FROM users WHERE course_id = ? AND has_four_card = 1",
        (course_id,),
    ).fetchall()
    for r in ids:
        recompute_four_card(conn, r["id"])

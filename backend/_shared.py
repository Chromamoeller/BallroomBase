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


def increment_four_card(conn, user_id):
    """Zählt die 4er-Karte des Nutzers um eine Stunde hoch (Modell: laufender
    Zähler). Der gespeicherte `four_card_hours`-Stand ist maßgeblich und wird
    NICHT aus der Anwesenheits-Historie neu abgeleitet. Beim Übergang von 4 auf
    die nächste Anwesenheit springt die Karte auf 1 (neue Karte), der Wrap-
    Zähler erhöht sich und der Bezahl-Status wird auf "nicht bezahlt"
    zurückgesetzt — die neue Karte muss vom Admin wieder als bezahlt markiert
    werden. Gibt das Label '<n>/4' zurück oder None, wenn der Nutzer keine
    4er-Karte hat."""
    row = conn.execute(
        "SELECT has_four_card, four_card_hours, four_card_wraps "
        "FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not row or not row["has_four_card"]:
        return None

    hours = row["four_card_hours"] or 0
    wraps = row["four_card_wraps"] or 0
    if hours >= 4:
        hours = 1
        wraps += 1
        conn.execute(
            "UPDATE users SET four_card_hours = ?, four_card_wraps = ?, "
            "four_card_paid_at = NULL WHERE id = ?",
            (hours, wraps, user_id),
        )
    else:
        hours += 1
        conn.execute(
            "UPDATE users SET four_card_hours = ? WHERE id = ?",
            (hours, user_id),
        )
    return f"{hours}/4"

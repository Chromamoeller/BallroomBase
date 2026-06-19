import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH") or os.path.join(BASE_DIR, "danceorga.db")


def get_connection():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'teilnehmer')),
    course_id INTEGER NOT NULL,
    has_four_card INTEGER NOT NULL DEFAULT 0,
    four_card_hours INTEGER NOT NULL DEFAULT 0,
    four_card_paid_at TEXT,
    four_card_wraps INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (course_id) REFERENCES courses(id)
);

CREATE TABLE IF NOT EXISTS dances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS figures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    dance_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    difficulty TEXT,
    video_url TEXT,
    steps TEXT,
    count_steps TEXT,
    footwork TEXT,
    amount_of_turn TEXT,
    precedes TEXT,
    follows TEXT,
    visible INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (dance_id) REFERENCES dances(id)
);

CREATE TABLE IF NOT EXISTS sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    dance_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    figures TEXT,
    description TEXT,
    visible INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (dance_id) REFERENCES dances(id)
);

CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    warmup TEXT,
    lesson TEXT,
    cooldown TEXT,
    FOREIGN KEY (course_id) REFERENCES courses(id)
);

CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    UNIQUE(course_id, date)
);

CREATE TABLE IF NOT EXISTS attendance_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attendance_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    present INTEGER NOT NULL DEFAULT 0,
    hours TEXT,
    FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(attendance_id, user_id)
);

-- Eigenständige Kursangebote (getrennt von der `courses`-Tabelle, die nur
-- Nutzer/Figuren gruppiert). Teilnehmer sind hier reine Strings ohne Account.
CREATE TABLE IF NOT EXISTS course_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    time TEXT,
    start_date TEXT,
    hours INTEGER
);

CREATE TABLE IF NOT EXISTS course_program_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    paid INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (program_id) REFERENCES course_programs(id) ON DELETE CASCADE
);
"""


def init_db():
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        existing_fig_columns = [row["name"] for row in conn.execute("PRAGMA table_info(figures)").fetchall()]
        existing_seq_columns = [row["name"] for row in conn.execute("PRAGMA table_info(sequences)").fetchall()]
        existing_user_columns = [row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "four_card_hours" not in existing_user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN four_card_hours INTEGER NOT NULL DEFAULT 0")
        if "four_card_paid_at" not in existing_user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN four_card_paid_at TEXT")
        if "four_card_wraps" not in existing_user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN four_card_wraps INTEGER NOT NULL DEFAULT 0")
        for column, definition in [
            ("steps", "TEXT"),
            ("count_steps", "TEXT"),
            ("footwork", "TEXT"),
            ("amount_of_turn", "TEXT"),
            ("precedes", "TEXT"),
            ("follows", "TEXT"),
            ("visible", "INTEGER NOT NULL DEFAULT 1"),
        ]:
            if column not in existing_fig_columns:
                conn.execute(f"ALTER TABLE figures ADD COLUMN {column} {definition}")
        if "visible" not in existing_seq_columns:
            conn.execute("ALTER TABLE sequences ADD COLUMN visible INTEGER NOT NULL DEFAULT 1")
        conn.execute("UPDATE figures SET visible = 1 WHERE visible IS NULL")
        conn.execute("UPDATE sequences SET visible = 1 WHERE visible IS NULL")
        conn.commit()
    finally:
        conn.close()
